#!/usr/bin/env bun
/**
 * Youmi self-evolve loop — Claude **agent capability** parity first:
 *   investigate / edit / multi-file / shell verify / test-fix loops
 * must reach Claude Code pass-rate on the capability bench before any
 * "smarter than Claude" claim.
 */
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import {
  agentsMdPath,
  installSkill,
  listInstalledSkills,
  resolveRoot,
  skillsDir,
} from "@prismshadow/penguin-core"
import { librarySkill } from "@prismshadow/penguin-skills"
import {
  resolveYoumiDataRoot,
  resolveYoumiHome,
  YOUMI_AGENT_ID,
  YOUMI_AGENTS_MD,
  YOUMI_PROJECT_ID,
} from "../src/server/youmi-agent"
import { summarizeResults, type BenchEngine, type BenchReport } from "./youmi-bench/tasks"

function readArg(argv: string[], name: string): string | undefined {
  const eq = argv.find((arg) => arg.startsWith(`${name}=`))
  if (eq) return eq.slice(name.length + 1)
  const idx = argv.indexOf(name)
  if (idx >= 0 && argv[idx + 1] && !argv[idx + 1]!.startsWith("-")) return argv[idx + 1]
  return undefined
}

function parseArgs(argv: string[]) {
  const rounds = Number(readArg(argv, "--rounds") ?? "2")
  const tasksArg = readArg(argv, "--tasks") ?? null
  const dryRun = argv.includes("--dry-run")
  return {
    rounds: Number.isFinite(rounds) && rounds > 0 ? Math.min(rounds, 5) : 2,
    tasksArg,
    dryRun,
  }
}

function passRate(report: BenchReport, engine: BenchEngine): number {
  const row = report.summary[engine]
  if (!row || row.total === 0) return 0
  const scored = row.total - row.skipped
  if (scored <= 0) return 0
  return row.passed / scored
}

/** Tasks Claude passed but Youmi failed — the parity gap to close first. */
function claudeGapTaskIds(report: BenchReport): string[] {
  const claudePass = new Set(
    report.results
      .filter((row) => row.engine === "claude" && row.passed && !row.skipped)
      .map((row) => row.taskId),
  )
  return report.results
    .filter((row) => row.engine === "youmi" && !row.passed && !row.skipped && claudePass.has(row.taskId))
    .map((row) => row.taskId)
}

function youmiFailedIds(report: BenchReport): string[] {
  return report.results
    .filter((row) => row.engine === "youmi" && !row.passed && !row.skipped)
    .map((row) => row.taskId)
}

async function runBench(dryRun: boolean, tasksArg: string | null): Promise<BenchReport> {
  const args = [
    "run",
    "scripts/youmi-bench/run.ts",
    "--engines",
    "youmi+claude",
    ...(tasksArg ? ["--tasks", tasksArg] : []),
    ...(dryRun ? ["--dry-run"] : []),
  ]
  const proc = Bun.spawn(["bun", ...args], {
    cwd: process.cwd(),
    stdout: "pipe",
    stderr: "pipe",
  })
  const stdout = await new Response(proc.stdout).text()
  const stderr = await new Response(proc.stderr).text()
  const code = await proc.exited
  if (code !== 0 && !dryRun) {
    console.error(stdout)
    console.error(stderr)
  }
  const match = stdout.match(/Wrote (.+\.json)/)
  if (!match?.[1]) {
    throw new Error(`bench did not write a report\n${stdout}\n${stderr}`)
  }
  return JSON.parse(readFileSync(match[1], "utf8")) as BenchReport
}

function snapshotDir(version: number): string {
  return join(resolveYoumiHome(), "snapshots", `n${version}-${Date.now()}`)
}

function agentStatePaths(root: string) {
  return {
    agentsMd: agentsMdPath(root, YOUMI_PROJECT_ID, YOUMI_AGENT_ID),
    skills: skillsDir(root, YOUMI_PROJECT_ID, YOUMI_AGENT_ID),
  }
}

function takeSnapshot(label: string): string {
  process.env.PENGUIN_HOME = resolveYoumiHome()
  const root = resolveYoumiDataRoot()
  const out = snapshotDir(Number(label.replace(/\D/g, "") || "0") || 0)
  mkdirSync(out, { recursive: true })
  const paths = agentStatePaths(root)
  if (existsSync(paths.agentsMd)) {
    cpSync(paths.agentsMd, join(out, "AGENTS.md"))
  }
  if (existsSync(paths.skills)) {
    cpSync(paths.skills, join(out, "skills"), { recursive: true })
  }
  writeFileSync(join(out, "meta.json"), `${JSON.stringify({ label, at: new Date().toISOString(), root }, null, 2)}\n`)
  return out
}

