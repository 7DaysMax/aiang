import { engineUsesModelProfile, type EngineFamily } from "./engine-family"
import type { AgentProvider } from "./types"

/** @deprecated 档案在则所有非 Cursor 引擎都用；不再分官方/中转开关。 */
export type ThirdPartyAccessMode = "official" | "relay"
export type ModelProfileProtocol = "openai-compat" | "anthropic"

export const MODEL_PROFILE_PRESET_IDS = [
  "deepseek",
  "openrouter",
  "anthropic",
  "openai",
  "qwen",
  "glm",
  "moonshot",
  "custom",
] as const

export type ModelProfilePresetId = (typeof MODEL_PROFILE_PRESET_IDS)[number]

export interface ModelProfile {
  id: string
  name: string
  presetId: ModelProfilePresetId
  protocol: ModelProfileProtocol
  baseUrl: string
  apiKey: string
  modelId: string
}

/** Stable empty list for Zustand selectors — never allocate `?? []` inside getSnapshot. */
export const EMPTY_MODEL_PROFILES: ModelProfile[] = []

export interface ModelProfilePreset {
  id: ModelProfilePresetId
  name: string
  protocol: ModelProfileProtocol
  baseUrl: string
  modelId: string
  siteUrl: string
}

export const MODEL_PROFILE_PRESETS: readonly ModelProfilePreset[] = [
  {
    id: "deepseek",
    name: "DeepSeek",
    protocol: "openai-compat",
    baseUrl: "https://api.deepseek.com",
    modelId: "deepseek-v4-flash",
    siteUrl: "https://platform.deepseek.com",
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    protocol: "openai-compat",
    baseUrl: "https://openrouter.ai/api/v1",
    modelId: "",
    siteUrl: "https://openrouter.ai/keys",
  },
  {
    id: "anthropic",
    name: "Anthropic",
    protocol: "anthropic",
    baseUrl: "https://api.anthropic.com",
    modelId: "claude-sonnet-4-5",
    siteUrl: "https://console.anthropic.com",
  },
  {
    id: "openai",
    name: "OpenAI",
    protocol: "openai-compat",
    baseUrl: "https://api.openai.com/v1",
    modelId: "gpt-4.1",
    siteUrl: "https://platform.openai.com/api-keys",
  },
  {
    id: "qwen",
    name: "通义千问",
    protocol: "openai-compat",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    modelId: "qwen-plus",
    siteUrl: "https://dashscope.console.aliyun.com/",
  },
  {
    id: "glm",
    name: "智谱 GLM",
    protocol: "openai-compat",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    modelId: "glm-4.5",
    siteUrl: "https://open.bigmodel.cn/",
  },
  {
    id: "moonshot",
    name: "Moonshot",
    protocol: "openai-compat",
    baseUrl: "https://api.moonshot.cn/v1",
    modelId: "kimi-k2-0905-preview",
    siteUrl: "https://platform.moonshot.cn",
  },
  {
    id: "custom",
    name: "自定义",
    protocol: "openai-compat",
    baseUrl: "",
    modelId: "",
    siteUrl: "",
  },
]

const PRESET_BY_ID = new Map(MODEL_PROFILE_PRESETS.map((preset) => [preset.id, preset]))

export function getModelProfilePreset(id: ModelProfilePresetId): ModelProfilePreset {
  return PRESET_BY_ID.get(id) ?? MODEL_PROFILE_PRESETS[MODEL_PROFILE_PRESETS.length - 1]!
}

export function isModelProfilePresetId(value: unknown): value is ModelProfilePresetId {
  return typeof value === "string" && MODEL_PROFILE_PRESET_IDS.includes(value as ModelProfilePresetId)
}

export function inferModelProfilePresetId(input: {
  presetId?: unknown
  baseUrl?: string
  protocol?: ModelProfileProtocol
}): ModelProfilePresetId {
  if (isModelProfilePresetId(input.presetId)) return input.presetId
  const url = (input.baseUrl ?? "").toLowerCase()
  if (url.includes("deepseek")) return "deepseek"
  if (url.includes("openrouter")) return "openrouter"
  if (url.includes("anthropic.com") || input.protocol === "anthropic") return "anthropic"
  if (url.includes("openai.com")) return "openai"
  if (url.includes("dashscope") || url.includes("aliyuncs.com")) return "qwen"
  if (url.includes("bigmodel.cn") || url.includes("z.ai")) return "glm"
  if (url.includes("moonshot") || url.includes("kimi.com")) return "moonshot"
  return "custom"
}

