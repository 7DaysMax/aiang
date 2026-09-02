import { afterEach, describe, expect, test } from "bun:test"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { AppSettingsManager, readAppSettingsSnapshot } from "./app-settings"
import type { AppSettingsSnapshot } from "../shared/types"

let tempDirs: string[] = []

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })))
  tempDirs = []
})

async function createTempFilePath() {
  const dir = await mkdtemp(path.join(tmpdir(), "kanna-settings-"))
  tempDirs.push(dir)
  return path.join(dir, "settings.json")
}

function expectedSettingsSnapshot(filePath: string, overrides: Partial<AppSettingsSnapshot> = {}): AppSettingsSnapshot {
  return {
    devbox: false,
    analyticsEnabled: true,
    browserSettingsMigrated: false,
    deepseekApiKey: "",
    setupShown: false,
    setupCompleted: false,
    setupDismissed: false,
  visionService: {
    enabled: false,
    provider: "qwen",
    apiKey: "",
    baseUrl: "",
    model: "",
  },
  memoryEnabled: false,
  memoryMaxChats: 5,
  thirdPartyAccess: "official",
  activeModelProfileId: null,
  modelProfiles: [],
  dockMetrics: {
    balance: true,
    cacheHitRate: true,
    averageCacheHitRate: true,
    sessionTokens: true,
    serviceStatus: false,
  },
  theme: "system",
    chatSoundPreference: "always",
    chatSoundId: "funk",
    terminal: {
      scrollbackLines: 1_000,
      minColumnWidth: 450,
      webglRenderer: false,
    },
    editor: {
      preset: "cursor",
      commandTemplate: "cursor {path}",
    },
    beautifulUi: {
      loading: "Drive",
      thinking: "Reasoning",
      taskRows: "List",
      promptBar: "Rounded",
      codeBlock: "Code",
    },
    defaultProvider: "last_used",
    providerDefaults: {
      claude: {
        model: "opus",
        modelOptions: {
          reasoningEffort: "high",
          contextWindow: "1m",
          fastMode: false,
        },
        planMode: false,
        autoPlan: false,
      },
      codex: {
        model: "gpt-5.6-sol",
        modelOptions: {
          reasoningEffort: "low",
          fastMode: false,
        },
        planMode: false,
        autoPlan: false,
      },
      cursor: {
        model: "composer-2.5",
        modelOptions: {
          fastMode: false,
        },
        planMode: false,
        autoPlan: false,
      },
      deepseek: {
        model: "deepseek-v4-flash",
        modelOptions: {
          reasoningEffort: "high",
          fastMode: false,
        },
        planMode: false,
        autoPlan: false,
      },
      reasonix: {
        model: "deepseek-v4-flash",
        modelOptions: {
          reasoningEffort: "high",
          fastMode: false,
        },
        planMode: false,
        autoPlan: false,
      },
      youmi: {
        model: "deepseek-v4-flash",
        modelOptions: {
          reasoningEffort: "max",
          fastMode: false,
        },
        planMode: false,
        autoPlan: false,
      },
      pi: {
        model: "~anthropic/claude-fable-latest",
        modelOptions: {
          reasoningEffort: "medium",
        },
        planMode: false,
        autoPlan: false,
      },
    },
    newSidebarEnabled: true,
    newProjectsDirectory: "~/YoumiAiagent",
    warning: null,
    filePathDisplay: filePath,
    ...overrides,
  }
}

