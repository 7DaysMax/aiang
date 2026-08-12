#!/usr/bin/env node
/**
 * Aiang 识图 MCP server（stdio，无第三方依赖）。
 *
 * DeepSeek V4 是文本模型，看不懂图片。这个 server 给各 agent 引擎
 * （ccb / codex / reasonix）暴露两个工具：
 *   - describe_image：读已有的图片文件，转成文字描述
 *   - capture_screen：截取当前屏幕，直接返回视觉模型的描述
 * 视觉模型用用户在设置里配置的（千问 DashScope 或 GLM BigModel，
 * OpenAI 兼容 chat/completions）。
 *
 * 配置来源（按优先级）：
 *   1. 环境变量 AIANG_VISION_*（引擎注入）
 *   2. Aiang 设置文件 <dataDir>/settings.json 的 visionService 字段
 *
 * 协议：MCP stdio —— 换行分隔的 JSON-RPC 2.0 消息。
 */
import { readFileSync } from "node:fs"
import { readFile, rm, stat } from "node:fs/promises"
import { spawn } from "node:child_process"
import { homedir, tmpdir } from "node:os"
import { join } from "node:path"

const SERVER_NAME = "youmi_vision"
const SERVER_VERSION = "1.0.0"
const PROTOCOL_VERSION = "2024-11-05"
const MAX_IMAGE_BYTES = 20 * 1024 * 1024
const DEFAULT_TIMEOUT_MS = 60_000
const SCREENSHOT_TIMEOUT_MS = 20_000

const PROVIDER_DEFAULTS = {
  qwen: {
    label: "千问 (DashScope)",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    model: "qwen-vl-max-latest",
  },
  glm: {
    label: "GLM (智谱 BigModel)",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    model: "glm-4v-flash",
  },
}

const MIME_BY_EXTENSION = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".bmp": "image/bmp",
}

function envString(name, fallback = "") {
  const value = process.env[name]
  return typeof value === "string" && value.trim() ? value.trim() : fallback
}

function dataDir() {
  const explicit = envString("AIANG_DATA_DIR")
  if (explicit) return explicit
  const home = process.env.USERPROFILE || homedir()
  const rootName = envString("AIANG_RUNTIME_PROFILE").toLowerCase() === "dev" ? ".aiang-dev" : ".aiang"
  return join(home, rootName, "data")
}

function readSettingsFile() {
  try {
    const text = readFileSync(join(dataDir(), "settings.json"), "utf8")
    const parsed = JSON.parse(text)
    return parsed && typeof parsed === "object" ? parsed : {}
  } catch {
    return {}
  }
}

function loadConfig() {
  const settings = readSettingsFile()
  const raw = settings.visionService && typeof settings.visionService === "object"
    ? settings.visionService
    : {}
  const provider = envString("AIANG_VISION_PROVIDER", raw.provider === "glm" ? "glm" : "qwen")
  const defaults = provider === "glm" ? PROVIDER_DEFAULTS.glm : PROVIDER_DEFAULTS.qwen
  const apiKey = envString("AIANG_VISION_API_KEY", typeof raw.apiKey === "string" ? raw.apiKey : "")
  const baseUrl = envString("AIANG_VISION_BASE_URL", typeof raw.baseUrl === "string" && raw.baseUrl.trim() ? raw.baseUrl : defaults.baseUrl)
  const model = envString("AIANG_VISION_MODEL", typeof raw.model === "string" && raw.model.trim() ? raw.model : defaults.model)
  const enabled = envString("AIANG_VISION_ENABLED", "").toLowerCase() === "true"
    ? true
    : typeof raw.enabled === "boolean" ? raw.enabled : false
  return { enabled, provider, apiKey, baseUrl, model, defaults }
}

async function fileToDataUrl(absolutePath) {
  const stat = await import("node:fs").then((fs) => fs.promises.stat(absolutePath))
  if (!stat.isFile()) throw new Error(`不是文件: ${absolutePath}`)
  if (stat.size > MAX_IMAGE_BYTES) throw new Error(`图片超过 20MB 上限: ${absolutePath}`)
  const bytes = await readFile(absolutePath)
  const ext = (absolutePath.match(/\.[a-zA-Z0-9]+$/) || [""])[0].toLowerCase()
  const mime = MIME_BY_EXTENSION[ext] || "image/png"
  return `data:${mime};base64,${bytes.toString("base64")}`
}

