import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { getSettingsFilePath } from "../shared/branding"
import {
  isCompleteModelProfile,
  normalizeModelProfiles,
  profileRuntimeKey,
  resolveActiveModelProfile,
  type ModelProfile,
  type ModelProfileProtocol,
} from "../shared/model-profile"
import { normalizeDeepSeekModelId } from "../shared/types"
import { DEEPSEEK_BASE_URL, DEFAULT_DEEPSEEK_MODEL, resolveDeepSeekApiKey } from "./deepseek-agent"

export type ModelRuntime =
  | {
    kind: "profile"
    apiKey: string
    baseUrl: string
    modelId: string
    protocol: ModelProfileProtocol
    profile: ModelProfile
  }
  | {
    kind: "legacy"
    apiKey: string
    baseUrl: string
    modelId: string
    protocol: "openai-compat"
    profile: null
  }
  | {
    kind: "none"
    apiKey: ""
    baseUrl: ""
    modelId: ""
    protocol: "openai-compat"
    profile: null
  }

function readSettingsRecord(): Record<string, unknown> | null {
  try {
    const settingsPath = getSettingsFilePath(homedir())
    if (!existsSync(settingsPath)) return null
    const parsed = JSON.parse(readFileSync(settingsPath, "utf8"))
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null
  } catch {
    return null
  }
}

export function resolveModelRuntime(): ModelRuntime {
  const source = readSettingsRecord()
  const profiles = normalizeModelProfiles(source?.modelProfiles)
  const activeId = typeof source?.activeModelProfileId === "string" ? source.activeModelProfileId : null
  const profile = resolveActiveModelProfile(profiles, activeId)
  if (isCompleteModelProfile(profile)) {
    return {
      kind: "profile",
      apiKey: profile.apiKey,
      baseUrl: profile.baseUrl,
      modelId: profile.modelId,
      protocol: profile.protocol,
      profile,
    }
  }

  const legacyKey = resolveDeepSeekApiKey()
  if (legacyKey) {
    return {
      kind: "legacy",
      apiKey: legacyKey,
      baseUrl: process.env.AIANG_BASE_URL ?? DEEPSEEK_BASE_URL,
      modelId: DEFAULT_DEEPSEEK_MODEL,
      protocol: "openai-compat",
      profile: null,
    }
  }

  return { kind: "none", apiKey: "", baseUrl: "", modelId: "", protocol: "openai-compat", profile: null }
}

/** @deprecated 使用 resolveModelRuntime。 */
export function resolveThirdPartyRuntime() {
  const runtime = resolveModelRuntime()
  return {
    mode: runtime.kind === "profile" ? "relay" as const : "official" as const,
    apiKey: runtime.apiKey,
    baseUrl: runtime.baseUrl || DEEPSEEK_BASE_URL,
    modelId: runtime.modelId || undefined,
    profile: runtime.profile,
  }
}

export function modelRuntimeKey(runtime = resolveModelRuntime()): string {
  if (runtime.kind === "profile") return profileRuntimeKey(runtime.profile)
  if (runtime.kind === "legacy") return `legacy:${runtime.baseUrl}:${runtime.modelId}`
  return "none"
}

/**
 * Pick the model sent to a profile-backed engine.
 *
 * A DeepSeek profile is an access channel for the whole official DeepSeek
 * catalog, so an explicit DeepSeek model picked in the composer must win over
 * the profile's saved default. Other profile types keep their fixed model id:
 * a Claude/OpenRouter/custom profile may not expose DeepSeek model names at all.
 */
export function resolveRuntimeModelId(runtime: ModelRuntime, requestedModel: string): string {
  const requested = requestedModel.trim()
  if (runtime.kind === "none") return requested

  const isDeepSeekRuntime = runtime.kind === "legacy"
    || runtime.profile.presetId === "deepseek"
    || /deepseek/i.test(runtime.profile.baseUrl)
  if (isDeepSeekRuntime) {
    if (requested.startsWith("deepseek-")) return normalizeDeepSeekModelId(requested)
    return normalizeDeepSeekModelId(runtime.modelId)
  }

  return runtime.modelId.trim() || requested
}

export function buildCodexConfigFromProfile(profile: ModelProfile): string {
  const baseUrl = profile.baseUrl.replace(/\/+$/, "")
  const wireApi = /deepseek/i.test(profile.baseUrl) || profile.protocol === "anthropic" ? "responses" : "chat"
  return [
    `# 由 Youmi 根据当前模型档案生成`,
    `model = ${JSON.stringify(profile.modelId)}`,
    `model_provider = "custom"`,
    `sandbox_mode = "danger-full-access"`,
    "",
    "[model_providers.custom]",
    `name = ${JSON.stringify(profile.name)}`,
    `wire_api = ${JSON.stringify(wireApi)}`,
    "requires_openai_auth = true",
    `base_url = ${JSON.stringify(baseUrl)}`,
    "",
  ].join("\n")
}

/** 把当前档案同步进 ~/.codex，让原生 Codex 吃同一份配置。 */
export function syncCodexFromModelRuntime(runtime = resolveModelRuntime(), home = homedir()): boolean {
  if (runtime.kind === "none" || !runtime.apiKey) return false
  const profile = runtime.profile ?? {
    id: "legacy-deepseek",
    name: "DeepSeek",
    presetId: "deepseek" as const,
    protocol: "openai-compat" as const,
    baseUrl: runtime.baseUrl,
    apiKey: runtime.apiKey,
    modelId: runtime.modelId,
  }
  try {
    const codexHome = join(home, ".codex")
    mkdirSync(codexHome, { recursive: true })
    writeFileSync(join(codexHome, "config.toml"), buildCodexConfigFromProfile(profile), "utf8")
    writeFileSync(join(codexHome, "auth.json"), `${JSON.stringify({ OPENAI_API_KEY: runtime.apiKey }, null, 2)}\n`, "utf8")
    return true
  } catch {
    return false
  }
}