export function groupProfilesByPreset(
  profiles: ReadonlyArray<Omit<ModelProfile, "presetId"> & { presetId?: unknown }>,
): Record<ModelProfilePresetId, ModelProfile[]> {
  const groups = Object.fromEntries(
    MODEL_PROFILE_PRESET_IDS.map((id) => [id, [] as ModelProfile[]]),
  ) as Record<ModelProfilePresetId, ModelProfile[]>
  for (const profile of profiles) {
    const presetId = inferModelProfilePresetId(profile)
    groups[presetId].push({ ...profile, presetId })
  }
  return groups
}

export function nextProfileName(presetName: string, existing: readonly ModelProfile[]): string {
  const taken = new Set(existing.map((profile) => profile.name))
  if (!taken.has(presetName)) return presetName
  for (let index = 2; index < 100; index += 1) {
    const candidate = `${presetName} ${index}`
    if (!taken.has(candidate)) return candidate
  }
  return `${presetName} ${existing.length + 1}`
}

export function maskApiKey(apiKey: string): string {
  const trimmed = apiKey.trim()
  if (!trimmed) return "未填写"
  if (trimmed.length <= 8) return "••••"
  return `${trimmed.slice(0, 4)}…${trimmed.slice(-4)}`
}

export function normalizeThirdPartyAccess(value: unknown): ThirdPartyAccessMode {
  return value === "relay" ? "relay" : "official"
}

export function normalizeModelProfileProtocol(value: unknown): ModelProfileProtocol {
  return value === "anthropic" ? "anthropic" : "openai-compat"
}

export function normalizeModelProfile(value: unknown): ModelProfile | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  const id = typeof record.id === "string" ? record.id.trim() : ""
  const name = typeof record.name === "string" ? record.name.trim() : ""
  const baseUrl = typeof record.baseUrl === "string" ? record.baseUrl.trim() : ""
  const apiKey = typeof record.apiKey === "string" ? record.apiKey.trim() : ""
  const modelId = typeof record.modelId === "string" ? record.modelId.trim() : ""
  if (!id || !name) return null
  const protocol = normalizeModelProfileProtocol(record.protocol)
  return {
    id,
    name,
    presetId: inferModelProfilePresetId({ presetId: record.presetId, baseUrl, protocol }),
    protocol,
    baseUrl,
    apiKey,
    modelId,
  }
}

export function normalizeModelProfiles(value: unknown): ModelProfile[] {
  if (!Array.isArray(value)) return []
  const profiles: ModelProfile[] = []
  const seen = new Set<string>()
  for (const entry of value) {
    const profile = normalizeModelProfile(entry)
    if (!profile || seen.has(profile.id)) continue
    seen.add(profile.id)
    profiles.push(profile)
    if (profiles.length >= 30) break
  }
  return profiles
}

export function resolveActiveModelProfile(
  profiles: readonly ModelProfile[],
  activeId: string | null | undefined,
): ModelProfile | null {
  if (profiles.length === 0) return null
  if (activeId) {
    const match = profiles.find((profile) => profile.id === activeId)
    if (match) return match
  }
  return profiles[0] ?? null
}

export function isCompleteModelProfile(profile: ModelProfile | null | undefined): profile is ModelProfile {
  return Boolean(profile && profile.apiKey && profile.baseUrl && profile.modelId)
}

/** Cursor 不用档案；Claude / Codex / Youmi / ccb / Reasonix / Pi 共用。 */
export function profileAppliesToEngine(provider: AgentProvider, _profile?: ModelProfile | null): boolean {
  return engineUsesModelProfile(provider)
}

export function penguinProviderForProfile(profile: ModelProfile): string {
  if (profile.protocol === "anthropic" || profile.presetId === "anthropic") return "anthropic"
  if (profile.presetId === "deepseek" || /deepseek/i.test(profile.baseUrl) || /deepseek/i.test(profile.modelId)) {
    return "deepseek"
  }
  return "openai"
}

export function profileRuntimeKey(profile: ModelProfile | null): string {
  if (!profile) return "none"
  return `${profile.protocol}:${profile.baseUrl}:${profile.modelId}:${profile.id}`
}

export type { EngineFamily }
