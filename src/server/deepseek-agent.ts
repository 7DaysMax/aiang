import { existsSync, mkdirSync, readFileSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import { getClaudeConfigDir, getSettingsFilePath } from "../shared/branding"
import { isPlausibleApiKey } from "../shared/api-key"
import type {
  AgentProvider,
  DeepSeekBalanceSnapshot,
  DeepSeekConnectionTestResult,
  DeepSeekPromptOptimizeResult,
} from "../shared/types"
import { resolveAppVendorDir } from "./app-root"
import type { HarnessEvent, HarnessTurn } from "./harness-types"
import { AsyncQueue } from "./async-queue"
import { timestamped } from "./transcript"

/**
 * DeepSeek engine — Aiang 唯一支持的模型供应商。
 *
 * Aiang 自带一份逆向版 Claude Code CLI（vendor/ccb/ccb-bin，来自
 * claude-code-best 仓库）。agent.ts 里的 SDK 通道用它作为执行引擎，并注入
 * 下面的 OpenAI 兼容环境变量，让 ccb 的所有请求都直达 DeepSeek API：
 *
 *   CLAUDE_CODE_USE_OPENAI=1
 *   OPENAI_BASE_URL=<DeepSeek 兼容端点>
 *   OPENAI_MODEL=<模型>
 *   OPENAI_API_KEY=<用户密钥>
 *   CLAUDE_CONFIG_DIR=<隔离配置目录>
 *
 * 这样 Kanna 原有的 transcript 渲染、工具调用、权限交互全部原样保留，
 * 只是底层的模型推理换成了 DeepSeek。
 */

export const DEFAULT_DEEPSEEK_MODEL = "deepseek-v4-flash"
export const DEEPSEEK_BASE_URL = process.env.AIANG_BASE_URL ?? "https://api.deepseek.com"

export { DEEPSEEK_CONTEXT_WINDOW_TOKENS } from "../shared/models"

/**
 * ccb（逆向版 Claude Code CLI，vendor/ccb/ccb-bin）内置的 slash 命令。
 * 列表来自 ccb 会话 system_init 的真实上报（build 2.1.888）。没有活动
 * 会话时 `/` 菜单用它兜底，保证任何时候都能看到完整的命令面；有会话时
 * 以 supportedCommands() 的实时枚举为准。
 */
export const CCB_BUILTIN_COMMANDS: readonly string[] = [
  "update-config", "debug", "simplify", "use-artifacts", "batch", "ultracode",
  "loop", "cron-list", "cron-delete", "dream", "release", "review-pr",
  "provider", "compact", "context", "heapdump", "init", "pr-comments",
  "release-notes", "review", "security-review", "insights", "summary",
  "commit", "commit-push-pr", "version", "init-verifiers", "env",
  "debug-tool-call", "perf-issue", "break-cache", "issue", "share", "tui",
]

export const MISSING_DEEPSEEK_KEY_MESSAGE =
  "未配置 DeepSeek API Key。请在「设置 → 模型服务」中填写，或设置环境变量 DEEPSEEK_API_KEY。"
export const INVALID_DEEPSEEK_KEY_MESSAGE =
  "DeepSeek API Key 格式看起来不对（可能粘贴了错误内容）。请在「设置 → 模型服务」中重新粘贴，然后新建对话重试。"

/** API Key 读取顺序：DEEPSEEK_API_KEY 环境变量 → ~/.aiang/config.json → 应用设置文件。 */
export function resolveDeepSeekApiKey(): string | null {
  const envKey = process.env.DEEPSEEK_API_KEY
  if (envKey && envKey.trim()) return envKey.trim()

  try {
    const legacyPath = join(homedir(), ".aiang", "config.json")
    if (existsSync(legacyPath)) {
      const parsed = JSON.parse(readFileSync(legacyPath, "utf8")) as { apiKey?: unknown }
      if (typeof parsed.apiKey === "string" && parsed.apiKey.trim()) return parsed.apiKey.trim()
    }
  } catch {}

  try {
    const settingsPath = getSettingsFilePath(homedir())
    if (existsSync(settingsPath)) {
      const parsed = JSON.parse(readFileSync(settingsPath, "utf8")) as { deepseekApiKey?: unknown }
      if (typeof parsed.deepseekApiKey === "string" && parsed.deepseekApiKey.trim()) {
        return parsed.deepseekApiKey.trim()
      }
    }
  } catch {}

  return null
}

export { isPlausibleApiKey }

/** 解析 ccb 可执行文件：CLAUDE_EXECUTABLE 覆盖 → 仓库自带的 vendor/ccb/ccb-bin。 */
export function resolveCcbExecutable(): string {
  const override = process.env.CLAUDE_EXECUTABLE?.replace(/^~(?=\/|$)/, homedir())
  if (override) return override

  // Windows 用交叉编译的 PE 版（vendor/ccb/ccb-bin.exe），其余平台用原生版。
  const binaryName = process.platform === "win32" ? "ccb-bin.exe" : "ccb-bin"
  const vendored = resolveAppVendorDir("ccb", binaryName)
  if (existsSync(vendored)) return vendored

  throw new Error(
    `找不到内置 AI 引擎（vendor/ccb/${binaryName}）。请重新安装 Aiang，或通过 CLAUDE_EXECUTABLE 指定可执行文件路径。`
  )
}

/**
 * ccb 内部用模型名里的 `[1m]` 标记识别 1M 上下文窗口（getContextWindowForModel
 * → has1mContext）。显示层按真实窗口 1M 计算自动压缩线（930k），但引擎自身
 * 默认把 deepseek 当 200k 模型（167k 就压缩），两边对不上。给 SDK 通道的模型名
 * 加 `[1m]` 后缀即可让引擎按 1M 压缩；OPENAI_MODEL 保持干净，API 请求不受影响。
 */
export function ccbSdkModel(model: string): string {
  return model.startsWith("deepseek-") ? `${model}[1m]` : model
}

/**
 * 注入给 ccb 的 OpenAI 兼容环境变量，把所有请求指向 DeepSeek。
 * ccb 的 OpenAI 通道以 OPENAI_MODEL 环境变量为准（SDK 的 model 选项
 * 只影响内置模型族映射），所以必须把 UI 选中的模型传进来，否则选
 * deepseek-v4-pro 也不会生效。AIANG_MODEL 环境变量可强制覆盖。
 * 注意：OPENAI_MODEL 必须保持干净模型名（不能带 [1m]），主 OpenAI 通道
 * 原样透传该变量给 chat.completions.create，带后缀会被 DeepSeek API 拒绝。
 */
export function buildCcbEnv(
  apiKey: string,
  model?: string,
  effort?: string,
  endpoint?: { baseUrl?: string },
): Record<string, string> {
  const configDir = getClaudeConfigDir(homedir())
  try {
    mkdirSync(configDir, { recursive: true })
  } catch {}

  return {
    CLAUDE_CODE_USE_OPENAI: "1",
    OPENAI_BASE_URL: endpoint?.baseUrl || process.env.AIANG_BASE_URL || DEEPSEEK_BASE_URL,
    OPENAI_MODEL: process.env.AIANG_MODEL ?? model ?? DEFAULT_DEEPSEEK_MODEL,
    OPENAI_API_KEY: apiKey,
    CLAUDE_CONFIG_DIR: configDir,
    DISABLE_TELEMETRY: "1",
    DISABLE_ERROR_REPORTING: "1",
    DISABLE_AUTOUPDATER: "1",
    // 让 ccb 的 Grep 工具直接走系统 rg（随包自带，见 withVendoredRgOnPath），
    // 而不是先找内置 rg 再打一条 "builtin rg unavailable" 的 fallback 提示。
    // 引擎的 isEnvDefinedFalsy 只在显式 "0"/"false"/"no"/"off" 时才启用系统模式。
    USE_BUILTIN_RIPGREP: "0",
    // 思考档位：ccb 的 getChatGPTResponsesReasoningEffort 读这个变量，
    // 我们的补丁让 Chat Completions 请求体也带上 reasoning_effort。
    ...(effort ? { CLAUDE_CODE_EFFORT_LEVEL: effort } : {}),
  }
}

/**
 * 随包携带的 ripgrep 二进制（vendor/ccb/rg，Windows 为 rg.exe）。
 * ccb 的 Grep 工具用 `which('rg')` 找系统 rg；不装到 PATH 里，很多机器
 * （尤其 Windows）没有 rg，grep 会直接报 "no ripgrep available"。返回 null
 * 表示没带二进制（比如只在仓库里改过 vendor 没复制文件），此时不动 PATH。
 */
export function vendoredRgPath(): string | null {
  const binaryName = process.platform === "win32" ? "rg.exe" : "rg"
  const candidate = resolveAppVendorDir("ccb", binaryName)
  return existsSync(candidate) ? candidate : null
}

/** 把随包 rg 所在目录前置到 PATH，保证 ccb 的 `which('rg')` 一定找得到。 */
export function withVendoredRgOnPath(
  env: Record<string, string | undefined>,
): Record<string, string | undefined> {
  const rg = vendoredRgPath()
  if (!rg) return env
  const separator = process.platform === "win32" ? ";" : ":"
  const currentPath = env.PATH ?? process.env.PATH ?? ""
  return {
    ...env,
    PATH: currentPath ? `${dirname(rg)}${separator}${currentPath}` : dirname(rg),
  }
}

/** 未配置 API Key 时的失败回合，往 transcript 里推一条中文错误结果。 */
export function failedDeepSeekTurn(message: string): HarnessTurn {
  const queue = new AsyncQueue<HarnessEvent>()
  queue.push({
    type: "transcript",
    entry: timestamped({
      kind: "result",
      subtype: "error",
      isError: true,
      durationMs: 0,
      result: message,
    }),
  })
  queue.finish()
  return {
    provider: "deepseek",
    stream: queue,
    interrupt: async () => {},
    close: () => {},
  }
}

export const DEEPSEEK_PROVIDER: AgentProvider = "deepseek"

/**
 * DeepSeek 账户余额。官方没有公开的余额查询接口，但 `GET /user/balance`
 * （需 Bearer API Key）会返回 `balance_infos`。优先走配置的兼容端点，
 * 失败时回退官方地址；不可用时返回 available:false + error 原因。
 */
export async function fetchDeepSeekBalance(): Promise<DeepSeekBalanceSnapshot> {
  const apiKey = resolveDeepSeekApiKey()
  const fetchedAt = new Date().toISOString()
  if (!apiKey) {
    return { available: false, fetchedAt, error: "missing_key" }
  }

  const baseUrls = [
    DEEPSEEK_BASE_URL.replace(/\/+$/, ""),
    "https://api.deepseek.com",
  ].filter((url, index, all) => all.indexOf(url) === index)

  for (const baseUrl of baseUrls) {
    try {
      const response = await fetch(`${baseUrl}/user/balance`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(8_000),
      })
      if (!response.ok) {
        if (response.status === 401) {
          return { available: false, fetchedAt, error: "unauthorized" }
        }
        continue
      }
      const payload = (await response.json()) as {
        is_available?: unknown
        balance_infos?: unknown
      }
      const balanceInfo = Array.isArray(payload.balance_infos)
        ? (payload.balance_infos[0] as Record<string, unknown> | undefined)
        : undefined
      return {
        available: payload.is_available === true || balanceInfo !== undefined,
        fetchedAt,
        currency: typeof balanceInfo?.currency === "string" ? balanceInfo.currency : undefined,
        totalBalance: typeof balanceInfo?.total_balance === "string" ? balanceInfo.total_balance : undefined,
        grantedBalance: typeof balanceInfo?.granted_balance === "string" ? balanceInfo.granted_balance : undefined,
        toppedUpBalance: typeof balanceInfo?.topped_up_balance === "string" ? balanceInfo.topped_up_balance : undefined,
      }
    } catch {}
  }

  return { available: false, fetchedAt, error: "request_failed" }
}

