import { describe, expect, test } from "bun:test"
import type { ModelProfile } from "../shared/model-profile"
import { resolveRuntimeModelId, type ModelRuntime } from "./model-profiles"

function profileRuntime(overrides: Partial<ModelProfile> = {}): ModelRuntime {
  const profile: ModelProfile = {
    id: "deepseek-main",
    name: "DeepSeek",
    presetId: "deepseek",
    protocol: "openai-compat",
    baseUrl: "https://api.deepseek.com",
    apiKey: "sk-test",
    modelId: "deepseek-v4-flash",
    ...overrides,
  }
  return {
    kind: "profile",
    apiKey: profile.apiKey,
    baseUrl: profile.baseUrl,
    modelId: profile.modelId,
    protocol: profile.protocol,
    profile,
  }
}

describe("resolveRuntimeModelId", () => {
  test("honors the model picked from the official DeepSeek catalog", () => {
    const runtime = profileRuntime()
    expect(resolveRuntimeModelId(runtime, "deepseek-v4-pro")).toBe("deepseek-v4-pro")
    expect(resolveRuntimeModelId(runtime, "deepseek-v4-flash-vision-exp")).toBe("deepseek-v4-flash-vision-exp")
  })

  test("normalizes legacy DeepSeek ids before sending them", () => {
    const runtime = profileRuntime({ modelId: "deepseek-chat" })
    expect(resolveRuntimeModelId(runtime, "claude-sonnet-4-6")).toBe("deepseek-v4-flash")
    expect(resolveRuntimeModelId(runtime, "deepseek-reasoner")).toBe("deepseek-v4-pro")
  })

  test("honors model selection with the legacy DeepSeek key runtime", () => {
    const runtime: ModelRuntime = {
      kind: "legacy",
      apiKey: "sk-test",
      baseUrl: "https://api.deepseek.com",
      modelId: "deepseek-v4-flash",
      protocol: "openai-compat",
      profile: null,
    }
    expect(resolveRuntimeModelId(runtime, "deepseek-v4-pro")).toBe("deepseek-v4-pro")
    expect(resolveRuntimeModelId(runtime, "deepseek-v4-flash-vision-exp")).toBe("deepseek-v4-flash-vision-exp")
  })

  test("keeps fixed model semantics for non-DeepSeek profiles", () => {
    const runtime = profileRuntime({
      id: "openrouter",
      name: "OpenRouter",
      presetId: "openrouter",
      baseUrl: "https://openrouter.ai/api/v1",
      modelId: "deepseek/deepseek-v3.1-terminus",
    })
    expect(resolveRuntimeModelId(runtime, "deepseek-v4-pro")).toBe("deepseek/deepseek-v3.1-terminus")
  })

  test("passes through the requested model without a profile", () => {
    const runtime: ModelRuntime = {
      kind: "none",
      apiKey: "",
      baseUrl: "",
      modelId: "",
      protocol: "openai-compat",
      profile: null,
    }
    expect(resolveRuntimeModelId(runtime, "gpt-5.6-sol")).toBe("gpt-5.6-sol")
  })
})