describe("readAppSettingsSnapshot", () => {
  test("returns defaults when the file does not exist", async () => {
    const filePath = await createTempFilePath()
    const snapshot = await readAppSettingsSnapshot(filePath)

    expect(snapshot).toEqual(expectedSettingsSnapshot(filePath))
  })

  test("devbox extra is server-computed: in every snapshot, never persisted", async () => {
    const filePath = await createTempFilePath()
    const manager = new AppSettingsManager(filePath, { devbox: true })
    await manager.initialize()
    try {
      expect(manager.getSnapshot().devbox).toBe(true)

      // Survives a settings write and is present on the returned snapshot…
      const written = await manager.writePatch({ theme: "dark" })
      expect(written.devbox).toBe(true)

      // …but never lands in the file.
      const raw = JSON.parse(await readFile(filePath, "utf8")) as Record<string, unknown>
      expect("devbox" in raw).toBe(false)
    } finally {
      manager.dispose()
    }

    // Default (no extras) is false.
    const plain = new AppSettingsManager(filePath)
    expect(plain.getSnapshot().devbox).toBe(false)
    plain.dispose()
  })

  test("returns a warning when the file contains invalid json", async () => {
    const filePath = await createTempFilePath()
    await writeFile(filePath, "{not-json", "utf8")

    const snapshot = await readAppSettingsSnapshot(filePath)
    expect(snapshot.analyticsEnabled).toBe(true)
    expect(snapshot.warning).toContain("invalid JSON")
  })

  test("newProjectsDirectory defaults to ~/YoumiAiagent, trims, and warns on invalid values", async () => {
    const filePath = await createTempFilePath()

    // Missing → default, no warning.
    expect((await readAppSettingsSnapshot(filePath)).newProjectsDirectory).toBe("~/YoumiAiagent")

    // Custom value trims.
    await writeFile(filePath, JSON.stringify({ newProjectsDirectory: "  ~/Dev/Projects  " }), "utf8")
    const custom = await readAppSettingsSnapshot(filePath)
    expect(custom.newProjectsDirectory).toBe("~/Dev/Projects")
    expect(custom.warning).toBeNull()

    // Wrong type → default + warning.
    await writeFile(filePath, JSON.stringify({ newProjectsDirectory: 42 }), "utf8")
    const invalid = await readAppSettingsSnapshot(filePath)
    expect(invalid.newProjectsDirectory).toBe("~/YoumiAiagent")
    expect(invalid.warning).toContain("newProjectsDirectory")

    // Empty string → default + warning.
    await writeFile(filePath, JSON.stringify({ newProjectsDirectory: "  " }), "utf8")
    const empty = await readAppSettingsSnapshot(filePath)
    expect(empty.newProjectsDirectory).toBe("~/YoumiAiagent")
    expect(empty.warning).toContain("newProjectsDirectory")
  })

  test("newProjectsDirectory survives a writePatch round-trip and lands in the file", async () => {
    const filePath = await createTempFilePath()
    const manager = new AppSettingsManager(filePath)
    await manager.initialize()
    try {
      const snapshot = await manager.writePatch({ newProjectsDirectory: "~/Dev" })
      expect(snapshot.newProjectsDirectory).toBe("~/Dev")

      const raw = JSON.parse(await readFile(filePath, "utf8")) as { newProjectsDirectory: string }
      expect(raw.newProjectsDirectory).toBe("~/Dev")
    } finally {
      manager.dispose()
    }
  })
})

