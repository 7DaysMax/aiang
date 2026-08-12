import { describe, expect, test } from "bun:test"
import { homedir } from "node:os"
import path from "node:path"
import { mkdtempSync, writeFileSync, existsSync } from "node:fs"
import { tmpdir } from "node:os"
import {
  aiangCodexBinary,
  codexInstallLogPath,
  codexPlatformAsset,
  describeCodexProbeFailure,
  detectCodex,
  pickCodexExecutable,
  readCodexAuthSummary,
} from "./codex-install"
import { resolveCcbExecutable } from "./deepseek-agent"
import { createTestRouter } from "./ws-router.test"

describe("codex install helpers", () => {
  test("aiangCodexBinary points into the app data bin dir", () => {
    expect(aiangCodexBinary()).toBe(path.join(homedir(), ".aiang", "bin", "codex"))
  })

  test("readCodexAuthSummary handles a missing auth file", () => {
    const result = readCodexAuthSummary()
    expect(typeof result.configured).toBe("boolean")
    expect(typeof result.provider).toBe("string")
  })

  test("resolveCcbExecutable resolves to a bundled engine binary", () => {
    const exe = resolveCcbExecutable()
    expect(existsSync(exe)).toBe(true)
    // Windows 上应解析到 ccb-bin.exe（PE），其余平台 ccb-bin。
    const expectedName = process.platform === "win32" ? "ccb-bin.exe" : "ccb-bin"
    expect(exe.endsWith(expectedName)).toBe(true)
  })

  test("codexPlatformAsset covers mac, linux and windows x64", () => {
    expect(codexPlatformAsset("darwin", "arm64")).toBe("codex-aarch64-apple-darwin.tar.gz")
    expect(codexPlatformAsset("darwin", "x64")).toBe("codex-x86_64-apple-darwin.tar.gz")
    expect(codexPlatformAsset("linux", "x64")).toBe("codex-x86_64-unknown-linux-musl.tar.gz")
    expect(codexPlatformAsset("win32", "x64")).toBe("codex-x86_64-pc-windows-msvc.exe.zip")
    expect(codexPlatformAsset("win32", "arm64")).toBeNull()
    expect(codexPlatformAsset("linux", "arm64")).toBeNull()
  })

  test("detectCodex returns a well-formed result", async () => {
    const result = await detectCodex()
    expect(typeof result.installed).toBe("boolean")
    if (result.installed) {
      expect(typeof result.version).toBe("string")
    }
  })

  test("describeCodexProbeFailure maps missing VC++ runtime on Windows", () => {
    // target 必须真实存在，才会走到退出码映射分支（文件被删会优先命中
    // 「被隔离」提示）。
    const message = describeCodexProbeFailure(
      { status: -1073741515, stderr: "", stdout: "", error: null } as never,
      import.meta.path,
    )
    expect(message).toContain("Visual C++")
    expect(message).toContain("0xC0000135")
  })

  test("describeCodexProbeFailure flags a quarantined binary", () => {
    // 二进制不存在（被安全软件隔离/删除）时给出恢复指引。
    const message = describeCodexProbeFailure(
      { status: null, stderr: "", stdout: "", error: null } as never,
      path.join(homedir(), ".aiang", "bin", "definitely-missing-codex.exe"),
    )
    expect(message).toContain("安全中心")
  })

  test("describeCodexProbeFailure maps missing entry point runtime error", () => {
    const message = describeCodexProbeFailure(
      { status: -1073741511, stderr: "", stdout: "", error: null } as never, // 0xC0000139
      import.meta.path,
    )
    expect(message).toContain("入口点")
    expect(message).toContain("0xC0000139")
  })

  test("describeCodexProbeFailure includes the install log path", () => {
    const message = describeCodexProbeFailure(
      { status: 0x8007007E >>> 0, stderr: "", stdout: "", error: null } as never,
      import.meta.path,
      "C:\\Users\\me\\.aiang\\logs\\codex-install.log",
    )
    expect(message).toContain("codex-install.log")
  })

  test("codexInstallLogPath lives under the app data logs dir", () => {
    expect(codexInstallLogPath()).toBe(path.join(homedir(), ".aiang", "logs", "codex-install.log"))
  })

  test("pickCodexExecutable selects the largest file (multi-exe release zip)", () => {
    // 0.147.0 的 Windows 压缩包同时含 command-runner / sandbox-setup / 主程序。
    const dir = mkdtempSync(path.join(tmpdir(), "codex-pick-"))
    const runner = path.join(dir, "codex-command-runner.exe")
    const sandbox = path.join(dir, "codex-windows-sandbox-setup.exe")
    const main = path.join(dir, "codex-x86_64-pc-windows-msvc.exe")
    writeFileSync(runner, "runner")
    writeFileSync(sandbox, "sandbox-setup")
    writeFileSync(main, "main".repeat(1024 * 1024))

    const picked = pickCodexExecutable([runner, sandbox, main])
    expect(picked).toBe(main)

    const ignored = pickCodexExecutable([runner, sandbox])
    expect(ignored).toBe(sandbox)
  })

  test("pickCodexExecutable ignores directories and missing paths", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "codex-pick-dir-"))
    const file = path.join(dir, "codex.exe")
    writeFileSync(file, "x")
    expect(pickCodexExecutable([dir, path.join(dir, "missing.exe"), file])).toBe(file)
    expect(pickCodexExecutable([path.join(dir, "missing.exe")])).toBeNull()
  })
})

describe("ws router codex commands", () => {
  class FakeCodexWs {
    readonly sent: unknown[] = []
    readonly data = {
      subscriptions: new Map(),
      snapshotSignatures: new Map(),
      protectedDraftChatIds: new Set<string>(),
    }
    send(message: string) {
      this.sent.push(JSON.parse(message))
    }
    close() {}
  }

  function acksOf(ws: FakeCodexWs) {
    return ws.sent.filter((entry) => (entry as { type: string }).type === "ack")
  }

  test("codex.detect ack carries the detection result", async () => {
    const router = createTestRouter({
      detectCodexImpl: async () => ({ installed: true, version: "codex-cli 9.9.9", path: "/fake/codex" }),
    } as never)
    const ws = new FakeCodexWs()
    router.handleOpen(ws as never)

    await router.handleMessage(
      ws as never,
      JSON.stringify({ v: 1, type: "command", id: "detect-1", command: { type: "codex.detect" } })
    )

    expect(acksOf(ws)).toEqual([{ v: 1, type: "ack", id: "detect-1", result: { installed: true, version: "codex-cli 9.9.9", path: "/fake/codex" } }])
  })

  test("codex.install ack carries the install result", async () => {
    const router = createTestRouter({
      detectCodexImpl: async () => ({ installed: false }),
      installCodexImpl: async () => ({ ok: true, message: "installed", version: "codex-cli 9.9.9", path: "/fake/codex" }),
    } as never)
    const ws = new FakeCodexWs()
    router.handleOpen(ws as never)

    await router.handleMessage(
      ws as never,
      JSON.stringify({ v: 1, type: "command", id: "install-1", command: { type: "codex.install" } })
    )

    expect(acksOf(ws)).toEqual([
      { v: 1, type: "ack", id: "install-1", result: { ok: true, message: "installed", version: "codex-cli 9.9.9", path: "/fake/codex" } },
    ])
  })
})
