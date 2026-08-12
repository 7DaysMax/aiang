import { spawn } from "node:child_process"
import { createInterface } from "node:readline"
import { randomUUID } from "node:crypto"
import { existsSync, mkdirSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import type { Readable, Writable } from "node:stream"
import { normalizeToolCall } from "../shared/tools"
import type { ContextWindowUsageSnapshot, NormalizedToolCall } from "../shared/types"
import { asNumber, asRecord, asString } from "../shared/json"
import type { HarnessEvent, HarnessToolRequest } from "./harness-types"
import { AsyncQueue } from "./async-queue"
import { timestamped } from "./transcript"
import { buildVisionMcpServerSpec, buildVisionSystemHint, VISION_MCP_SERVER_NAME } from "./vision"

/**
 * Reasonix engine — Aiang 的第二个引擎内核（Go 单二进制，DeepSeek 原生）。
 *
 * 通过 Agent Client Protocol (ACP, JSON-RPC over stdio) 驱动
 * `vendor/reasonix/reasonix acp`：会话在引擎侧保持（字节稳定前缀 +
 * append-only + 三档压缩），本文件只负责把 ACP 事件流翻译成 Kanna 的
 * transcript 条目，与 ccb/Codex/Cursor 通道共用同一套前端渲染。
 */

const REASONIX_ACP_PROTOCOL_VERSION = 1
/** reasonix 内置预设已是 deepseek 1M 窗口；这里仅作显示兜底。 */
export const REASONIX_CONTEXT_WINDOW_TOKENS = 1_000_000

/** 最小可注入的进程表面，测试用 fake 无需重建 ChildProcess。 */
export interface ReasonixChildProcess {
  readonly stdin: Writable | null
  readonly stdout: Readable | null
  readonly stderr: Readable | null
  kill(signal?: NodeJS.Signals): boolean
  once(event: "close", listener: (code: number | null) => void): unknown
  once(event: "error", listener: (err: Error) => void): unknown
}

export type SpawnReasonix = (args: {
  argv: string[]
  env: Record<string, string>
}) => ReasonixChildProcess

export function resolveReasonixExecutable(): string {
  const override = process.env.REASONIX_EXECUTABLE?.replace(/^~(?=\/|$)/, homedir())
  if (override) return override

  const binaryName = process.platform === "win32" ? "reasonix.exe" : "reasonix"
  const vendored = join(dirname(fileURLToPath(import.meta.url)), `../../vendor/reasonix/${binaryName}`)
  if (existsSync(vendored)) return vendored

  throw new Error(
    `找不到 Reasonix 引擎（vendor/reasonix/${binaryName}）。请重新安装 Aiang，或通过 REASONIX_EXECUTABLE 指定可执行文件路径。`
  )
}

/** Reasonix 的 state home：隔离到 Aiang 数据目录，不污染 ~/.config/reasonix。 */
export function resolveReasonixHome(): string {
  const override = process.env.REASONIX_HOME?.replace(/^~(?=\/|$)/, homedir())
  if (override) return override
  return join(getClaudeConfigDirLike(), "reasonix")
}

function getClaudeConfigDirLike(): string {
  // 复用 Aiang 的隔离配置目录（~/.aiang），reasonix 会话/配置都落在其下。
  return process.env.AIANG_CONFIG_DIR ?? join(homedir(), ".aiang")
}

/**
 * 生成 user config：显式注册 DeepSeek provider（api.deepseek.com +
 * DEEPSEEK_API_KEY + 1M 窗口）。每次启动都重新写入，不依赖 reasonix 模板
 * 是否保留自定义段；key 落在 REASONIX_HOME/.env（reasonix 只认全局 .env）。
 */
export function buildReasonixConfig(model: string): string {
  const modelId = model.includes("pro") ? "deepseek-v4-pro" : "deepseek-v4-flash"
  const visionHint = buildVisionSystemHint()
  const lines = [
    `default_model = "deepseek"`,
    ``,
    `[agent]`,
    `system_prompt = "You are Aiang, a DeepSeek-native coding agent. Reply in the same language as the user.${visionHint
      ? ` ${visionHint.replaceAll("\n", " ")}`
      : ""}"`,
    ``,
    `[[providers]]`,
    `name = "deepseek"`,
    `kind = "openai"`,
    `base_url = "https://api.deepseek.com"`,
    `models = ["${modelId}"]`,
    `default = "${modelId}"`,
    `api_key_env = "DEEPSEEK_API_KEY"`,
    `context_window = 1000000`,
    ``,
  ]
  // 识图：把 vision MCP server 注册给 reasonix（config.toml 的 [[plugins]]，
  // 每次启动都重写，配置变更自动生效）。命令必须是绝对路径（reasonix 的
  // MCP 子进程不继承交互 shell 的 PATH）。
  const visionSpec = buildVisionMcpServerSpec()
  if (visionSpec) {
    lines.push(
      `# 识图服务：describe_image 工具（设置 → 模型服务 → 识图服务）`,
      `[[plugins]]`,
      `name    = "${VISION_MCP_SERVER_NAME}"`,
      `command = "${visionSpec.command.replaceAll("\\", "\\\\")}"`,
      `args    = [${visionSpec.args.map((arg) => `"${arg.replaceAll("\\", "\\\\")}"`).join(", ")}]`,
      ``,
    )
  }
  return lines.join("\n")
}

/** Reasonix 工具标题 → Kanna NormalizedToolCall（snake_case → Claude 风格名）。 */
export function normalizeReasonixToolCall(
  title: string,
  rawInput: Record<string, unknown>,
  toolId: string,
): NormalizedToolCall | null {
  const input = rawInput ?? {}
  const toolName = reasonixToolName(title)
  if (!toolName) return null
  return normalizeToolCall({ toolName, toolId, input: translateReasonixToolInput(toolName, input) })
}

function reasonixToolName(title: string): string | null {
  switch (title) {
    case "bash": return "Bash"
    case "read_file": return "Read"
    case "write_file": return "Write"
    case "edit_file": return "Edit"
    case "glob": return "Glob"
    case "grep": return "Grep"
    case "web_search": return "WebSearch"
    case "web_fetch": return "WebFetch"
    case "todo_write": return "TodoWrite"
    case "ask": return "AskUserQuestion"
    case "exit_plan_mode": return "ExitPlanMode"
    case "skill":
    case "use_capability": return "Skill"
    case "task":
    case "subagent": return "Task"
    default: return null
  }
}

function translateReasonixToolInput(toolName: string, input: Record<string, unknown>): Record<string, unknown> {
  switch (toolName) {
    case "Read":
      return { file_path: input.path, ...input }
    case "Write":
      return { file_path: input.path, content: input.content, ...input }
    case "Edit":
      return { file_path: input.path, old_string: input.old_string, new_string: input.new_string, ...input }
    case "Glob":
      return { pattern: input.pattern, ...input }
    case "Bash":
      return {
        command: input.command,
        timeout: asNumber(input.timeout) ?? asNumber(input.timeout_ms),
        ...input,
      }
    default:
      return input
  }
}

// ---- ACP JSON-RPC 客户端 ----

interface PendingResponse {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
}

type ServerRequestHandler = (method: string, params: unknown) => Promise<unknown> | unknown

class AcpConnection {
  private seq = 0
  private pending = new Map<number, PendingResponse>()
  private onServerRequest: ServerRequestHandler

  constructor(
    private readonly child: ReasonixChildProcess,
    handlers: { onServerRequest: ServerRequestHandler },
  ) {
    this.onServerRequest = handlers.onServerRequest
  }

  start() {
    const rl = createInterface({ input: this.child.stdout as Readable, crlfDelay: Infinity })
    rl.on("line", (line) => {
      let message: Record<string, unknown>
      try {
        message = JSON.parse(line)
      } catch {
        return
      }
      const id = message.id
      const method = message.method
      if (typeof id === "number" && !method) {
        const pending = this.pending.get(id)
        if (!pending) return
        this.pending.delete(id)
        if (message.error) {
          const record = asRecord(message.error)
          const detail = asString(record?.message) ?? asString(message.error) ?? "reasonix acp request failed"
          const err = new Error(detail)
          pending.reject(err)
        } else {
          pending.resolve(message.result)
        }
        return
      }
      if (typeof method === "string") {
        // 服务器发来的请求（session/request_permission 等）必须回响应。
        if (typeof id === "number") {
          Promise.resolve()
            .then(() => this.onServerRequest(method, message.params))
            .then((result) => {
              this.child.stdin?.write(JSON.stringify({ jsonrpc: "2.0", id, result }) + "\n")
            })
            .catch((error: unknown) => {
              this.child.stdin?.write(JSON.stringify({
                jsonrpc: "2.0",
                id,
                error: { code: -32000, message: error instanceof Error ? error.message : String(error) },
              }) + "\n")
            })
          return
        }
        this.emitNotification(method, message.params)
      }
    })
    this.child.once("error", (error) => {
      this.emitNotification("__child_error__", { error: error.message })
    })
    this.child.once("close", (code) => {
      this.emitNotification("__child_close__", { code })
    })
  }

  private listeners = new Map<string, Array<(params: unknown) => void>>()

  onNotification(method: string, handler: (params: unknown) => void) {
    const list = this.listeners.get(method) ?? []
    list.push(handler)
    this.listeners.set(method, list)
  }

  private emitNotification(method: string, params: unknown) {
    for (const handler of this.listeners.get(method) ?? []) {
      handler(params)
    }
  }

  request(method: string, params: unknown): Promise<unknown> {
    const id = ++this.seq
    const payload = { jsonrpc: "2.0", id, method, params }
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.child.stdin?.write(JSON.stringify(payload) + "\n")
    })
  }

  notify(method: string, params: unknown) {
    this.child.stdin?.write(JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n")
  }

  close() {
    this.child.kill()
  }
}

