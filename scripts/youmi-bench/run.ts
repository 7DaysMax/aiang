#!/usr/bin/env bun
/**
 * Youmi coding bench — agent capability parity gate:
 *   Youmi  = PenguinHarness + DeepSeek
 *   Claude = Claude Code agent harness (vendored ccb) + DeepSeek
 *
 * Same DeepSeek model on both sides — compare agent capability, not model brand.
 *
 * Usage:
 *   bun run scripts/youmi-bench/run.ts
 *   bun run scripts/youmi-bench/run.ts --engines youmi+claude
 *   bun run scripts/youmi-bench/run.ts --suite long
 *   bun run scripts/youmi-bench/run.ts --tasks investigate-fix+shell-debug
 */
import { existsSync } from "node:fs"
import { join } from "node:path"
import { query } from "@anthropic-ai/claude-agent-sdk"
import {
  buildCcbEnv,
  ccbSdkModel,
  resolveCcbExecutable,
  resolveDeepSeekApiKey,
  withVendoredRgOnPath,
} from "../../src/server/deepseek-agent"
import { isPlausibleApiKey } from "../../src/shared/api-key"
import { startYoumiSession } from "../../src/server/youmi-agent"
import {
  cleanupWorkspace,
  createTaskWorkspace,
  scoreWithCollateralGuard,
  summarizeCapabilities,
  summarizeResults,
  writeBenchReport,
  YOUMI_BENCH_TASKS,
  YOUMI_CORE_TASKS,
  YOUMI_LONG_TASKS,
  type BenchEngine,
  type BenchReport,
  type BenchSuite,
  type BenchTask,
  type BenchTaskResult,
} from "./tasks"

const BENCH_MODEL = process.env.AIANG_BENCH_MODEL?.trim() || "deepseek-v4-flash"
const BENCH_EFFORT = process.env.AIANG_BENCH_EFFORT?.trim() || "max"

const CCB_BENCH_TOOLS = [
  "Bash",
  "Glob",
  "Grep",
  "Read",
  "Edit",
  "Write",
  "TodoWrite",
  "Task",
] as const

function readArg(argv: string[], name: string): string | undefined {
  const eq = argv.find((arg) => arg.startsWith(`${name}=`))
  if (eq) return eq.slice(name.length + 1)
  const idx = argv.indexOf(name)
  if (idx >= 0 && argv[idx + 1] && !argv[idx + 1]!.startsWith("-")) return argv[idx + 1]
  return undefined
}

function parseArgs(argv: string[]) {
  const enginesArg = readArg(argv, "--engines")
  const tasksArg = readArg(argv, "--tasks")
  const suiteArg = (readArg(argv, "--suite") ?? "core").trim() as BenchSuite | "all"
  const dryRun = argv.includes("--dry-run")
  const keep = argv.includes("--keep")
  const engines = (enginesArg ?? "youmi,claude")
    .split(/[,+\s]+/)
    .map((value) => value.trim())
    .filter(Boolean) as BenchEngine[]
  const taskIds = tasksArg
    ? new Set(tasksArg.split(/[,+\s]+/).map((value) => value.trim()).filter(Boolean))
    : null
  return { engines, taskIds, suite: suiteArg, dryRun, keep }
}

function selectTasks(suite: BenchSuite | "all", taskIds: Set<string> | null): BenchTask[] {
  const pool =
    suite === "long" ? YOUMI_LONG_TASKS
    : suite === "all" ? YOUMI_BENCH_TASKS
    : YOUMI_CORE_TASKS
  return pool.filter((task) => !taskIds || taskIds.has(task.id))
}

function benchPrompt(task: BenchTask): string {
  return [
    "You are a coding agent. Solve this agent-capability benchmark with tools.",
    "Investigate, edit, and verify with shell commands until acceptance criteria pass.",
    "Do not ask questions.",
    "",
    task.prompt,
  ].join("\n")
}

async function drainYoumiTurn(session: Awaited<ReturnType<typeof startYoumiSession>>, prompt: string) {
  const drain = (async () => {
    for await (const event of session.stream) {
      if (event.entry?.kind === "result") return event.entry
    }
    return null
  })()
  await session.sendPrompt(prompt)
  return await drain
}

