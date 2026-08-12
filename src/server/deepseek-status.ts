import { statSync } from "node:fs"
import { connect } from "node:net"
import { request as httpsRequest } from "node:https"
import { connect as tlsConnect } from "node:tls"
import type {
  DeepSeekStatusComponent,
  DeepSeekStatusIncident,
  DeepSeekStatusLevel,
  DeepSeekStatusSection,
  DeepSeekStatusSnapshot,
  DeepSeekStatusUpdate,
} from "../shared/types"

/**
 * DeepSeek 官方状态页（status.deepseek.com）。
 *
 * 该页面由 Flashcat 支撑的 Next.js 应用渲染，没有公开的 JSON API（
 * `/api/v2/summary.json` 返回 RouteNotFound），全部数据以 RSC flight
 * 流的形式内嵌在 HTML 里。这里拉取页面 HTML，解析 `self.__next_f.push`
 * 数据块，还原 flight 流后从 `initialPageConfig` / `initialData` /
 * `initialCalendarData` 三段 JSON 中提取：整体状态、组件列表与当前状态、
 * 90 天可用率、事件（incident / maintenance）与更新时间线。
 */

export const DEEPSEEK_STATUS_URL = "https://status.deepseek.com/"

/** 直连失败后依次尝试的本机代理端口（Clash 等常见默认值）。 */
const LOCAL_PROXY_PORTS = [7897, 7890, 1087, 8080]

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"

// ---------------------------------------------------------------------------
// 抓取：优先环境变量代理，其次直连，最后回退本机常见代理端口
// ---------------------------------------------------------------------------

interface ProxyTarget {
  host: string
  port: number
}

function envProxy(): ProxyTarget | null {
  const raw = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy
  if (!raw) return null
  try {
    const url = new URL(raw)
    const port = Number(url.port || (url.protocol === "http:" ? 80 : 443))
    if (!url.hostname || !port) return null
    return { host: url.hostname, port }
  } catch {
    return null
  }
}

/** 通过 HTTP CONNECT 隧道 + TLS 发起 GET（node:net + node:tls，Bun 环境下可用）。 */
function fetchViaBunTunnel(url: string, proxy: ProxyTarget, timeoutMs = 8_000): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const u = new URL(url)
    const proxySocket = connect({ host: proxy.host, port: proxy.port })
    const timer = setTimeout(() => {
      proxySocket.destroy()
      reject(new Error(`proxy CONNECT timeout (${proxy.host}:${proxy.port})`))
    }, timeoutMs)

    proxySocket.once("error", (e) => {
      clearTimeout(timer)
      reject(e)
    })
    proxySocket.once("connect", () => {
      proxySocket.write(`CONNECT ${u.host}:443 HTTP/1.1\r\nHost: ${u.host}:443\r\n\r\n`)
    })

    let buffered = ""
    const onFirstData = (chunk: Buffer) => {
      buffered += chunk.toString("latin1")
      const idx = buffered.indexOf("\r\n\r\n")
      if (idx === -1) return
      const statusLine = buffered.slice(0, idx)
      if (!/ 200 /.test(statusLine)) {
        clearTimeout(timer)
        proxySocket.destroy()
        reject(new Error(`proxy CONNECT failed: ${statusLine.split("\r\n")[0]}`))
        return
      }
      proxySocket.removeListener("data", onFirstData)
      const leftover = Buffer.from(buffered.slice(idx + 4), "latin1")

      const tlsSocket = tlsConnect({ socket: proxySocket, servername: u.host }, () => {
        const req = httpsRequest(
          {
            createConnection: () => tlsSocket,
            method: "GET",
            path: u.pathname + u.search,
            host: u.host,
            headers: { Host: u.host, Accept: "text/html", "User-Agent": USER_AGENT, "Accept-Encoding": "identity" },
          },
          (res) => {
            const chunks: Buffer[] = []
            res.on("data", (c) => chunks.push(c as Buffer))
            res.on("end", () => {
              clearTimeout(timer)
              resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") })
            })
          },
        )
        req.on("error", (e) => {
          clearTimeout(timer)
          reject(e)
        })
        if (leftover.length) req.emit("data", leftover)
        req.end()
      })
      tlsSocket.on("error", (e: Error) => {
        clearTimeout(timer)
        reject(e)
      })
    }
    proxySocket.on("data", onFirstData)
  })
}