// ---- 事件转换 ----

interface ReasonixSessionEvents {
  sessionId: string
  queue: AsyncQueue<HarnessEvent>
  status: {
    usage: ContextWindowUsageSnapshot | null
    turnStart: number
  }
  /** 当前回合内已发出的消息序号：thinking/正文合成 messageId 用，tool 边界轮换。 */
  messageSeq: number
}

/**
 * 合成稳定的 messageId：reasonix 的 ACP 协议没有消息 ID，而前端按 messageId
 * 合并相邻的思考/正文分块（否则每个 chunk 都渲染成一条消息）。同一消息内
 * thinking 用 ...000000000000、正文用 ...000000000001，共享基座，前端能据此
 * 把正文识别为「思考后的回复」，只渲染一次模型头部。
 */
function reasonixMessageId(ctx: ReasonixSessionEvents, kind: "thinking" | "text"): string {
  return `reasonix-${ctx.messageSeq}-${kind === "thinking" ? "000000000000" : "000000000001"}`
}

function parseToolResultContent(content: unknown): unknown {
  if (!Array.isArray(content)) return content
  const texts: string[] = []
  for (const block of content) {
    const record = asRecord(block)
    if (!record) continue
    const inner = asRecord(record.content)
    if (inner && typeof inner.text === "string") {
      texts.push(inner.text)
    } else if (typeof record.text === "string") {
      texts.push(record.text)
    }
  }
  return texts.length > 0 ? texts.join("\n") : content
}