async function runYoumiTask(task: BenchTask, workspace: string): Promise<BenchTaskResult> {
  const started = Date.now()
  const apiKey = resolveDeepSeekApiKey()
  if (!apiKey || !isPlausibleApiKey(apiKey)) {
    return {
      taskId: task.id,
      engine: "youmi",
      passed: false,
      reason: null,
      durationMs: Date.now() - started,
      skipped: true,
      error: "missing or invalid DEEPSEEK_API_KEY",
    }
  }

  const session = await startYoumiSession({
    cwd: workspace,
    model: BENCH_MODEL,
    effort: BENCH_EFFORT,
    apiKey,
  })
  try {
    const result = await drainYoumiTurn(session, benchPrompt(task))
    if (result?.isError) {
      return {
        taskId: task.id,
        engine: "youmi",
        passed: false,
        reason: result.result || "youmi turn failed",
        durationMs: Date.now() - started,
        error: result.result,
        capabilities: task.capabilities,
      }
    }
    const reason = scoreWithCollateralGuard(task, workspace)
    return {
      taskId: task.id,
      engine: "youmi",
      passed: reason === null,
      reason,
      durationMs: Date.now() - started,
      capabilities: task.capabilities,
    }
  } finally {
    session.close()
  }
}

/**
 * Claude Code agent baseline on DeepSeek (vendored ccb + same API key).
 * Compares harness/tool-loop capability — not Anthropic model quality.
 */
async function runClaudeTask(task: BenchTask, workspace: string): Promise<BenchTaskResult> {
  const started = Date.now()
  const apiKey = resolveDeepSeekApiKey()
  if (!apiKey || !isPlausibleApiKey(apiKey)) {
    return {
      taskId: task.id,
      engine: "claude",
      passed: false,
      reason: null,
      durationMs: Date.now() - started,
      skipped: true,
      error: "missing or invalid DEEPSEEK_API_KEY",
      capabilities: task.capabilities,
    }
  }

  let ccbPath: string
  try {
    ccbPath = resolveCcbExecutable()
  } catch (error) {
    return {
      taskId: task.id,
      engine: "claude",
      passed: false,
      reason: null,
      durationMs: Date.now() - started,
      skipped: true,
      error: error instanceof Error ? error.message : String(error),
      capabilities: task.capabilities,
    }
  }

  const { CLAUDECODE: _, ...baseEnv } = process.env
  try {
    const q = query({
      prompt: benchPrompt(task),
      options: {
        cwd: workspace,
        model: ccbSdkModel(BENCH_MODEL),
        effort: BENCH_EFFORT as "low" | "medium" | "high" | "max",
        permissionMode: "acceptEdits",
        tools: [...CCB_BENCH_TOOLS],
        pathToClaudeCodeExecutable: ccbPath,
        env: withVendoredRgOnPath({
          ...baseEnv,
          ...buildCcbEnv(apiKey, BENCH_MODEL, BENCH_EFFORT),
        }),
        canUseTool: async (_toolName, input) => ({
          behavior: "allow",
          updatedInput: input,
        }),
        systemPrompt: {
          type: "preset",
          preset: "claude_code",
          append: "You are benchmarking agent capability on DeepSeek. Finish the task with tools; do not ask the user questions.",
        },
      },
    })

    let lastError: string | null = null
    for await (const message of q) {
      const record = message as {
        type?: string
        subtype?: string
        is_error?: boolean
        result?: string
        errors?: string[]
      }
      if (record.type === "result") {
        if (record.is_error || record.subtype === "error") {
          lastError = record.result
            || (Array.isArray(record.errors) ? record.errors.join("; ") : null)
            || "ccb turn failed"
        }
      }
    }

    if (lastError) {
      return {
        taskId: task.id,
        engine: "claude",
        passed: false,
        reason: lastError,
        durationMs: Date.now() - started,
        error: lastError,
        capabilities: task.capabilities,
      }
    }

    const reason = scoreWithCollateralGuard(task, workspace)
    return {
      taskId: task.id,
      engine: "claude",
      passed: reason === null,
      reason,
      durationMs: Date.now() - started,
      capabilities: task.capabilities,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      taskId: task.id,
      engine: "claude",
      passed: false,
      reason: null,
      durationMs: Date.now() - started,
      skipped: /找不到|ENOENT|executable|DEEPSEEK/i.test(message),
      error: message.slice(0, 2000),
      capabilities: task.capabilities,
    }
  }
}

function skipEngine(engine: BenchEngine, reason: string, taskId: string, started: number): BenchTaskResult {
  return {
    taskId,
    engine,
    passed: false,
    reason: null,
    durationMs: Date.now() - started,
    skipped: true,
    error: reason,
  }
}

async function runComparisonStub(engine: Exclude<BenchEngine, "youmi" | "claude">, task: BenchTask): Promise<BenchTaskResult> {
  const started = Date.now()
  if (engine === "deepseek") {
    return skipEngine(engine, "use engine id `claude` for ccb+DeepSeek baseline", task.id, started)
  }
  if (engine === "reasonix") {
    const binary = process.platform === "win32" ? "reasonix.exe" : "reasonix"
    if (!existsSync(join(process.cwd(), "vendor", "reasonix", binary))) {
      return skipEngine(engine, "vendor/reasonix binary missing", task.id, started)
    }
    return skipEngine(engine, "reasonix live bench not enabled in CLI runner yet", task.id, started)
  }
  if (engine === "codex") {
    return skipEngine(engine, "codex live bench not enabled in CLI runner yet", task.id, started)
  }
  return skipEngine(engine, "unsupported", task.id, started)
}

