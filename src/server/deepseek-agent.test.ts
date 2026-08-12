import { afterEach, describe, expect, test } from "bun:test"
import {
  buildCcbEnv,
  ccbSdkModel,
  DEFAULT_DEEPSEEK_MODEL,
  fetchDeepSeekBalance,
  optimizePrompt,
  resolveDeepSeekModel,
  testDeepSeekConnection,
  vendoredRgPath,
  withVendoredRgOnPath,
} from "./deepseek-agent"

const ENV_KEYS = ["AIANG_MODEL", "AIANG_BASE_URL"] as const

describe("buildCcbEnv", () => {
  afterEach(() => {
    for (const key of ENV_KEYS) {
      delete process.env[key]
    }
  })

  test("injects the selected model into OPENAI_MODEL", () => {
    const env = buildCcbEnv("sk-test", "deepseek-v4-pro")
    expect(env.CLAUDE_CODE_USE_OPENAI).toBe("1")
    expect(env.OPENAI_API_KEY).toBe("sk-test")
    expect(env.OPENAI_MODEL).toBe("deepseek-v4-pro")
  })

  test("defaults OPENAI_MODEL to the provider default when no model is passed", () => {
    const env = buildCcbEnv("sk-test")
    expect(env.OPENAI_MODEL).toBe(DEFAULT_DEEPSEEK_MODEL)
  })

  test("AIANG_MODEL env override wins over the selected model", () => {
    process.env.AIANG_MODEL = "custom-model"
    const env = buildCcbEnv("sk-test", "deepseek-v4-flash")
    expect(env.OPENAI_MODEL).toBe("custom-model")
  })

  test("passes the reasoning effort to ccb via CLAUDE_CODE_EFFORT_LEVEL", () => {
    const env = buildCcbEnv("sk-test", "deepseek-v4-flash", "max")
    expect(env.CLAUDE_CODE_EFFORT_LEVEL).toBe("max")
  })

  test("omits CLAUDE_CODE_EFFORT_LEVEL when no effort is selected", () => {
    const env = buildCcbEnv("sk-test", "deepseek-v4-flash")
    expect(env.CLAUDE_CODE_EFFORT_LEVEL).toBeUndefined()
  })

  test("forces system ripgrep so Grep never falls back with a confusing note", () => {
    const env = buildCcbEnv("sk-test")
    expect(env.USE_BUILTIN_RIPGREP).toBe("0")
  })
})

describe("vendored ripgrep", () => {
  test("resolves the shipped rg binary next to the engine", () => {
    const rg = vendoredRgPath()
    expect(rg).not.toBeNull()
    expect(rg).toMatch(/vendor[\\/]ccb[\\/]rg(\.exe)?$/)
  })

  test("prepends the rg directory to PATH", () => {
    const env = withVendoredRgOnPath({ PATH: "/usr/bin:/bin" })
    const rg = vendoredRgPath()
    expect(rg).not.toBeNull()
    const separator = process.platform === "win32" ? ";" : ":"
    expect(env.PATH).toBe(`${rg!.replace(/[\\/]rg(\.exe)?$/, "")}${separator}/usr/bin:/bin`)
  })
})

describe("ccbSdkModel", () => {
  test("appends the [1m] context marker for deepseek models", () => {
    expect(ccbSdkModel("deepseek-v4-flash")).toBe("deepseek-v4-flash[1m]")
    expect(ccbSdkModel("deepseek-v4-pro")).toBe("deepseek-v4-pro[1m]")
  })

  test("leaves non-deepseek models untouched (official claude engine)", () => {
    expect(ccbSdkModel("opus")).toBe("opus")
    expect(ccbSdkModel("sonnet")).toBe("sonnet")
  })

  test("keeps OPENAI_MODEL clean: buildCcbEnv never receives the marker", () => {
    const env = buildCcbEnv("sk-test", "deepseek-v4-flash")
    expect(env.OPENAI_MODEL).toBe("deepseek-v4-flash")
  })
})

describe("fetchDeepSeekBalance", () => {
  const originalFetch = globalThis.fetch

  afterEach(() => {
    delete process.env.DEEPSEEK_API_KEY
    globalThis.fetch = originalFetch
  })

  function mockFetchOnce(response: Response | Error) {
    globalThis.fetch = Object.assign(
      async () => {
        if (response instanceof Error) throw response
        return response
      },
      { preconnect: originalFetch.preconnect?.bind(originalFetch) ?? (async () => {}) },
    ) as typeof fetch
  }

  test("returns the balance when the endpoint responds", async () => {
    process.env.DEEPSEEK_API_KEY = "sk-test"
    mockFetchOnce(new Response(JSON.stringify({
      is_available: true,
      balance_infos: [
        { currency: "CNY", total_balance: "4.55", granted_balance: "0.00", topped_up_balance: "4.55" },
      ],
    }), { status: 200 }))

    const balance = await fetchDeepSeekBalance()
    expect(balance.available).toBe(true)
    expect(balance.currency).toBe("CNY")
    expect(balance.totalBalance).toBe("4.55")
    expect(balance.toppedUpBalance).toBe("4.55")
  })

  test("reports unauthorized when the key is rejected", async () => {
    process.env.DEEPSEEK_API_KEY = "sk-bad"
    mockFetchOnce(new Response("unauthorized", { status: 401 }))

    const balance = await fetchDeepSeekBalance()
    expect(balance.available).toBe(false)
    expect(balance.error).toBe("unauthorized")
  })

  test("reports request_failed when the endpoint is unreachable", async () => {
    process.env.DEEPSEEK_API_KEY = "sk-test"
    mockFetchOnce(new TypeError("network down"))

    const balance = await fetchDeepSeekBalance()
    expect(balance.available).toBe(false)
    expect(balance.error).toBe("request_failed")
  })
})