export function parseReasonixSessionUpdate(
  update: Record<string, unknown>,
  ctx: ReasonixSessionEvents,
): void {
  const kind = asString(update.sessionUpdate)
  if (!kind) return

  switch (kind) {
    case "available_commands_update":
      return
    case "agent_thought_chunk": {
      const content = asRecord(update.content)
      const text = asString(content?.text)
      if (!text) return
      ctx.queue.push({
        type: "transcript",
        entry: timestamped({ kind: "thinking", messageId: reasonixMessageId(ctx, "thinking"), text }),
      })
      return
    }
    case "agent_message_chunk": {
      const content = asRecord(update.content)
      const text = asString(content?.text)
      if (!text) return
      ctx.queue.push({
        type: "transcript",
        entry: timestamped({ kind: "assistant_text", messageId: reasonixMessageId(ctx, "text"), text }),
      })
      return
    }
    case "tool_call": {
      // tool 边界视为一条新消息：后续思考/正文换一个新的 messageId 基座。
      ctx.messageSeq += 1
      const rawInput = asRecord(update.rawInput) ?? {}
      const tool = normalizeReasonixToolCall(
        asString(update.title) ?? "unknown",
        rawInput,
        asString(update.toolCallId) ?? "call_" + randomUUID(),
      )
      if (!tool) return
      ctx.queue.push({
        type: "transcript",
        entry: timestamped({ kind: "tool_call", tool }),
      })
      return
    }
    case "tool_call_update": {
      const toolId = asString(update.toolCallId) ?? ""
      const completed = update.status === "completed"
      const isError = update.status === "failed"
      if (!completed && !isError) return
      ctx.queue.push({
        type: "transcript",
        entry: timestamped({
          kind: "tool_result",
          toolId,
          content: parseToolResultContent(update.content),
          isError,
        }),
      })
      return
    }
    default:
      return
  }
}