/** 直连（Bun 原生 fetch，受网络环境影响；超时由 AbortSignal 保证）。 */
async function fetchDirect(url: string): Promise<{ status: number; body: string }> {
  const res = await fetch(url, {
    headers: { Accept: "text/html", "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(8_000),
  })
  return { status: res.status, body: await res.text() }
}

/**
 * 查找可用的 Node 可执行文件。部分网络会按 TLS 指纹拦截 Bun/curl 的握手，
 * 但 Node 的 OpenSSL 栈可以正常建立连接；此时用 `node -e` 子进程兜底。
 */
function resolveNodeBinary(): string | null {
  const candidates = [
    process.env.NODE_BIN,
    "/opt/homebrew/bin/node",
    "/usr/local/bin/node",
    "/usr/bin/node",
  ].filter((candidate): candidate is string => Boolean(candidate))
  for (const candidate of candidates) {
    try {
      statSync(candidate)
      return candidate
    } catch {}
  }
  try {
    const which = Bun.which("node")
    if (which) return which
  } catch {}
  return null
}

/** Node 子进程内建脚本：直连 → 环境变量代理 → 本机代理端口。 */
const NODE_FETCH_SCRIPT = String.raw`
const https = require("https");
const net = require("net");
const tls = require("tls");
const { execFileSync } = require("child_process");
const url = process.argv[1];
const u = new URL(url);
const userAgent = process.argv[2] || "Mozilla/5.0";
const envProxy = (process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy || "").trim();
const localPorts = [7897, 7890, 1087, 8080];

function tunnelFetch(proxyHost, proxyPort) {
  return new Promise((resolve, reject) => {
    const proxy = net.connect({ host: proxyHost, port: proxyPort });
    let buffered = "";
    let settled = false;
    const timer = setTimeout(() => { proxy.destroy(); reject(new Error("timeout")); }, 12000);
    proxy.once("error", (e) => { clearTimeout(timer); reject(e); });
    proxy.once("connect", () => {
      proxy.write("CONNECT " + u.host + ":443 HTTP/1.1\r\nHost: " + u.host + ":443\r\n\r\n");
    });
    proxy.once("data", function onFirst(chunk) {
      buffered += chunk.toString("latin1");
      const idx = buffered.indexOf("\r\n\r\n");
      if (idx === -1) return;
      if (!/ 200 /.test(buffered.slice(0, idx))) {
        clearTimeout(timer); proxy.destroy();
        reject(new Error("CONNECT " + buffered.split("\r\n")[0]));
        return;
      }
      proxy.removeListener("data", onFirst);
      const leftover = Buffer.from(buffered.slice(idx + 4), "latin1");
      const tlsSock = tls.connect({ socket: proxy, servername: u.host }, () => {
        const req = https.request({
          createConnection: () => tlsSock,
          method: "GET", path: u.pathname + u.search, host: u.host,
          headers: { Host: u.host, "User-Agent": userAgent, "Accept-Encoding": "identity" },
        }, (res) => {
          const chunks = [];
          res.on("data", (c) => chunks.push(c));
          res.on("end", () => { clearTimeout(timer); settled = true; resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString("utf8") }); });
        });
        req.on("error", (e) => { clearTimeout(timer); reject(e); });
        if (leftover.length) req.emit("data", leftover);
        req.end();
      });
      tlsSock.on("error", (e) => { clearTimeout(timer); reject(e); });
    });
  });
}

(async () => {
  const attempts = [];
  if (envProxy) {
    try {
      const p = new URL(envProxy);
      const port = Number(p.port || (p.protocol === "http:" ? 80 : 443));
      const res = await tunnelFetch(p.hostname, port);
      if (res.status === 200 && res.body) { process.stdout.write(res.body); return; }
      attempts.push("env proxy " + res.status);
    } catch (e) { attempts.push("env proxy: " + e.message); }
  }
  try {
    const res = await new Promise((resolve, reject) => {
      const req = https.get(url, { headers: { "User-Agent": userAgent } }, (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString("utf8") }));
      });
      req.on("error", reject);
      req.setTimeout(12000, () => req.destroy(new Error("timeout")));
    });
    if (res.status === 200 && res.body) { process.stdout.write(res.body); return; }
    attempts.push("direct " + res.status);
  } catch (e) { attempts.push("direct: " + e.message); }
  for (const port of localPorts) {
    try {
      const res = await tunnelFetch("127.0.0.1", port);
      if (res.status === 200 && res.body) { process.stdout.write(res.body); return; }
      attempts.push("127.0.0.1:" + port + " " + res.status);
    } catch (e) { attempts.push("127.0.0.1:" + port + ": " + e.message); }
  }
  process.stderr.write("all failed: " + attempts.join(" | "));
  process.exit(1);
})();
`

/** 用 Node 子进程抓取页面（Node 的 TLS 栈能穿过按指纹拦截的网络）。 */
async function fetchViaNodeChild(url: string): Promise<{ status: number; body: string }> {
  const node = resolveNodeBinary()
  if (!node) throw new Error("未找到 Node 运行时")
  const result = Bun.spawnSync({
    cmd: [node, "-e", NODE_FETCH_SCRIPT, url, USER_AGENT],
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env },
    timeout: 20_000,
  })
  if (!result.success) {
    const stderr = new TextDecoder().decode(result.stderr).trim()
    throw new Error(`Node 子进程失败: ${stderr || "unknown"}`)
  }
  return { status: 200, body: new TextDecoder().decode(result.stdout) }
}

