import { existsSync, readFileSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { getSettingsFilePath } from "../shared/branding"
import type { VisionProviderKind, VisionServiceSettings } from "../shared/types"
import { VISION_PROVIDER_PRESETS } from "../shared/vision"

/**
 * 识图服务（视觉模型）：DeepSeek V4 是文本模型，看不懂图片。
 *
 * 应用在设置里保存「识图服务」配置（千问/GLM + 用户自填 API Key），
 * 并把一个自研的 stdio MCP server（vision-mcp-server.mjs）注册给各 agent
 * 引擎（ccb / codex / reasonix）。agent 调用 `describe_image` 工具时，
 * MCP server 用视觉模型把图片转成文字描述返回 —— 这就是 GitHub 上
 * 「文本模型 + MCP 识图」的标准做法。
 */

export const VISION_MCP_SERVER_NAME = "youmi_vision"

/** 兼容旧引用：预设定义移到 shared/vision.ts。 */
export const VISION_PROVIDER_DEFAULTS = VISION_PROVIDER_PRESETS

function envString(name: string, fallback = ""): string {
  const value = process.env[name]
  return typeof value === "string" && value.trim() ? value.trim() : fallback
}

/** 读取当前识图服务配置（env 覆盖 > 设置文件）。和 resolveDeepSeekApiKey 同款直读模式。 */
export function resolveVisionSettings(): VisionServiceSettings {
  let raw: Partial<VisionServiceSettings> | null = null
  try {
    const settingsPath = getSettingsFilePath(homedir())
    if (existsSync(settingsPath)) {
      const parsed = JSON.parse(readFileSync(settingsPath, "utf8")) as { visionService?: unknown }
      if (parsed.visionService && typeof parsed.visionService === "object") {
        raw = parsed.visionService as Partial<VisionServiceSettings>
      }
    }
  } catch {
    // 设置文件损坏时按未配置处理，绝不阻塞聊天。
  }

  const provider: VisionProviderKind = envString("AIANG_VISION_PROVIDER", raw?.provider ?? "qwen") === "glm"
    ? "glm"
    : "qwen"
  const defaults = VISION_PROVIDER_DEFAULTS[provider]
  return {
    enabled: envString("AIANG_VISION_ENABLED") === "true"
      ? true
      : typeof raw?.enabled === "boolean" ? raw.enabled : false,
    provider,
    apiKey: envString("AIANG_VISION_API_KEY", typeof raw?.apiKey === "string" ? raw.apiKey : ""),
    baseUrl: envString("AIANG_VISION_BASE_URL", raw?.baseUrl?.trim() ? raw.baseUrl : defaults.baseUrl),
    model: envString("AIANG_VISION_MODEL", raw?.model?.trim() ? raw.model : defaults.model),
  }
}

export function isVisionServiceReady(settings = resolveVisionSettings()): boolean {
  return settings.enabled && Boolean(settings.apiKey.trim())
}

/** vision MCP server 脚本的绝对路径（随包发布，见 package.json files 里的 src/server）。 */
export function resolveVisionMcpScriptPath(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "vision-mcp-server.mjs")
}

/**
 * 可执行运行时：优先环境变量，其次 ~/.bun/bin/bun（常见安装位置，Windows
 * 也是 bun.exe），最后当前进程自己（dev 下就是 bun）。这样打包成桌面应用后
 * MCP server 仍能找到真实的 bun，而不是被 --compile 后的二进制代替。
 */
export function resolveVisionMcpRuntime(): string {
  const fromEnv = envString("AIANG_VISION_RUNTIME")
  if (fromEnv) return fromEnv

  const bunCandidates = [
    join(homedir(), ".bun", "bin", process.platform === "win32" ? "bun.exe" : "bun"),
    process.execPath,
  ]
  for (const candidate of bunCandidates) {
    try {
      if (existsSync(candidate)) return candidate
    } catch {
      // ignore
    }
  }
  return process.platform === "win32" ? "bun.exe" : "bun"
}

export interface VisionMcpServerSpec {
  type: "stdio"
  command: string
  args: string[]
}

/**
 * 构建注册给引擎的 MCP server spec。未启用或没填 Key 时返回 null，
 * 引擎侧就不挂这个 server，完全不影响正常聊天。
 */
export function buildVisionMcpServerSpec(settings = resolveVisionSettings()): VisionMcpServerSpec | null {
  if (!isVisionServiceReady(settings)) return null
  return {
    type: "stdio",
    command: resolveVisionMcpRuntime(),
    args: [resolveVisionMcpScriptPath()],
  }
}

/** 追加给 agent 的系统提示：让引擎知道贴图时要用 describe_image 工具。 */
export function buildVisionSystemHint(settings = resolveVisionSettings()): string {
  if (!isVisionServiceReady(settings)) return ""
  return [
    "<system-message>",
    "当用户附带了图片（截图/图片文件）时，请调用 describe_image 工具（参数 path 为图片绝对路径）",
    "获取图片内容的文字描述后再继续。需要查看用户当前屏幕、界面状态或报错弹窗时，",
    "请调用 capture_screen 工具截屏并识图。两个工具都来自 youmi_vision MCP server。",
    "</system-message>",
  ].join("\n")
}

/** 1×1 透明 PNG（测试视觉端点用，几乎不产生 token 成本）。 */
const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="

export interface VisionConnectionTestResult {
  ok: boolean
  message: string
  /** 实际使用的模型名（未填时是服务商默认）。 */
  model?: string
}

/**
 * 检测识图服务连接：用 1×1 PNG 打一次 chat/completions，验证 Key 有效、
 * baseUrl 可达、模型支持图片输入。超时 20s。
 */
export async function testVisionConnection(settings: VisionServiceSettings): Promise<VisionConnectionTestResult> {
  const provider = settings.provider === "glm" ? "glm" : "qwen"
  const defaults = VISION_PROVIDER_DEFAULTS[provider]
  const baseUrl = settings.baseUrl.trim() || defaults.baseUrl
  const model = settings.model.trim() || defaults.model
  const apiKey = settings.apiKey.trim()

  if (!apiKey) {
    return { ok: false, message: "请先填写 API Key。" }
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 20_000)
  try {
    const response = await fetch(`${baseUrl.replace(/\/+$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "回复 OK" },
              { type: "image_url", image_url: { url: `data:image/png;base64,${TINY_PNG_BASE64}` } },
            ],
          },
        ],
        max_tokens: 8,
      }),
      signal: controller.signal,
    })

    if (!response.ok) {
      const detail = (await response.text().catch(() => "")).slice(0, 200)
      const hint = response.status === 401 || response.status === 403
        ? "API Key 无效或无权限。"
        : response.status === 404
          ? "接口地址或模型名可能不对。"
          : response.status === 429
            ? "触发限流，请稍后再试。"
            : ""
      return { ok: false, message: `HTTP ${response.status}${hint ? ` ${hint}` : ""}${detail ? ` ${detail}` : ""}`.trim(), model }
    }

    return { ok: true, message: `连接成功，模型 ${model} 可用（${defaults.label}）。`, model }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    return {
      ok: false,
      message: reason.includes("abort") || reason.includes("timeout")
        ? "连接超时，请检查 baseUrl 或网络。"
        : `连接失败：${reason}`,
      model,
    }
  } finally {
    clearTimeout(timer)
  }
}
