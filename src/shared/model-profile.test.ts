import { describe, expect, test } from "bun:test"
import {
  EMPTY_MODEL_PROFILES,
  groupProfilesByPreset,
  inferModelProfilePresetId,
  maskApiKey,
  nextProfileName,
  normalizeModelProfiles,
  penguinProviderForProfile,
  profileAppliesToEngine,
  resolveActiveModelProfile,
} from "./model-profile"

describe("model profiles", () => {
  test("drops malformed entries and keeps the first thirty", () => {
    expect(normalizeModelProfiles([{ name: "no-id" }, { id: "p1", name: "Gateway", baseUrl: "https://x", apiKey: "k", modelId: "m" }])).toEqual([
      { id: "p1", name: "Gateway", presetId: "custom", protocol: "openai-compat", baseUrl: "https://x", apiKey: "k", modelId: "m" },
    ])
  })

  test("empty profile list is a stable singleton for store selectors", () => {
    expect(EMPTY_MODEL_PROFILES).toBe(EMPTY_MODEL_PROFILES)
    expect(EMPTY_MODEL_PROFILES).toEqual([])
  })

  test("infers preset from well-known endpoints when presetId is missing", () => {
    expect(inferModelProfilePresetId({ baseUrl: "https://api.deepseek.com" })).toBe("deepseek")
    expect(inferModelProfilePresetId({ baseUrl: "https://openrouter.ai/api/v1" })).toBe("openrouter")
    expect(inferModelProfilePresetId({ baseUrl: "https://api.anthropic.com", protocol: "anthropic" })).toBe("anthropic")
    expect(inferModelProfilePresetId({ baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1" })).toBe("qwen")
    expect(inferModelProfilePresetId({ presetId: "openai", baseUrl: "https://relay.example/v1" })).toBe("openai")
  })

  test("groups legacy configs that were saved without presetId", () => {
    const grouped = groupProfilesByPreset([
      { id: "a", name: "工作号", protocol: "openai-compat", baseUrl: "https://api.deepseek.com", apiKey: "1", modelId: "m" },
      { id: "b", name: "中转", protocol: "openai-compat", baseUrl: "https://relay.example/v1", apiKey: "2", modelId: "x" },
    ])
    expect(grouped.deepseek.map((profile) => profile.id)).toEqual(["a"])
    expect(grouped.custom.map((profile) => profile.id)).toEqual(["b"])
  })

  test("groups saved configs by service so each provider can hold many", () => {
    const profiles = normalizeModelProfiles([
      { id: "a", name: "工作号", baseUrl: "https://api.deepseek.com", apiKey: "1", modelId: "deepseek-v4-flash" },
      { id: "b", name: "备用", baseUrl: "https://api.deepseek.com", apiKey: "2", modelId: "deepseek-chat" },
      { id: "c", name: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1", apiKey: "3", modelId: "x" },
    ])
    const grouped = groupProfilesByPreset(profiles)
    expect(grouped.deepseek.map((profile) => profile.id)).toEqual(["a", "b"])
    expect(grouped.openrouter.map((profile) => profile.id)).toEqual(["c"])
    expect(grouped.custom).toEqual([])
  })

  test("assigns the next unused config name per service", () => {
    const existing = normalizeModelProfiles([
      { id: "a", name: "DeepSeek", baseUrl: "https://api.deepseek.com", apiKey: "1", modelId: "m" },
    ])
    expect(nextProfileName("DeepSeek", existing)).toBe("DeepSeek 2")
  })

  test("masks api keys for the switcher list", () => {
    expect(maskApiKey("sk-abcdefghijklmnop")).toBe("sk-a…mnop")
    expect(maskApiKey("short")).toBe("••••")
  })

  test("falls back to the first profile when the active id is missing", () => {
    const profiles = normalizeModelProfiles([
      { id: "a", name: "A", baseUrl: "https://a", apiKey: "1", modelId: "m1" },
      { id: "b", name: "B", baseUrl: "https://b", apiKey: "2", modelId: "m2" },
    ])
    expect(resolveActiveModelProfile(profiles, "b")?.id).toBe("b")
    expect(resolveActiveModelProfile(profiles, "missing")?.id).toBe("a")
  })

  test("relay profiles apply to every engine except Cursor", () => {
    const profile = normalizeModelProfiles([{ id: "p1", name: "G", baseUrl: "https://x", apiKey: "k", modelId: "m" }])[0]
    expect(profileAppliesToEngine("youmi", profile)).toBe(true)
    expect(profileAppliesToEngine("pi", profile)).toBe(true)
    expect(profileAppliesToEngine("claude", profile)).toBe(true)
    expect(profileAppliesToEngine("codex", profile)).toBe(true)
    expect(profileAppliesToEngine("cursor", profile)).toBe(false)
  })

  test("maps relay endpoints onto Penguin providers", () => {
    expect(penguinProviderForProfile({
      id: "1",
      name: "ds",
      presetId: "deepseek",
      protocol: "openai-compat",
      baseUrl: "https://api.deepseek.com",
      apiKey: "k",
      modelId: "deepseek-v4-flash",
    })).toBe("deepseek")
    expect(penguinProviderForProfile({
      id: "2",
      name: "or",
      presetId: "openrouter",
      protocol: "openai-compat",
      baseUrl: "https://openrouter.ai/api/v1",
      apiKey: "k",
      modelId: "moonshotai/kimi-k2.5",
    })).toBe("openai")
  })
})