/** DeepSeek 端点候选：配置的兼容端点优先，官方地址兜底。 */
function deepSeekBaseUrls(): string[] {
  return [
    DEEPSEEK_BASE_URL.replace(/\/+$/, ""),
    "https://api.deepseek.com",
  ].filter((url, index, all) => all.indexOf(url) === index)
}

/**
 * 设置页「检测连接」：用当前配置的 key 同时验证余额端点（鉴权）和
 * 模型列表端点（拉取模型数量）。任一端点 401 即 key 无效。
 */
export async function testDeepSeekConnection(): Promise<DeepSeekConnectionTestResult> {
  const apiKey = resolveDeepSeekApiKey()
  if (!apiKey) {
    return { keyConfigured: false, ok: false, keyValid: false, error: "missing_key", modelCount: 0, models: [] }
  }
  if (!isPlausibleApiKey(apiKey)) {
    return { keyConfigured: true, ok: false, keyValid: false, error: "invalid_key", modelCount: 0, models: [] }
  }

  for (const baseUrl of deepSeekBaseUrls()) {
    try {
      const [balanceResponse, modelsResponse] = await Promise.all([
        fetch(`${baseUrl}/user/balance`, {
          headers: { Authorization: `Bearer ${apiKey}` },
          signal: AbortSignal.timeout(8_000),
        }),
        fetch(`${baseUrl}/models`, {
          headers: { Authorization: `Bearer ${apiKey}` },
          signal: AbortSignal.timeout(8_000),
        }),
      ])
      if (balanceResponse.status === 401 || modelsResponse.status === 401) {
        return { keyConfigured: true, ok: false, keyValid: false, error: "unauthorized", modelCount: 0, models: [] }
      }
      if (!balanceResponse.ok || !modelsResponse.ok) {
        continue
      }

      const balancePayload = (await balanceResponse.json()) as {
        balance_infos?: unknown
      }
      const balanceInfo = Array.isArray(balancePayload.balance_infos)
        ? (balancePayload.balance_infos[0] as Record<string, unknown> | undefined)
        : undefined
      const modelsPayload = (await modelsResponse.json()) as { data?: unknown }
      const models = Array.isArray(modelsPayload.data)
        ? modelsPayload.data
            .map((entry) => {
              const id = typeof (entry as Record<string, unknown> | null)?.id === "string"
                ? ((entry as Record<string, unknown>).id as string)
                : ""
              return { id }
            })
            .filter((model) => model.id.length > 0)
        : []

      return {
        keyConfigured: true,
        ok: true,
        keyValid: true,
        modelCount: models.length,
        models,
        totalBalance: typeof balanceInfo?.total_balance === "string" ? balanceInfo.total_balance : undefined,
        currency: typeof balanceInfo?.currency === "string" ? balanceInfo.currency : undefined,
      }
    } catch {}
  }

  return { keyConfigured: true, ok: false, keyValid: false, error: "request_failed", modelCount: 0, models: [] }
}