// ---- 会话 ----

export interface StartReasonixSessionArgs {
  cwd: string
  model: string
  apiKey: string
  binaryPath?: string
  spawnReasonix?: SpawnReasonix
  onToolRequest: (request: HarnessToolRequest) => Promise<unknown>
}

export interface ReasonixSessionHandle {
  provider: "reasonix"
  stream: AsyncIterable<HarnessEvent>
  interrupt: () => Promise<void>
  close: () => void
  sendPrompt: (content: string) => Promise<void>
}

export async function startReasonixSession(args: StartReasonixSessionArgs): Promise<ReasonixSessionHandle> {
  const binaryPath = args.binaryPath ?? resolveReasonixExecutable()
  const spawnReasonix = args.spawnReasonix ?? (({ argv, env }) => spawn(argv[0], argv.slice(1), { env }) as unknown as ReasonixChildProcess)
  const reasonixHome = resolveReasonixHome()
  mkdirSync(reasonixHome, { recursive: true })
  // reasonix 优先读 REASONIX_HOME/config.toml（user config），保证每台机器
  // 只认我们生成的 DeepSeek 配置，不依赖项目里的 reasonix.toml。
  try {
    writeFileSync(join(reasonixHome, "config.toml"), buildReasonixConfig(args.model), "utf8")
  } catch {
    // 只读场景降级：仍可运行，但模型/窗口用引擎内置预设。
  }
  // reasonix 的 api_key_env 只从全局 .env（REASONIX_HOME/.env）解析，不读
  // shell 环境变量；把 DeepSeek key 落到这里，引擎才能通过 key 校验。
  try {
    const envPath = join(reasonixHome, ".env")
    const existing = (await import("node:fs")).existsSync(envPath) ? (await import("node:fs")).readFileSync(envPath, "utf8") : ""
    const next = existing
      .split("\n")
      .filter((line) => !line.trim().startsWith("DEEPSEEK_API_KEY="))
      .concat([`DEEPSEEK_API_KEY=${args.apiKey}`])
      .join("\n")
    writeFileSync(envPath, next + "\n", "utf8")
  } catch {
    // 写失败时引擎仍可用环境变量尝试（部分版本支持），不阻断启动。
  }

  const child = spawnReasonix({
    argv: [binaryPath, "acp"],
    env: {
      ...process.env as Record<string, string>,
      DEEPSEEK_API_KEY: args.apiKey,
      REASONIX_HOME: reasonixHome,
      NO_COLOR: "1",
    },
  })

  const queue = new AsyncQueue<HarnessEvent>()
  const conn = new AcpConnection(child, {
    onServerRequest: (method, params) => {
      if (method !== "session/request_permission") {
        return {}
      }
      // 自动放行工具调用（与 ccb 通道的 acceptEdits 一致）；ask 类工具由
      // 引擎以普通工具调用形式呈现，前端照常渲染。
      return { outcome: { outcome: "selected", optionId: "allow_once" } }
    },
  })

  let sessionId = ""
  let closed = false
  const turnStart = Date.now()

  const ctx: ReasonixSessionEvents = {
    sessionId: "",
    queue,
    status: { usage: null, turnStart },
    messageSeq: 0,
  }

  conn.onNotification("session/update", (params) => {
    const record = asRecord(params)
    if (asString(record?.sessionId) && record!.sessionId !== sessionId) {
      sessionId = asString(record!.sessionId) ?? ""
      ctx.sessionId = sessionId
    }
    const update = asRecord(record?.update)
    if (update) {
      parseReasonixSessionUpdate(update, ctx)
    }
  })

  conn.onNotification("_reasonix.io/session/status_update", (params) => {
    const record = asRecord(params)
    const status = asRecord(record?.status)
    const usage = asRecord(status?.usage)
    const turn = asRecord(usage?.turn)
    const promptTokens = asNumber(turn?.promptTokens)
    const completionTokens = asNumber(turn?.completionTokens)
    const cacheHitTokens = asNumber(turn?.cacheHitTokens)
    const cacheMissTokens = asNumber(turn?.cacheMissTokens)
    const reasoningTokens = asNumber(turn?.reasoningTokens)
    if (promptTokens === undefined && completionTokens === undefined) return
    ctx.status.usage = {
      usedTokens: (promptTokens ?? 0) + (completionTokens ?? 0),
      lastInputTokens: promptTokens ?? 0,
      lastOutputTokens: completionTokens ?? 0,
      lastCachedInputTokens: cacheHitTokens ?? 0,
      lastReasoningOutputTokens: reasoningTokens ?? 0,
      maxTokens: REASONIX_CONTEXT_WINDOW_TOKENS,
      compactsAutomatically: true,
      totalProcessedTokens: (promptTokens ?? 0) + (cacheMissTokens ?? 0) + (completionTokens ?? 0),
    } satisfies ContextWindowUsageSnapshot
    queue.push({
      type: "transcript",
      entry: timestamped({ kind: "context_window_updated", usage: ctx.status.usage }),
    })
  })

  conn.onNotification("__child_error__", () => {
    if (!closed) {
      ctx.messageSeq += 1
      queue.push({
        type: "transcript",
        entry: timestamped({
          kind: "result",
          subtype: "error",
          isError: true,
          success: false,
          result: "Reasonix 引擎启动失败",
          durationMs: Date.now() - turnStart,
        }),
      })
    }
  })

  conn.start()

  await conn.request("initialize", {
    protocolVersion: REASONIX_ACP_PROTOCOL_VERSION,
    clientCapabilities: {},
    clientInfo: { name: "aiang", version: "0.63.0" },
  })
  const sessionResult = asRecord(await conn.request("session/new", {
    cwd: args.cwd,
    model: "deepseek",
  }))
  sessionId = asString(sessionResult?.sessionId) ?? ""
  ctx.sessionId = sessionId

  // 合成 system_init：前端用它渲染模型身份/模型切换头部（reasonix 的 ACP
  // 协议本身不推送该事件）。工具面与 ccb 通道保持一致。
  queue.push({
    type: "transcript",
    entry: timestamped({
      kind: "system_init",
      provider: "reasonix",
      model: args.model,
      tools: ["Bash", "Read", "Write", "Edit", "Glob", "Grep", "WebSearch", "WebFetch", "TodoWrite", "Task", "AskUserQuestion", "ExitPlanMode", "Skill"],
      agents: [],
      slashCommands: [],
      mcpServers: [],
    }),
  })

  return {
    provider: "reasonix",
    stream: queue,
    interrupt: async () => {
      if (sessionId) {
        conn.notify("session/cancel", { sessionId })
      }
    },
    close: () => {
      if (closed) return
      closed = true
      if (sessionId) {
        conn.request("session/close", { sessionId }).catch(() => undefined)
      }
      conn.close()
      queue.finish()
    },
    sendPrompt: async (content: string) => {
      const startedAt = Date.now()
      try {
        const result = asRecord(await conn.request("session/prompt", {
          sessionId,
          prompt: [{ type: "text", text: content }],
        }))
        // 回合结束：轮换消息序号，避免下一回合与上一回合的尾部消息共用基座。
        ctx.messageSeq += 1
        const stopReason = asString(result?.stopReason) ?? "end_turn"
        const failed = stopReason === "error" || stopReason === "failed"
        queue.push({
          type: "transcript",
          entry: timestamped({
            kind: "result",
            subtype: failed ? "error" : "success",
            isError: failed,
            success: !failed,
            result: stopReason,
            durationMs: Date.now() - startedAt,
          }),
        })
      } catch (error) {
        // 请求层失败（引擎挂死/连接断开）：转成 error result，避免外层
        // runReasonixSession 干等。会话已关闭（正常 close 路径）则静默。
        if (closed) return
        ctx.messageSeq += 1
        queue.push({
          type: "transcript",
          entry: timestamped({
            kind: "result",
            subtype: "error",
            isError: true,
            success: false,
            result: error instanceof Error ? error.message : String(error),
            durationMs: Date.now() - startedAt,
          }),
        })
      }
    },
  }
}