async function describeImage(path, prompt, config) {
  const dataUrl = await fileToDataUrl(path)
  const body = {
    model: config.model,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: prompt || "请用中文详细描述这张图片的内容，包括画面主体、文字、界面元素、报错信息等，尽量具体准确。",
          },
          { type: "image_url", image_url: { url: dataUrl } },
        ],
      },
    ],
    max_tokens: 2048,
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS)
  try {
    const response = await fetch(`${config.baseUrl.replace(/\/+$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    if (!response.ok) {
      let detail = ""
      try {
        detail = (await response.text()).slice(0, 300)
      } catch {
        // ignore body read failure
      }
      const hint = response.status === 401 || response.status === 403
        ? "（API Key 无效或无权限）"
        : response.status === 429
          ? "（触发限流，请稍后再试）"
          : ""
      throw new Error(`识图服务返回 HTTP ${response.status}${hint}${detail ? `：${detail}` : ""}`)
    }
    const json = await response.json()
    const content = json?.choices?.[0]?.message?.content
    const text = Array.isArray(content)
      ? content.filter((part) => part && typeof part === "object" && part.type === "text").map((part) => part.text).join("\n")
      : typeof content === "string" ? content : ""
    if (!text.trim()) {
      const finish = json?.choices?.[0]?.finish_reason || "empty"
      throw new Error(`识图模型没有返回内容（finish_reason=${finish}）。请检查模型名是否支持图片输入。`)
    }
    return text.trim()
  } finally {
    clearTimeout(timer)
  }
}

/**
 * 平台截图命令。返回 { command, args }；macOS 用 screencapture，
 * Windows 用 PowerShell（System.Drawing），Linux 依次尝试
 * import（ImageMagick）/ gnome-screenshot / scrot。
 */
function screenshotCommand(savePath) {
  if (process.platform === "darwin") {
    return { command: "screencapture", args: ["-x", savePath] }
  }
  if (process.platform === "win32") {
    const script = [
      "Add-Type -AssemblyName System.Windows.Forms,System.Drawing;",
      "$b = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds;",
      "$bmp = New-Object System.Drawing.Bitmap $b.Width, $b.Height;",
      "$g = [System.Drawing.Graphics]::FromImage($bmp);",
      "$g.CopyFromScreen($b.Location, [System.Drawing.Point]::Empty, $b.Size);",
      `$bmp.Save(${JSON.stringify(savePath)});`,
    ].join(" ")
    return { command: "powershell", args: ["-NoProfile", "-Command", script] }
  }
  // Linux：按可用性依次尝试。
  return { command: "import", args: ["-window", "root", savePath] }
}

function runCommand(command, args, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "ignore", "pipe"],
      windowsHide: true,
    })
    let stderr = ""
    child.stderr?.on("data", (chunk) => {
      stderr += String(chunk)
    })
    const timer = setTimeout(() => {
      child.kill()
      reject(new Error(`截图命令超时（${timeoutMs}ms）`))
    }, timeoutMs)
    child.on("error", (error) => {
      clearTimeout(timer)
      reject(error)
    })
    child.on("close", (code) => {
      clearTimeout(timer)
      if (code === 0) {
        resolve()
      } else {
        reject(new Error(`截图命令退出码 ${code}${stderr ? `：${stderr.trim().slice(0, 200)}` : ""}`))
      }
    })
  })
}

async function tryLinuxScreenshot(savePath) {
  const candidates = [
    { command: "import", args: ["-window", "root", savePath] },
    { command: "gnome-screenshot", args: ["-f", savePath] },
    { command: "scrot", args: [savePath] },
  ]
  let lastError = null
  for (const candidate of candidates) {
    try {
      await runCommand(candidate.command, candidate.args, SCREENSHOT_TIMEOUT_MS)
      await stat(savePath)
      return
    } catch (error) {
      lastError = error
    }
  }
  throw new Error(
    `没有可用的截图工具：${lastError instanceof Error ? lastError.message : String(lastError)}（可安装 imagemagick 的 import、gnome-screenshot 或 scrot）`,
  )
}

/** 截屏 → 视觉模型描述，一步到位。返回描述文本。 */
async function captureScreen(prompt, config) {
  const savePath = join(tmpdir(), `youmi-vision-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`)
  try {
    if (process.platform === "linux") {
      await tryLinuxScreenshot(savePath)
    } else {
      const { command, args } = screenshotCommand(savePath)
      try {
        await runCommand(command, args, SCREENSHOT_TIMEOUT_MS)
      } catch (error) {
        if (process.platform === "darwin" && /operation not permitted|denied|kCGError/i.test(String(error))) {
          throw new Error("屏幕录制权限未开启：请在 系统设置 → 隐私与安全性 → 屏幕录制 中授权本应用后重试。")
        }
        throw error
      }
      await stat(savePath)
    }
    const description = await describeImage(savePath, prompt || "请用中文详细描述这张屏幕截图的内容，包括界面元素、文字、报错信息等。", config)
    return `已截取屏幕并保存到 ${savePath}\n\n${description}`
  } finally {
    // 用完即删，避免残留临时文件。
    void rm(savePath, { force: true }).catch(() => undefined)
  }
}

function toolResult(text, isError = false) {
  return {
    content: [{ type: "text", text }],
    isError,
  }
}

/** 最小 MCP stdio server：initialize / tools.list / tools.call / ping。 */
class VisionMcpServer {
  constructor() {
    this.tools = [
      {
        name: "describe_image",
        description:
          "描述一张图片的内容（支持 png/jpg/jpeg/webp/gif/bmp）。当用户粘贴、附带了截图或图片文件，或者任务涉及查看图片时调用它，把图片转成文字说明供模型理解。返回中文描述。",
        inputSchema: {
          type: "object",
          properties: {
            path: { type: "string", description: "图片文件的绝对路径" },
            prompt: { type: "string", description: "可选：希望模型重点关注的内容，如『提取报错信息』『识别界面按钮』" },
          },
          required: ["path"],
        },
      },
      {
        name: "capture_screen",
        description:
          "截取当前屏幕（全屏），保存为临时 PNG，并用视觉模型返回中文描述。当需要查看用户屏幕、界面状态、报错弹窗或进行可视化操作时调用。macOS 需已授权屏幕录制权限。",
        inputSchema: {
          type: "object",
          properties: {
            prompt: { type: "string", description: "可选：希望模型重点关注的截图内容" },
          },
        },
      },
    ]
    this.buffer = ""
    this.pendingCalls = 0
    this.stdinEnded = false
  }

  start() {
    process.stdin.setEncoding("utf8")
    process.stdin.on("data", (chunk) => this.onData(chunk))
    process.stdin.on("end", () => {
      this.stdinEnded = true
      if (this.pendingCalls === 0) process.exit(0)
    })
  }

  onData(chunk) {
    this.buffer += chunk
    let index
    while ((index = this.buffer.indexOf("\n")) !== -1) {
      const line = this.buffer.slice(0, index).trim()
      this.buffer = this.buffer.slice(index + 1)
      if (!line) continue
      try {
        this.onMessage(JSON.parse(line))
      } catch (error) {
        this.send({
          jsonrpc: "2.0",
          id: null,
          error: { code: -32700, message: `Parse error: ${error instanceof Error ? error.message : String(error)}` },
        })
      }
    }
  }

  onMessage(message) {
    if (message && message.method === "notifications/initialized") {
      // 通知无需响应
      return
    }
    if (!message || typeof message.id === "undefined") return
    const { id, method, params } = message
    switch (method) {
      case "initialize": {
        this.send({
          jsonrpc: "2.0",
          id,
          result: {
            protocolVersion: PROTOCOL_VERSION,
            capabilities: { tools: {} },
            serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
          },
        })
        break
      }
      case "ping": {
        this.send({ jsonrpc: "2.0", id, result: {} })
        break
      }
      case "tools/list": {
        this.send({
          jsonrpc: "2.0",
          id,
          result: { tools: this.tools },
        })
        break
      }
      case "tools/call": {
        this.handleToolCall(id, params).catch(() => undefined)
        break
      }
      default: {
        this.send({
          jsonrpc: "2.0",
          id,
          error: { code: -32601, message: `Method not found: ${method}` },
        })
      }
    }
  }

  async handleToolCall(id, params) {
    this.pendingCalls += 1
    try {
      await this.handleToolCallInner(id, params)
    } finally {
      this.pendingCalls -= 1
      if (this.stdinEnded && this.pendingCalls === 0) process.exit(0)
    }
  }

  async handleToolCallInner(id, params) {
    const name = params?.name
    const args = params?.arguments && typeof params.arguments === "object" ? params.arguments : {}
    const config = loadConfig()
    if (name !== "describe_image" && name !== "capture_screen") {
      this.send({
        jsonrpc: "2.0",
        id,
        error: { code: -32602, message: `Unknown tool: ${name}` },
      })
      return
    }
    if (!config.enabled || !config.apiKey) {
      this.send({
        jsonrpc: "2.0",
        id,
        result: toolResult(
          "识图服务未启用或未配置 API Key。请到「设置 → 模型服务 → 识图服务」填写视觉模型的 API Key 并启用。",
          true,
        ),
      })
      return
    }
    if (name === "capture_screen") {
      const prompt = typeof args.prompt === "string" ? args.prompt.trim() : ""
      try {
        const text = await captureScreen(prompt, config)
        this.send({ jsonrpc: "2.0", id, result: toolResult(text) })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        this.send({ jsonrpc: "2.0", id, result: toolResult(`截屏识图失败：${message}`, true) })
      }
      return
    }
    const path = typeof args.path === "string" ? args.path.trim() : ""
    const prompt = typeof args.prompt === "string" ? args.prompt.trim() : ""
    if (!path) {
      this.send({ jsonrpc: "2.0", id, result: toolResult("describe_image 需要 path 参数（图片绝对路径）。", true) })
      return
    }
    try {
      const text = await describeImage(path, prompt, config)
      this.send({ jsonrpc: "2.0", id, result: toolResult(text) })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.send({ jsonrpc: "2.0", id, result: toolResult(`识图失败：${message}`, true) })
    }
  }

  send(payload) {
    process.stdout.write(`${JSON.stringify(payload)}\n`)
  }
}

new VisionMcpServer().start()