async function fetchStatusHtml(): Promise<string> {
  const failures: string[] = []

  // 1. Bun 原生 fetch（直连；设置了 HTTPS_PROXY 时 Bun 也会自动走代理）。
  try {
    const res = await fetchDirect(DEEPSEEK_STATUS_URL)
    if (res.status === 200 && res.body) return res.body
    failures.push(`direct returned ${res.status}`)
  } catch (e) {
    failures.push(`direct: ${(e as Error).message}`)
  }

  // 2. Bun 的 CONNECT 隧道（node:net + node:tls）。
  const proxy = envProxy() ?? { host: "127.0.0.1", port: LOCAL_PROXY_PORTS[0] }
  for (const target of [proxy, ...(proxy.host === "127.0.0.1" ? [] : [{ host: "127.0.0.1", port: LOCAL_PROXY_PORTS[0] }])]) {
    try {
      const res = await fetchViaBunTunnel(DEEPSEEK_STATUS_URL, target)
      if (res.status === 200 && res.body) return res.body
      failures.push(`${target.host}:${target.port} returned ${res.status}`)
    } catch (e) {
      failures.push(`${target.host}:${target.port}: ${(e as Error).message}`)
    }
  }

  // 3. Node 子进程兜底（部分网络按 TLS 指纹拦截，Node 的 OpenSSL 栈可通过）。
  try {
    const res = await fetchViaNodeChild(DEEPSEEK_STATUS_URL)
    if (res.status === 200 && res.body) return res.body
    failures.push(`node child returned ${res.status}`)
  } catch (e) {
    failures.push(`node child: ${(e as Error).message}`)
  }

  throw new Error(failures.join("；") || "无法连接 DeepSeek 状态页")
}

// ---------------------------------------------------------------------------
// 解析：RSC flight 流 → 结构化快照
// ---------------------------------------------------------------------------

