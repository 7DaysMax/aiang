import { describe, expect, test } from "bun:test"
import type { ProviderAuthSnapshot } from "../../../shared/types"
import {
  OFFICIAL_STATUS_SOURCES,
  deriveLocalEngineAccess,
  loadOfficialProviderStatuses,
  parseOfficialStatusSummary,
} from "./status-data"

describe("official provider status", () => {
  test("Codex 不会被 OpenAI 页面上无关的故障误判", () => {
    const source = OFFICIAL_STATUS_SOURCES.find((entry) => entry.provider === "codex")!
    const result = parseOfficialStatusSummary(source, {
      page: { updated_at: "2026-09-02T08:00:00Z" },
      components: [
        { id: "responses", name: "Responses API", status: "degraded_performance" },
        { id: "codex-api", name: "Codex API", status: "operational" },
        { id: "codex-web", name: "Codex Web", status: "operational" },
        { id: "vscode", name: "VS Code extension", status: "operational" },
      ],
      incidents: [{ name: "Responses API errors", status: "investigating", components: [{ id: "responses" }] }],
    })

    expect(result.ok).toBe(true)
    expect(result.status).toBe("operational")
    expect(result.components.map((component) => component.id)).toEqual(["codex-api", "codex-web", "vscode"])
    expect(result.events).toEqual([])
  })

  test("详情保留当前引擎的组件描述、事件和维护", () => {
    const source = OFFICIAL_STATUS_SOURCES.find((entry) => entry.provider === "claude")!
    const result = parseOfficialStatusSummary(source, {
      components: [
        { id: "claude-code", name: "Claude Code", status: "degraded_performance", description: "Coding agent" },
        { id: "unrelated", name: "Claude.ai", status: "major_outage" },
      ],
      incidents: [{
        id: "incident-1",
        name: "Claude Code errors",
        status: "monitoring",
        impact: "minor",
        updated_at: "2026-09-02T08:00:00Z",
        components: [{ id: "claude-code" }],
      }],
      scheduled_maintenances: [{
        id: "maintenance-1",
        name: "Claude Code maintenance",
        status: "scheduled",
        components: [{ id: "claude-code" }],
      }],
    })

    expect(result.components[0]?.description).toBe("Coding agent")
    expect(result.events.map((event) => event.type)).toEqual(["incident", "maintenance"])
    expect(result.events[0]?.affectedComponents).toEqual(["Claude Code"])
  })

  test("Claude 事件明确提到 Claude Code 时不会因官方组件标签偏差而漏记", () => {
    const source = OFFICIAL_STATUS_SOURCES.find((entry) => entry.provider === "claude")!
    const result = parseOfficialStatusSummary(source, {
      components: [
        { id: "claude-code", name: "Claude Code", status: "operational" },
        { id: "cowork", name: "Claude Cowork", status: "operational" },
      ],
      incidents: [{
        id: "incident-web",
        name: "Service disruption on Claude Code on the web and related services",
        status: "resolved",
        components: [{ id: "cowork" }],
        incident_updates: [{
          body: "Degraded performance in Claude Code on the Web sessions",
          affected_components: [{ code: "cowork" }],
        }],
      }],
    })

    expect(result.events).toHaveLength(1)
    expect(result.events[0]?.affectedComponents).toEqual(["Claude Code"])
  })

  test("一个官方接口失败不会遮蔽其他引擎", async () => {
    const fetchMock = (async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes("status.claude.com")) return new Response("nope", { status: 503 })
      if (url.includes("status.openai.com")) {
        return Response.json({ components: [{ id: "codex", name: "Codex API", status: "operational" }] })
      }
      return Response.json({ components: [{ id: "cursor", name: "IDE", status: "degraded_performance" }] })
    }) as typeof fetch

    const result = await loadOfficialProviderStatuses(fetchMock)

    expect(result).toHaveLength(3)
    expect(result.find((entry) => entry.provider === "claude")?.ok).toBe(false)
    expect(result.find((entry) => entry.provider === "codex")?.status).toBe("operational")
    expect(result.find((entry) => entry.provider === "cursor")?.status).toBe("degraded")
  })
})

describe("local engine access", () => {
  test("总是返回全部七个引擎，并区分登录、档案和未配置", () => {
    const auth = {
      services: [
        { service: "codex", authStatus: "signed_in", version: "1.2.3", account: "user" },
        { service: "cursor", authStatus: "not_installed", version: null, account: null },
      ],
    } as ProviderAuthSnapshot

    const result = deriveLocalEngineAccess({
      auth,
      appSettings: { activeModelProfileId: null, modelProfiles: [], deepseekApiKey: "configured" },
      llmProvider: { enabled: true, provider: "openrouter", model: "model/test" },
    })

    expect(result).toHaveLength(7)
    expect(result.find((entry) => entry.provider === "codex")?.statusLabel).toBe("已登录")
    expect(result.find((entry) => entry.provider === "cursor")?.statusLabel).toBe("未安装")
    expect(result.find((entry) => entry.provider === "deepseek")?.statusLabel).toBe("已配置")
    expect(result.find((entry) => entry.provider === "pi")?.statusLabel).toBe("已配置")
    expect(result.find((entry) => entry.provider === "youmi")?.statusLabel).toBe("未配置")
  })

  test("当前模型档案会覆盖所有非 Cursor 引擎", () => {
    const result = deriveLocalEngineAccess({
      auth: null,
      appSettings: {
        activeModelProfileId: "profile-1",
        deepseekApiKey: "",
        modelProfiles: [{
          id: "profile-1",
          name: "我的档案",
          presetId: "deepseek",
          protocol: "openai-compat",
          baseUrl: "https://example.com/v1",
          apiKey: "secret",
          modelId: "model-a",
        }],
      },
      llmProvider: null,
    })

    expect(result.filter((entry) => entry.provider !== "cursor").every((entry) => entry.statusLabel === "档案已配置")).toBe(true)
    expect(result.find((entry) => entry.provider === "cursor")?.statusLabel).toBe("检测中")
    expect(result.some((entry) => entry.detail.includes("secret"))).toBe(false)
  })
})
