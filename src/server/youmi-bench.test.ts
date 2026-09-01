import { describe, expect, test } from "bun:test"
import { writeFileSync } from "node:fs"
import { join } from "node:path"
import {
  cleanupWorkspace,
  createTaskWorkspace,
  scoreWithCollateralGuard,
  summarizeCapabilities,
  summarizeResults,
  unexpectedWorkspaceFiles,
  YOUMI_BENCH_TASKS,
  type BenchTaskResult,
} from "../../scripts/youmi-bench/tasks"

describe("youmi-bench agent-capability tasks", () => {
  test("ships capability-focused tasks (not toy write-only)", () => {
    expect(YOUMI_BENCH_TASKS.length).toBeGreaterThanOrEqual(8)
    for (const task of YOUMI_BENCH_TASKS) {
      expect(task.capabilities.length).toBeGreaterThan(0)
    }
    expect(YOUMI_BENCH_TASKS.some((task) => task.capabilities.includes("shell_verify"))).toBe(true)
    expect(YOUMI_BENCH_TASKS.some((task) => task.capabilities.includes("investigate"))).toBe(true)
  })

  test("shell-debug scores a directory-create fix", () => {
    const task = YOUMI_BENCH_TASKS.find((entry) => entry.id === "shell-debug")
    expect(task).toBeTruthy()
    const workspace = createTaskWorkspace(task!)
    try {
      expect(task!.score(workspace)).not.toBeNull()
      writeFileSync(join(workspace, "scripts/build.mjs"), [
        "import { mkdirSync, writeFileSync } from 'node:fs'",
        "mkdirSync('dist', { recursive: true })",
        "writeFileSync('dist/out.txt', 'artifact')",
        "console.log('DONE')",
        "",
      ].join("\n"), "utf8")
      expect(scoreWithCollateralGuard(task!, workspace)).toBeNull()
    } finally {
      cleanupWorkspace(workspace)
    }
  }, 20_000)

  test("summarizeCapabilities rolls up facets", () => {
    const results: BenchTaskResult[] = [
      {
        taskId: "investigate-fix",
        engine: "youmi",
        passed: true,
        reason: null,
        durationMs: 1,
        capabilities: ["investigate", "edit", "shell_verify"],
      },
      {
        taskId: "investigate-fix",
        engine: "claude",
        passed: false,
        reason: "x",
        durationMs: 1,
        capabilities: ["investigate", "edit", "shell_verify"],
      },
    ]
    expect(summarizeResults(["youmi", "claude"], results)).toEqual({
      youmi: { passed: 1, failed: 0, skipped: 0, total: 1 },
      claude: { passed: 0, failed: 1, skipped: 0, total: 1 },
    })
    expect(summarizeCapabilities(["youmi", "claude"], results)).toEqual({
      youmi: {
        investigate: { passed: 1, total: 1 },
        edit: { passed: 1, total: 1 },
        shell_verify: { passed: 1, total: 1 },
      },
      claude: {
        investigate: { passed: 0, total: 1 },
        edit: { passed: 0, total: 1 },
        shell_verify: { passed: 0, total: 1 },
      },
    })
  })

  test("scoreWithCollateralGuard fails when the agent writes extra files", () => {
    const task = YOUMI_BENCH_TASKS.find((entry) => entry.id === "surgical-edit")
    expect(task).toBeTruthy()
    const workspace = createTaskWorkspace(task!)
    try {
      writeFileSync(join(workspace, "format.js"), [
        "export function formatDate(iso) {",
        "  return iso",
        "}",
        "",
        "export function formatMoney(cents) {",
        "  return `$${(cents / 100).toFixed(2)}`",
        "}",
        "",
      ].join("\n"), "utf8")
      expect(scoreWithCollateralGuard(task!, workspace)).toBeNull()
      writeFileSync(join(workspace, "NOTES.md"), "do not write this", "utf8")
      expect(unexpectedWorkspaceFiles(workspace, Object.keys(task!.seed ?? {}))).toEqual(["NOTES.md"])
      expect(scoreWithCollateralGuard(task!, workspace)).toContain("collateral files")
    } finally {
      cleanupWorkspace(workspace)
    }
  }, 20_000)
})