describe("testDeepSeekConnection", () => {
  const originalFetch = globalThis.fetch

  afterEach(() => {
    delete process.env.DEEPSEEK_API_KEY
    globalThis.fetch = originalFetch
  })

  function jsonResponse(status: number, body: unknown): Response {
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
  }

  function mockFetchByUrl(handler: (url: string) => Response) {
    globalThis.fetch = Object.assign(
      async (input: RequestInfo | URL) => handler(String(input)),
      { preconnect: originalFetch.preconnect?.bind(originalFetch) ?? (async () => {}) },
    ) as typeof fetch
  }

  test("reports invalid_key when the stored value looks like pasted error text", async () => {
    process.env.DEEPSEEK_API_KEY = "# 无法读取文件 读取失败:405 Method Not Allowed"
    const result = await testDeepSeekConnection()
    expect(result.ok).toBe(false)
    expect(result.error).toBe("invalid_key")
  })

  test("reports unauthorized when the endpoint rejects the key", async () => {
    process.env.DEEPSEEK_API_KEY = "sk-test123456"
    mockFetchByUrl(() => jsonResponse(401, { error: { message: "bad key" } }))
    const result = await testDeepSeekConnection()
    expect(result.ok).toBe(false)
    expect(result.error).toBe("unauthorized")
  })

  test("returns the pulled models and balance on success", async () => {
    process.env.DEEPSEEK_API_KEY = "sk-test123456"
    mockFetchByUrl((url) => {
      if (url.endsWith("/user/balance")) {
        return jsonResponse(200, { balance_infos: [{ currency: "CNY", total_balance: "12.34" }] })
      }
      return jsonResponse(200, {
        data: [
          { id: "deepseek-chat" },
          { id: "deepseek-reasoner" },
          { notAnId: true },
        ],
      })
    })
    const result = await testDeepSeekConnection()
    expect(result.ok).toBe(true)
    expect(result.keyValid).toBe(true)
    expect(result.modelCount).toBe(2)
    expect(result.models.map((model) => model.id)).toEqual(["deepseek-chat", "deepseek-reasoner"])
    expect(result.totalBalance).toBe("12.34")
    expect(result.currency).toBe("CNY")
  })
})

describe("optimizePrompt", () => {
  const originalFetch = globalThis.fetch

  afterEach(() => {
    delete process.env.DEEPSEEK_API_KEY
    delete process.env.AIANG_MODEL
    globalThis.fetch = originalFetch
  })

  function jsonResponse(status: number, body: unknown): Response {
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
  }

  function mockFetchByUrl(handler: (url: string) => Response) {
    globalThis.fetch = Object.assign(
      async (input: RequestInfo | URL) => handler(String(input)),
      { preconnect: originalFetch.preconnect?.bind(originalFetch) ?? (async () => {}) },
    ) as typeof fetch
  }

  test("returns the optimized prompt from the chat completions response", async () => {
    process.env.DEEPSEEK_API_KEY = "sk-test123456"
    mockFetchByUrl(() => jsonResponse(200, {
      choices: [{ message: { content: "请帮我写一个更详细的 React 组件，包含 TypeScript 类型定义。" } }],
    }))

    const result = await optimizePrompt("写个react组件")
    expect(result.ok).toBe(true)
    expect(result.optimized).toBe("请帮我写一个更详细的 React 组件，包含 TypeScript 类型定义。")
  })

  test("reports invalid_key when the stored value looks like pasted error text", async () => {
    process.env.DEEPSEEK_API_KEY = "# 无法读取文件 读取失败:405 Method Not Allowed"
    const result = await optimizePrompt("写个react组件")
    expect(result.ok).toBe(false)
    expect(result.error).toBe("invalid_key")
  })

  test("reports empty_prompt when the input is blank", async () => {
    process.env.DEEPSEEK_API_KEY = "sk-test123456"
    const result = await optimizePrompt("   ")
    expect(result.ok).toBe(false)
    expect(result.error).toBe("empty_prompt")
  })

  test("reports unauthorized when the endpoint rejects the key", async () => {
    process.env.DEEPSEEK_API_KEY = "sk-test123456"
    mockFetchByUrl(() => jsonResponse(401, { error: { message: "bad key" } }))
    const result = await optimizePrompt("写个react组件")
    expect(result.ok).toBe(false)
    expect(result.error).toBe("unauthorized")
  })

  test("reports request_failed when the endpoint is unreachable", async () => {
    process.env.DEEPSEEK_API_KEY = "sk-test123456"
    globalThis.fetch = Object.assign(
      async () => { throw new TypeError("network down") },
      { preconnect: originalFetch.preconnect?.bind(originalFetch) ?? (async () => {}) },
    ) as typeof fetch
    const result = await optimizePrompt("写个react组件")
    expect(result.ok).toBe(false)
    expect(result.error).toBe("request_failed")
  })

  test("AIANG_MODEL env override picks the model for the request", async () => {
    process.env.AIANG_MODEL = "deepseek-v4-pro"
    process.env.DEEPSEEK_API_KEY = "sk-test123456"
    expect(resolveDeepSeekModel()).toBe("deepseek-v4-pro")
    let requestedBody = ""
    globalThis.fetch = Object.assign(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        requestedBody = typeof init?.body === "string" ? init.body : ""
        return jsonResponse(200, { choices: [{ message: { content: "ok" } }] })
      },
      { preconnect: originalFetch.preconnect?.bind(originalFetch) ?? (async () => {}) },
    ) as typeof fetch
    const result = await optimizePrompt("写个react组件")
    expect(result.ok).toBe(true)
    expect(JSON.parse(requestedBody).model).toBe("deepseek-v4-pro")
  })
})