function printParity(report: BenchReport) {
  const youmi = report.summary.youmi
  const claude = report.summary.claude
  if (!youmi || !claude) return
  const youmiScored = youmi.total - youmi.skipped
  const claudeScored = claude.total - claude.skipped
  if (youmiScored <= 0 || claudeScored <= 0) {
    console.log("parity: incomplete (need scored runs on both Youmi and ccb/DeepSeek)")
    return
  }
  const youmiRate = youmi.passed / youmiScored
  const claudeRate = claude.passed / claudeScored
  const gap = youmiRate - claudeRate
  const status = gap + 1e-9 >= 0 ? "PARITY_OK" : "BELOW_CLAUDE_AGENT"
  console.log(
    `parity (both DeepSeek): youmi=${youmiRate.toFixed(2)} claude-agent/ccb=${claudeRate.toFixed(2)} gap=${gap >= 0 ? "+" : ""}${gap.toFixed(2)} → ${status}`,
  )
}

async function main() {
  const { engines, taskIds, suite, dryRun, keep } = parseArgs(process.argv.slice(2))
  const tasks = selectTasks(suite, taskIds)
  if (tasks.length === 0) {
    console.error("No tasks selected")
    process.exit(1)
  }

  console.log(`suite=${suite} tasks=${tasks.map((t) => t.id).join("+")}`)
  console.log(`model=${BENCH_MODEL} effort=${BENCH_EFFORT} (both engines use DeepSeek)`)
  console.log("baseline `claude` = Claude Code agent harness (ccb) + DeepSeek")

  const startedAt = new Date().toISOString()
  const results: BenchTaskResult[] = []

  for (const engine of engines) {
    for (const task of tasks) {
      console.log(`→ ${engine} / ${task.id}`)
      if (dryRun) {
        const workspace = createTaskWorkspace(task)
        try {
          const reason = scoreWithCollateralGuard(task, workspace)
          results.push({
            taskId: task.id,
            engine,
            passed: false,
            reason: reason ?? "dry-run (no agent invocation)",
            durationMs: 0,
            skipped: true,
            error: "dry-run",
            capabilities: task.capabilities,
          })
        } finally {
          if (!keep) cleanupWorkspace(workspace)
        }
        continue
      }

      const workspace = createTaskWorkspace(task)
      try {
        if (engine === "youmi") {
          results.push(await runYoumiTask(task, workspace))
        } else if (engine === "claude") {
          results.push(await runClaudeTask(task, workspace))
        } else {
          results.push(await runComparisonStub(engine, task))
        }
      } catch (error) {
        results.push({
          taskId: task.id,
          engine,
          passed: false,
          reason: null,
          durationMs: 0,
          error: error instanceof Error ? error.message : String(error),
          capabilities: task.capabilities,
        })
      } finally {
        if (!keep) cleanupWorkspace(workspace)
      }
    }
  }

  const finishedAt = new Date().toISOString()
  const report: BenchReport = {
    startedAt,
    finishedAt,
    engines,
    gate: "claude-agent-parity",
    results,
    summary: summarizeResults(engines, results),
    capabilitySummary: summarizeCapabilities(engines, results, tasks),
  }

  const outDir = join(process.cwd(), "eval", "results")
  const path = writeBenchReport(report, outDir)
  console.log(`Wrote ${path}`)
  console.log("gate: claude-agent-parity (DeepSeek model both sides)")
  for (const engine of engines) {
    const row = report.summary[engine]
    if (!row) continue
    const label = engine === "claude" ? "claude-agent/ccb+DeepSeek" : engine
    console.log(
      `${label}: passed=${row.passed} failed=${row.failed} skipped=${row.skipped} total=${row.total}`,
    )
    const caps = report.capabilitySummary?.[engine]
    if (caps) {
      const parts = Object.entries(caps).map(([cap, stat]) => `${cap}:${stat!.passed}/${stat!.total}`)
      if (parts.length) console.log(`  caps ${parts.join(" ")}`)
    }
  }
  printParity(report)

  const youmi = report.summary.youmi
  const claude = report.summary.claude
  if (!dryRun && youmi && claude) {
    const youmiScored = youmi.total - youmi.skipped
    const claudeScored = claude.total - claude.skipped
    if (youmiScored > 0 && claudeScored > 0) {
      const youmiRate = youmi.passed / youmiScored
      const claudeRate = claude.passed / claudeScored
      if (youmiRate + 1e-9 < claudeRate) process.exitCode = 2
    }
  } else if (youmi && youmi.failed > 0 && !dryRun) {
    process.exitCode = 1
  }
}

void main()