/** 提取全部 `self.__next_f.push([1,"..."])` 数据块并解码还原 flight 流。 */
export function extractFlightStream(html: string): string {
  const chunks: string[] = []
  const pushRe = /self\.__next_f\.push\(\[1,("(?:\\.|[^"\\])*")\]\)/g
  let match: RegExpExecArray | null
  while ((match = pushRe.exec(html)) !== null) {
    try {
      chunks.push(JSON.parse(match[1]) as string)
    } catch {
      // 跳过无法解码的块；flight 流内的 JSON 对象不受影响。
    }
  }
  return chunks.join("")
}

/** 从 startIdx 起做括号配平，返回完整的 JSON 对象文本（含首尾花括号）。 */
function extractJsonObject(stream: string, startIdx: number): string | null {
  const brace = stream.indexOf("{", startIdx)
  if (brace < 0) return null
  let depth = 0
  let inString = false
  let escaped = false
  for (let i = brace; i < stream.length; i++) {
    const ch = stream[i]
    if (inString) {
      if (escaped) escaped = false
      else if (ch === "\\") escaped = true
      else if (ch === '"') inString = false
    } else if (ch === '"') {
      inString = true
    } else if (ch === "{") {
      depth += 1
    } else if (ch === "}") {
      depth -= 1
      if (depth === 0) return stream.slice(brace, i + 1)
    }
  }
  return null
}

/** 还原 flight 流内嵌 JSON：`\\` → `\`，`\"` → `"`（`\n` 等 JSON 转义保持不变）。 */
function unescapeFlightJson(text: string): string {
  return text
    .replace(/\\\\/g, "\u0000")
    .replace(/\\"/g, '"')
    .replace(/\u0000/g, "\\")
}

function parseJson<T>(raw: string | null): T | null {
  if (!raw) return null
  try {
    return JSON.parse(unescapeFlightJson(raw)) as T
  } catch {
    return null
  }
}

interface ActiveChange {
  change_id: number
  type: string
  title: string
  status: string
  affected_components?: Array<{ component_id: string; status?: string }>
}

interface InitialPageConfig {
  page_id: number
  name: string
  custom_domain: string
  logo: string
  logo_url: string
  date_view: string
  components: Array<{
    component_id: string
    section_id?: string
    name: string
    description: string
    order_id: number
    available_since_seconds: number
    hide_all?: boolean
  }>
  sections: Array<{
    section_id: string
    name: string
    description: string
    hide_uptime?: boolean
  }>
}

interface ComponentGridData {
  section_uptimes?: Array<{ section_id: string; uptime: number }>
  component_uptimes?: Array<{ component_id: string; section_id: string; uptime: number }>
  component_impacts?: Array<{
    component_id: string
    start_at_seconds: number
    end_at_seconds: number
    status: string
  }>
  linked_changes?: Array<{ id: number; type: string; title: string }>
}

interface CalendarData {
  changes: Array<{
    change_id: number
    type: string
    title: string
    description: string
    status: string
    affected_components: Array<{ component_id: string; name: string; status?: string }>
    start_at_seconds: number
    close_at_seconds?: number
    updates?: Array<{
      update_id: string
      at_seconds: number
      status: string
      description: string
      component_changes?: Array<{ component_id: string; component_name: string; status: string }>
    }>
  }>
  month?: { year: number; month: number }
}

function statusToLevel(status: string | undefined): DeepSeekStatusLevel {
  switch (status) {
    case "operational":
      return "operational"
    case "degraded":
      return "degraded"
    case "partial_outage":
      return "partial_outage"
    case "full_outage":
      return "full_outage"
    case "maintenance":
    case "under_maintenance":
      return "maintenance"
    default:
      return "operational"
  }
}

/** 解析状态页 HTML，产出结构化快照。导出以便测试。 */
export function parseDeepSeekStatusHtml(html: string, fetchedAt = Date.now()): DeepSeekStatusSnapshot {
  const stream = extractFlightStream(html)

  const pageConfig = parseJson<InitialPageConfig>(extractJsonObject(stream, stream.indexOf('"initialPageConfig":')))
  const pageData = parseJson<{ page: InitialPageConfig; active_changes?: ActiveChange[] }>(
    extractJsonObject(stream, stream.indexOf('"initialData":{')),
  )
  const gridData = parseJson<ComponentGridData>(extractJsonObject(stream, stream.lastIndexOf('"initialData":{')))
  const calendar = parseJson<CalendarData>(extractJsonObject(stream, stream.indexOf('"initialCalendarData":{')))

  // 数据更新时间（毫秒）。可能缺失，回退到拉取时间。
  const updatedAtMatch = /"initialDataUpdatedAt":(\d+)/.exec(stream)
  const updatedAt = updatedAtMatch ? Number(updatedAtMatch[1]) : fetchedAt

  const config = pageConfig ?? pageData?.page
  const componentsConfig = config?.components ?? []
  const componentUptimes = new Map(
    (gridData?.component_uptimes ?? []).map((item) => [item.component_id, item.uptime]),
  )
  const sectionUptimes = new Map(
    (gridData?.section_uptimes ?? []).map((item) => [item.section_id, item.uptime]),
  )

  // 当前整体状态与每个组件的当前状态：都来自进行中的事件（active_changes）。
  // 事件本身的 status 是生命周期（investigating…），严重等级要看
  // affected_components[].status（partial_outage / degraded / …）。
  const activeChanges: ActiveChange[] = Array.isArray(pageData?.active_changes) ? pageData!.active_changes! : []
  const severityOrder: DeepSeekStatusLevel[] = ["full_outage", "partial_outage", "degraded", "maintenance", "operational"]
  const componentLevels = new Map<string, DeepSeekStatusLevel>()
  let overallStatus: DeepSeekStatusLevel = "operational"
  const consider = (componentId: string | undefined, rawStatus: string | undefined) => {
    if (!componentId || !rawStatus) return
    const level = statusToLevel(rawStatus)
    const current = componentLevels.get(componentId) ?? "operational"
    if (severityOrder.indexOf(level) < severityOrder.indexOf(current)) {
      componentLevels.set(componentId, level)
    }
    if (severityOrder.indexOf(level) < severityOrder.indexOf(overallStatus)) {
      overallStatus = level
    }
  }
  for (const change of activeChanges) {
    for (const component of change.affected_components ?? []) {
      consider(component.component_id, component.status)
    }
    // 兜底：事件自身状态若可直接映射为等级（如 maintenance）。
    consider(undefined, statusToLevel(change.status) === "operational" ? undefined : change.status)
  }

  // 次级兜底：没有 active_changes 时，看是否有结束时间在未来的冲击（计划维护等）。
  if (componentLevels.size === 0) {
    const nowSeconds = Math.floor(fetchedAt / 1000)
    for (const impact of gridData?.component_impacts ?? []) {
      if (!(impact.end_at_seconds > nowSeconds)) continue
      consider(impact.component_id, impact.status)
    }
  }

  const components: DeepSeekStatusComponent[] = componentsConfig
    .filter((component) => !component.hide_all)
    .map((component) => ({
      id: component.component_id,
      name: component.name,
      description: component.description,
      sectionId: component.section_id,
      orderId: component.order_id,
      status: componentLevels.get(component.component_id) ?? "operational",
      uptime: componentUptimes.get(component.component_id) ?? null,
      availableSinceSeconds: component.available_since_seconds,
    }))
    .sort((a, b) => a.orderId - b.orderId)

  const sections: DeepSeekStatusSection[] = (config?.sections ?? [])
    .filter((section) => !section.hide_uptime)
    .map((section) => ({
      id: section.section_id,
      name: section.name,
      description: section.description,
      uptime: sectionUptimes.get(section.section_id) ?? null,
    }))

  const incidents: DeepSeekStatusIncident[] = (calendar?.changes ?? [])
    .filter((change) => change.type === "incident" || change.type === "maintenance")
    .map((change) => {
      const updates: DeepSeekStatusUpdate[] = (change.updates ?? []).map((update) => ({
        id: update.update_id,
        atSeconds: update.at_seconds,
        status: update.status,
        description: update.description,
        componentChanges: (update.component_changes ?? []).map((changeItem) => ({
          componentId: changeItem.component_id,
          componentName: changeItem.component_name,
          status: changeItem.status,
        })),
      }))
      updates.sort((a, b) => a.atSeconds - b.atSeconds)
      return {
        changeId: change.change_id,
        type: change.type as DeepSeekStatusIncident["type"],
        title: change.title,
        description: change.description,
        status: change.status,
        affectedComponents: change.affected_components.map((item) => ({
          componentId: item.component_id,
          name: item.name,
          status: item.status,
        })),
        startAtSeconds: change.start_at_seconds,
        closeAtSeconds: change.close_at_seconds ?? null,
        updates,
      }
    })
    .sort((a, b) => b.startAtSeconds - a.startAtSeconds)

  return {
    ok: Boolean(config && componentsConfig.length > 0),
    fetchedAt,
    updatedAt,
    page: {
      name: config?.name ?? "DeepSeek",
      customDomain: config?.custom_domain ?? "status.deepseek.com",
      logo: config?.logo ?? "",
      logoUrl: config?.logo_url ?? "https://www.deepseek.com/",
      dateView: config?.date_view ?? "calendar",
    },
    overallStatus,
    activeChanges: activeChanges.length,
    components,
    sections,
    incidents,
    month: calendar?.month,
  }
}

/** 状态快照缓存时长：设置页打开/轮询不需要每次都重抓页面。 */
const STATUS_CACHE_TTL_MS = 60_000

let cachedStatus: DeepSeekStatusSnapshot | null = null
let cachedStatusAt = 0

function emptyStatus(fetchedAt: number): DeepSeekStatusSnapshot {
  return {
    ok: false,
    error: "request_failed",
    fetchedAt,
    updatedAt: fetchedAt,
    page: { name: "DeepSeek", customDomain: "status.deepseek.com", logo: "", logoUrl: "", dateView: "calendar" },
    overallStatus: "operational",
    activeChanges: 0,
    components: [],
    sections: [],
    incidents: [],
  }
}

/** 拉取并解析 DeepSeek 官方状态页（60 秒内复用缓存，force=true 强制刷新）。 */
export async function fetchDeepSeekStatus(force = false): Promise<DeepSeekStatusSnapshot> {
  if (!force && cachedStatus && Date.now() - cachedStatusAt < STATUS_CACHE_TTL_MS) {
    return cachedStatus
  }
  const fetchedAt = Date.now()
  try {
    const html = await fetchStatusHtml()
    const snapshot = parseDeepSeekStatusHtml(html, fetchedAt)
    const result = snapshot.ok ? snapshot : { ...snapshot, ok: false as const, error: "parse_failed" as const }
    cachedStatus = result
    cachedStatusAt = Date.now()
    return result
  } catch {
    const result = emptyStatus(fetchedAt)
    cachedStatus = result
    cachedStatusAt = Date.now()
    return result
  }
}
