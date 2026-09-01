import { afterEach, describe, expect, test } from "bun:test"
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { argvForNativeCli, resolveCommandPath, resolveCursorAgentPath, spawnDetached } from "./process-utils"

let fakeHome: string | null = null

afterEach(() => {
  if (fakeHome) rmSync(fakeHome, { recursive: true, force: true })
  fakeHome = null
})

describe("resolveCommandPath", () => {
  test("finds binaries the login-shell PATH misses in well-known user bin dirs", () => {
    // e.g. the native Claude Code installer's ~/.local/bin, whose PATH line
    // goes to the interactive shell rc that `sh -lc` never reads on macOS.
    fakeHome = mkdtempSync(path.join(tmpdir(), "kanna-home-"))
    const binDir = path.join(fakeHome, ".local", "bin")
    mkdirSync(binDir, { recursive: true })
    const binary = path.join(binDir, process.platform === "win32" ? "kanna-fake-cli.cmd" : "kanna-fake-cli")
    writeFileSync(binary, process.platform === "win32" ? "@echo off\n" : "#!/bin/sh\nexit 0\n")
    if (process.platform !== "win32") chmodSync(binary, 0o755)

    expect(resolveCommandPath("kanna-fake-cli", fakeHome)).toBe(binary)
    expect(resolveCommandPath("kanna-missing-cli", fakeHome)).toBeNull()
  })

  test("login-shell resolution still wins when it succeeds", () => {
    fakeHome = mkdtempSync(path.join(tmpdir(), "kanna-home-"))
    if (process.platform === "win32") {
      expect(resolveCommandPath("cmd", fakeHome)?.toLowerCase()).toMatch(/cmd\.exe$/)
      return
    }
    expect(resolveCommandPath("sh", fakeHome)).toMatch(/\/sh$/)
  })
})

describe("argvForNativeCli", () => {
  test("wraps Windows .cmd scripts in cmd.exe /c", () => {
    if (process.platform !== "win32") {
      expect(argvForNativeCli(["/usr/bin/cursor-agent", "login"])).toEqual(["/usr/bin/cursor-agent", "login"])
      return
    }
    expect(argvForNativeCli(["C:\\Users\\me\\cursor-agent.cmd", "login"])).toEqual([
      "cmd.exe",
      "/d",
      "/s",
      "/c",
      "C:\\Users\\me\\cursor-agent.cmd",
      "login",
    ])
  })
})

describe("resolveCursorAgentPath", () => {
  test("finds the official Windows install under LocalAppData", () => {
    if (process.platform !== "win32") return
    const previous = process.env.LOCALAPPDATA
    fakeHome = mkdtempSync(path.join(tmpdir(), "kanna-localapp-"))
    process.env.LOCALAPPDATA = fakeHome
    try {
      const dir = path.join(fakeHome, "cursor-agent")
      mkdirSync(dir, { recursive: true })
      const cmd = path.join(dir, "cursor-agent.cmd")
      writeFileSync(cmd, "@echo off\n")
      const resolved = resolveCursorAgentPath()
      expect(resolved === cmd || resolved?.toLowerCase().includes("cursor-agent")).toBe(true)
    } finally {
      if (previous === undefined) delete process.env.LOCALAPPDATA
      else process.env.LOCALAPPDATA = previous
    }
  })
})

describe("spawnDetached", () => {
  test("rejects when the command does not exist", async () => {
    await expect(spawnDetached("definitely-not-a-real-command-kanna", [])).rejects.toThrow("Command not found")
  })

  test("resolves when the process starts successfully", async () => {
    if (process.platform === "win32") {
      await expect(spawnDetached("cmd.exe", ["/c", "exit", "0"])).resolves.toBeUndefined()
      return
    }
    await expect(spawnDetached("sh", ["-c", "exit 0"])).resolves.toBeUndefined()
  })
})