/**
 * 优化提示词等裸 API 调用使用的模型：AIANG_MODEL 环境变量 →
 * 设置文件里的 deepseek 模型 → 默认 V4 Flash。
 */
export function resolveDeepSeekModel(): string {
  const envModel = process.env.AIANG_MODEL
  if (envModel && envModel.trim()) return envModel.trim()

  try {
    const settingsPath = getSettingsFilePath(homedir())
    if (existsSync(settingsPath)) {
      const parsed = JSON.parse(readFileSync(settingsPath, "utf8")) as {
        providerDefaults?: { deepseek?: { model?: unknown } }
      }
      const model = parsed.providerDefaults?.deepseek?.model
      if (typeof model === "string" && model.trim()) return model.trim()
    }
  } catch {}

  return DEFAULT_DEEPSEEK_MODEL
}

/** 「优化提示词」的 system 指令：保持用户语言，只输出优化后的提示词本身。 */
const OPTIMIZE_PROMPT_SYSTEM = [
  "你是一个专业的提示词优化专家。请把用户输入的提示词改写得更清晰、具体、可执行，",
  "同时严格保留用户的原始意图，并使用与用户输入相同的语言（用户用中文你就用中文）。",
  "优化要点：",
  "- 明确目标与期望结果",
  "- 补充必要的上下文、约束和输出要求",
  "- 把复杂任务拆解成清晰的步骤",
  "- 保持简洁，去掉废话和重复",
  "只输出优化后的提示词本身，不要任何解释、前缀、引号或多余内容。",
].join("\n")