function restoreSnapshot(snapshot: string) {
  process.env.PENGUIN_HOME = resolveYoumiHome()
  const root = resolveYoumiDataRoot()
  const paths = agentStatePaths(root)
  mkdirSync(join(paths.agentsMd, ".."), { recursive: true })
  const agentsSnap = join(snapshot, "AGENTS.md")
  if (existsSync(agentsSnap)) {
    cpSync(agentsSnap, paths.agentsMd)
  }
  const skillsSnap = join(snapshot, "skills")
  if (existsSync(skillsSnap)) {
    if (existsSync(paths.skills)) rmSync(paths.skills, { recursive: true, force: true })
    cpSync(skillsSnap, paths.skills, { recursive: true })
  }
}

async function optimizeAgent(failedTaskIds: string[], gapTaskIds: string[]) {
  process.env.PENGUIN_HOME = resolveYoumiHome()
  const root = resolveYoumiDataRoot()
  const skill = librarySkill("software-engineering")
  if (skill) {
    await installSkill(root, YOUMI_PROJECT_ID, YOUMI_AGENT_ID, {
      name: skill.name,
      content: skill.content,
      icon: skill.icon,
      files: skill.files,
    })
  }
  const installed = await listInstalledSkills(root, YOUMI_PROJECT_ID, YOUMI_AGENT_ID)
  const paths = agentStatePaths(root)
  mkdirSync(join(paths.agentsMd, ".."), { recursive: true })
  const guidance = [
    YOUMI_AGENTS_MD.trim(),
    "",
    "## Priority: close the Claude agent-capability gap first",
    "These tasks Claude already passed — match that agent bar:",
    ...(gapTaskIds.length > 0 ? gapTaskIds.map((id) => `- ${id}`) : ["- (no Claude-only wins this round)"]),
    "",
    "## All Youmi failures",
    ...failedTaskIds.map((id) => `- ${id}`),
    "",
    `Installed skills: ${installed.map((entry) => entry.name).join(", ") || "(none)"}`,
    "",
  ].join("\n")
  writeFileSync(paths.agentsMd, guidance, "utf8")
}

async function main() {
  const { rounds, tasksArg, dryRun } = parseArgs(process.argv.slice(2))
  process.env.PENGUIN_HOME = resolveYoumiHome()
  void resolveRoot()

  console.log(`Youmi evolve (Claude agent-capability parity): rounds=${rounds} dryRun=${dryRun}`)
  let best = await runBench(dryRun, tasksArg)
  let bestRate = passRate(best, "youmi")
  let claudeRate = passRate(best, "claude")
  console.log(`baseline youmi=${bestRate.toFixed(2)} claude=${claudeRate.toFixed(2)}`)

  if (!dryRun && bestRate + 1e-9 >= claudeRate && claudeRate > 0) {
    console.log("already at Claude parity — stop")
    writeFileSync(
      join(resolveYoumiHome(), "evolve-latest.json"),
      `${JSON.stringify({ parity: true, bestRate, claudeRate, report: best }, null, 2)}\n`,
    )
    return
  }

  for (let round = 1; round <= rounds; round += 1) {
    const snap = takeSnapshot(`n${round}`)
    console.log(`snapshot ${snap}`)
    const gap = claudeGapTaskIds(best)
    const failed = youmiFailedIds(best)
    if (failed.length === 0 && !dryRun) {
      console.log("no failed youmi tasks — stop")
      break
    }
    await optimizeAgent(failed.length > 0 ? failed : ["write-hello"], gap)
    const next = await runBench(dryRun, tasksArg)
    const nextRate = passRate(next, "youmi")
    const nextClaude = passRate(next, "claude")
    console.log(`round ${round} youmi=${nextRate.toFixed(2)} claude=${nextClaude.toFixed(2)}`)
    if (nextRate + 1e-9 < bestRate && !dryRun) {
      console.log("youmi pass-rate dropped — rollback")
      restoreSnapshot(snap)
      continue
    }
    best = next
    bestRate = nextRate
    claudeRate = nextClaude
    const parity = bestRate + 1e-9 >= claudeRate && claudeRate > 0
    writeFileSync(
      join(resolveYoumiHome(), "evolve-latest.json"),
      `${JSON.stringify({ round, bestRate, claudeRate, parity, gap, report: best, snapshot: snap }, null, 2)}\n`,
    )
    if (parity && !dryRun) {
      console.log("Claude parity reached — stop")
      break
    }
  }

  const parity = bestRate + 1e-9 >= claudeRate && claudeRate > 0
  console.log(
    `done parity=${parity} youmi=${bestRate.toFixed(2)} claude=${claudeRate.toFixed(2)} summary=${JSON.stringify({
      youmi: summarizeResults(["youmi"], best.results).youmi,
      claude: summarizeResults(["claude"], best.results).claude,
    })}`,
  )
  if (!parity && !dryRun) process.exitCode = 2
}

void main()
