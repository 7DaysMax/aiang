import { afterEach, describe, expect, test } from "bun:test"
import {
  buildVisionMcpServerSpec,
  buildVisionSystemHint,
  resolveVisionSettings,
  resolveVisionMcpRuntime,
  testVisionConnection,
  VISION_MCP_SERVER_NAME,
} from "./vision"
import type { VisionServiceSettings } from "../shared/types"

const PREV_ENV: Record<string, string | undefined> = {}

afterEach(() => {
  for (const key of Object.keys(PREV_ENV)) {
    if (PREV_ENV[key] === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = PREV_ENV[key]
    }
  }
})

function rememberEnv(...keys: string[]) {
  for (const key of keys) PREV_ENV[key] = process.env[key]
}

const READY: VisionServiceSettings = {
  enabled: true,
  provider: "qwen",
  apiKey: "sk-test",
  baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
  model: "qwen-vl-max-latest",
}

describe("resolveVisionSettings", () => {
  test("enabled/apiKey/env overrides win over settings file", () => {
    rememberEnv("AIANG_VISION_ENABLED", "AIANG_VISION_API_KEY", "AIANG_VISION_PROVIDER", "AIANG_VISION_BASE_URL", "AIANG_VISION_MODEL")
    process.env.AIANG_VISION_ENABLED = "true"
    process.env.AIANG_VISION_API_KEY = "sk-env"
    process.env.AIANG_VISION_PROVIDER = "glm"
    process.env.AIANG_VISION_BASE_URL = "https://example.com/v1"
    process.env.AIANG_VISION_MODEL = "glm-4v-plus"
    const settings = resolveVisionSettings()
    expect(settings.enabled).toBe(true)
    expect(settings.apiKey).toBe("sk-env")
    expect(settings.provider).toBe("glm")
    expect(settings.baseUrl).toBe("https://example.com/v1")
    expect(settings.model).toBe("glm-4v-plus")
  })

  test("unset env falls back to provider defaults", () => {
    rememberEnv("AIANG_VISION_ENABLED", "AIANG_VISION_API_KEY", "AIANG_VISION_PROVIDER", "AIANG_VISION_BASE_URL", "AIANG_VISION_MODEL")
    delete process.env.AIANG_VISION_ENABLED
    delete process.env.AIANG_VISION_API_KEY
    delete process.env.AIANG_VISION_PROVIDER
    delete process.env.AIANG_VISION_BASE_URL
    delete process.env.AIANG_VISION_MODEL
    const settings = resolveVisionSettings()
    expect(settings.enabled).toBe(false)
    expect(settings.provider).toBe("qwen")
    expect(settings.baseUrl).toBe("https://dashscope.aliyuncs.com/compatible-mode/v1")
    expect(settings.model).toBe("qwen-vl-max-latest")
  })
})

describe("buildVisionMcpServerSpec", () => {
  test("returns null when disabled", () => {
    expect(buildVisionMcpServerSpec({ ...READY, enabled: false })).toBeNull()
  })

  test("returns null without an API key", () => {
    expect(buildVisionMcpServerSpec({ ...READY, apiKey: "" })).toBeNull()
  })

  test("builds a stdio spec pointing at the bundled script", () => {
    const spec = buildVisionMcpServerSpec(READY)
    expect(spec).not.toBeNull()
    expect(spec!.type).toBe("stdio")
    expect(spec!.args[0]).toContain("vision-mcp-server.mjs")
    expect(spec!.command.length).toBeGreaterThan(0)
  })

  test("runtime prefers AIANG_VISION_RUNTIME then ~/.bun/bin/bun", () => {
    rememberEnv("AIANG_VISION_RUNTIME")
    process.env.AIANG_VISION_RUNTIME = "/custom/bun"
    expect(resolveVisionMcpRuntime()).toBe("/custom/bun")
    delete process.env.AIANG_VISION_RUNTIME
    expect(resolveVisionMcpRuntime()).toContain("bun")
  })
})

describe("buildVisionSystemHint", () => {
  test("empty when not ready, mentions describe_image when ready", () => {
    expect(buildVisionSystemHint({ ...READY, enabled: false })).toBe("")
    const hint = buildVisionSystemHint(READY)
    expect(hint).toContain("describe_image")
    expect(hint).toContain(VISION_MCP_SERVER_NAME)
  })
})

describe("testVisionConnection", () => {
  test("rejects empty key", async () => {
    const result = await testVisionConnection({ ...READY, apiKey: "" })
    expect(result.ok).toBe(false)
    expect(result.message).toContain("API Key")
  })

  test("surfaces HTTP errors with a 401 hint", async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = (async () => new Response("unauthorized", { status: 401 })) as unknown as typeof fetch
    try {
      const result = await testVisionConnection(READY)
      expect(result.ok).toBe(false)
      expect(result.message).toContain("401")
      expect(result.message).toContain("API Key 无效")
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test("reports success when the endpoint answers", async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body))
      expect(body.model).toBe("qwen-vl-max-latest")
      expect(JSON.stringify(body.messages[0].content)).toContain("data:image/png;base64")
      return new Response(JSON.stringify({ choices: [{ message: { content: "OK" } }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    }) as unknown as typeof fetch
    try {
      const result = await testVisionConnection(READY)
      expect(result.ok).toBe(true)
      expect(result.message).toContain("qwen-vl-max-latest")
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})