/**
 * 对话框「优化提示词」：用配置的 DeepSeek key 直接调 /chat/completions，
 * 让模型把用户输入的提示词优化得更具体、可执行，返回优化后的文本。
 * 前端只替换输入框内容，不直接发送。
 */
export async function optimizePrompt(prompt: string): Promise<DeepSeekPromptOptimizeResult> {
  const apiKey = resolveDeepSeekApiKey()
  if (!apiKey) {
    return { ok: false, error: "missing_key" }
  }
  if (!isPlausibleApiKey(apiKey)) {
    return { ok: false, error: "invalid_key" }
  }
  const trimmed = prompt.trim()
  if (!trimmed) {
    return { ok: false, error: "empty_prompt" }
  }

  const model = resolveDeepSeekModel()
  for (const baseUrl of deepSeekBaseUrls()) {
    try {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: OPTIMIZE_PROMPT_SYSTEM },
            { role: "user", content: trimmed },
          ],
          temperature: 0.7,
          stream: false,
        }),
        signal: AbortSignal.timeout(30_000),
      })
      if (response.status === 401) {
        return { ok: false, error: "unauthorized" }
      }
      if (!response.ok) {
        continue
      }
      const payload = (await response.json()) as {
        choices?: Array<{ message?: { content?: unknown } }>
      }
      const content = payload.choices?.[0]?.message?.content
      if (typeof content !== "string" || !content.trim()) {
        return { ok: false, error: "empty_response" }
      }
      return { ok: true, optimized: content.trim() }
    } catch {}
  }

  return { ok: false, error: "request_failed" }
}
