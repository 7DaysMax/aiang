import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, test } from "bun:test"
import { assertPublicHttpUrl, executeGlobTool, executeGrepTool, executeNowTool } from "./youmi-plugins"

describe("youmi coding tool plugins", () => {
  test("glob lists files matching a pattern inside the workspace", async () => {
    const root = mkdtempSync(join(tmpdir(), "youmi-glob-"))
    try {
      mkdirSync(join(root, "src"), { recursive: true })
      writeFileSync(join(root, "src/a.ts"), "export const a = 1\n")
      writeFileSync(join(root, "src/b.tsx"), "export const b = 1\n")
      writeFileSync(join(root, "readme.md"), "hi\n")
      const output = await executeGlobTool(
        { pattern: "src/*.ts" },
        { workspaceDir: root, toolCallId: "t1" },
      )
      expect(output).toContain("src/a.ts")
      expect(output).not.toContain("src/b.tsx")
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  test("grep searches file contents", async () => {
    const root = mkdtempSync(join(tmpdir(), "youmi-grep-"))
    try {
      mkdirSync(join(root, "src"), { recursive: true })
      writeFileSync(join(root, "src/a.ts"), "export function Agent() {}\n")
      const output = await executeGrepTool(
        { pattern: "Agent", glob: "*.ts" },
        { workspaceDir: root, toolCallId: "t2" },
      )
      expect(output).toContain("src/a.ts:1:")
      expect(output).toContain("Agent")
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  test("rejects paths outside the workspace", async () => {
    const root = mkdtempSync(join(tmpdir(), "youmi-glob-out-"))
    try {
      await expect(executeGlobTool(
        { pattern: "*", path: ".." },
        { workspaceDir: root, toolCallId: "t3" },
      )).rejects.toThrow("outside the workspace")
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  test("blocks private fetch_url targets and returns the current time", async () => {
    expect(() => assertPublicHttpUrl("http://127.0.0.1/secret")).toThrow(/private or localhost/)
    expect(() => assertPublicHttpUrl("http://192.168.1.8/x")).toThrow(/private or localhost/)
    expect(() => assertPublicHttpUrl("file:///etc/passwd")).toThrow(/http\/https/)
    expect(assertPublicHttpUrl("https://example.com/a").hostname).toBe("example.com")
    const now = await executeNowTool()
    expect(now).toContain("T")
  })
})