describe("AppSettingsManager", () => {
  test("creates a settings file with analytics enabled and a stable anonymous id", async () => {
    const filePath = await createTempFilePath()
    const manager = new AppSettingsManager(filePath)

    await manager.initialize()

    const payload = JSON.parse(await readFile(filePath, "utf8")) as {
      analyticsEnabled: boolean
      analyticsUserId: string
    }
    expect(payload.analyticsEnabled).toBe(true)
    expect(payload.analyticsUserId).toMatch(/^anon_/)
    expect(manager.getSnapshot()).toEqual(expectedSettingsSnapshot(filePath))

    manager.dispose()
  })

  test("writes analyticsEnabled without replacing the stored user id", async () => {
    const filePath = await createTempFilePath()
    const manager = new AppSettingsManager(filePath)

    await manager.initialize()
    const initialPayload = JSON.parse(await readFile(filePath, "utf8")) as {
      analyticsEnabled: boolean
      analyticsUserId: string
    }

    const snapshot = await manager.write({ analyticsEnabled: false })
    const nextPayload = JSON.parse(await readFile(filePath, "utf8")) as {
      analyticsEnabled: boolean
      analyticsUserId: string
    }

    expect(snapshot).toEqual(expectedSettingsSnapshot(filePath, { analyticsEnabled: false }))
    expect(nextPayload.analyticsEnabled).toBe(false)
    expect(nextPayload.analyticsUserId).toBe(initialPayload.analyticsUserId)

    manager.dispose()
  })

  test("persists setup-wizard markers across restarts so onboarding is per machine", async () => {
    const filePath = await createTempFilePath()
    const manager = new AppSettingsManager(filePath)

    await manager.initialize()
    expect(manager.getSnapshot().setupCompleted).toBe(false)

    await manager.writePatch({ setupShown: true, setupCompleted: true, setupDismissed: true })

    const payload = JSON.parse(await readFile(filePath, "utf8")) as {
      setupShown: boolean
      setupCompleted: boolean
      setupDismissed: boolean
    }
    expect(payload).toMatchObject({ setupShown: true, setupCompleted: true, setupDismissed: true })
    manager.dispose()

    // A second process (or any other browser) reads the same completed state.
    const reopened = new AppSettingsManager(filePath)
    await reopened.initialize()
    expect(reopened.getSnapshot()).toMatchObject({
      setupShown: true,
      setupCompleted: true,
      setupDismissed: true,
    })
    reopened.dispose()
  })

  test("patches expanded settings without replacing the stored user id", async () => {
    const filePath = await createTempFilePath()
    const manager = new AppSettingsManager(filePath)

    await manager.initialize()
    const initialPayload = JSON.parse(await readFile(filePath, "utf8")) as {
      analyticsUserId: string
    }

    const snapshot = await manager.writePatch({
      theme: "dark",
      chatSoundId: "glass",
      terminal: { scrollbackLines: 2_500 },
      editor: { preset: "vscode" },
      providerDefaults: {
        codex: {
          modelOptions: { reasoningEffort: "high", fastMode: true },
        },
      },
    })
    const nextPayload = JSON.parse(await readFile(filePath, "utf8")) as {
      analyticsUserId: string
      theme: string
      chatSoundId: string
      terminal: { scrollbackLines: number; minColumnWidth: number }
      editor: { preset: string; commandTemplate: string }
      providerDefaults: { codex: { modelOptions: { fastMode: boolean } } }
    }

    expect(snapshot.theme).toBe("dark")
    expect(snapshot.chatSoundId).toBe("glass")
    expect(snapshot.terminal.scrollbackLines).toBe(2_500)
    expect(snapshot.terminal.minColumnWidth).toBe(450)
    expect(snapshot.editor.preset).toBe("vscode")
    expect(snapshot.editor.commandTemplate).toBe("cursor {path}")
    expect(snapshot.providerDefaults.codex.modelOptions.fastMode).toBe(true)
    expect(nextPayload.analyticsUserId).toBe(initialPayload.analyticsUserId)
    expect(nextPayload.theme).toBe("dark")
    expect(nextPayload.chatSoundId).toBe("glass")

    manager.dispose()
  })

  test("dockMetrics default to all-on and survive a writePatch round-trip", async () => {
    const filePath = await createTempFilePath()
    const manager = new AppSettingsManager(filePath)
    await manager.initialize()

    const defaults = manager.getSnapshot()
    expect(defaults.dockMetrics).toEqual({
      balance: true,
      cacheHitRate: true,
      averageCacheHitRate: true,
      sessionTokens: true,
      serviceStatus: false,
    })

    const snapshot = await manager.writePatch({
      dockMetrics: { balance: false, sessionTokens: false },
    })
    expect(snapshot.dockMetrics).toEqual({
      balance: false,
      cacheHitRate: true,
      averageCacheHitRate: true,
      sessionTokens: false,
      serviceStatus: false,
    })

    const nextPayload = JSON.parse(await readFile(filePath, "utf8")) as { dockMetrics: AppSettingsSnapshot["dockMetrics"] }
    expect(nextPayload.dockMetrics.balance).toBe(false)
    expect(nextPayload.dockMetrics.cacheHitRate).toBe(true)

    manager.dispose()
  })

  test("persists every Beautiful UI component variant as one merged preference object", async () => {
    const filePath = await createTempFilePath()
    const manager = new AppSettingsManager(filePath)
    await manager.initialize()

    await manager.writePatch({ beautifulUi: { loading: "Orbit", promptBar: "Pill" } })
    const snapshot = await manager.writePatch({
      beautifulUi: {
        thinking: "Coding",
        taskRows: "Capsules",
        codeBlock: "Diff",
      },
    })

    expect(snapshot.beautifulUi).toEqual({
      loading: "Orbit",
      thinking: "Coding",
      taskRows: "Capsules",
      promptBar: "Pill",
      codeBlock: "Diff",
    })

    const reopened = new AppSettingsManager(filePath)
    await reopened.initialize()
    expect(reopened.getSnapshot().beautifulUi).toEqual(snapshot.beautifulUi)
    reopened.dispose()
    manager.dispose()
  })

  test("visionService normalizes and survives a writePatch round-trip", async () => {
    const filePath = await createTempFilePath()
    const manager = new AppSettingsManager(filePath)
    await manager.initialize()

    expect(manager.getSnapshot().visionService).toEqual({
      enabled: false,
      provider: "qwen",
      apiKey: "",
      baseUrl: "",
      model: "",
    })

    const snapshot = await manager.writePatch({
      visionService: {
        enabled: true,
        provider: "glm",
        apiKey: " sk-123 ",
        baseUrl: " https://open.bigmodel.cn/api/paas/v4 ",
        model: " glm-4v-flash ",
      },
    })
    expect(snapshot.visionService).toEqual({
      enabled: true,
      provider: "glm",
      apiKey: "sk-123",
      baseUrl: "https://open.bigmodel.cn/api/paas/v4",
      model: "glm-4v-flash",
    })

    const nextPayload = JSON.parse(await readFile(filePath, "utf8")) as {
      visionService: AppSettingsSnapshot["visionService"]
    }
    expect(nextPayload.visionService.enabled).toBe(true)
    expect(nextPayload.visionService.apiKey).toBe("sk-123")

    manager.dispose()
  })

  test("normalizes Codex engine reasoning levels when settings are written", async () => {
    const filePath = await createTempFilePath()
    const manager = new AppSettingsManager(filePath)
    await manager.initialize()

    // 旧版错误挂在 Codex 下的 DeepSeek 模型迁回官方默认。
    const flash = await manager.writePatch({
      providerDefaults: {
        codex: { model: "deepseek-v4-flash", modelOptions: { reasoningEffort: "max" } },
      },
    })
    expect(flash.providerDefaults.codex).toMatchObject({
      model: "gpt-5.6-sol",
      modelOptions: { reasoningEffort: "max", fastMode: false },
    })

    // 官方 GPT-5.6 模型和 Ultra 原样保留。
    const sol = await manager.writePatch({
      providerDefaults: {
        codex: { model: "gpt-5.6-sol", modelOptions: { reasoningEffort: "ultra" } },
      },
    })
    expect(sol.providerDefaults.codex).toMatchObject({
      model: "gpt-5.6-sol",
      modelOptions: { reasoningEffort: "ultra", fastMode: false },
    })

    const legacy = await manager.writePatch({
      providerDefaults: {
        codex: { model: "gpt-5.5", modelOptions: { reasoningEffort: "xhigh" } },
      },
    })
    expect(legacy.providerDefaults.codex).toMatchObject({
      model: "gpt-5.5",
      modelOptions: { reasoningEffort: "xhigh", fastMode: false },
    })

    manager.dispose()
  })
})
