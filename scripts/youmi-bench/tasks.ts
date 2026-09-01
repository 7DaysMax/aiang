import { mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync, existsSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { spawnSync } from "node:child_process"

export type BenchEngine = "youmi" | "claude" | "deepseek" | "reasonix" | "codex"

/** Agent capability facets we score against Claude Code. */
export type AgentCapability =
  | "investigate"
  | "edit"
  | "multi_file"
  | "shell_verify"
  | "refactor"
  | "test_loop"

export type BenchSuite = "core" | "long"

export interface BenchTask {
  id: string
  title: string
  /** core = short capability smoke; long = multi-hop / multi-file agent stress. */
  suite?: BenchSuite
  /** Which agent capabilities this task exercises. */
  capabilities: AgentCapability[]
  /** Prompt sent to the agent. */
  prompt: string
  /** Seed files created before the run (relative to workspace). */
  seed?: Record<string, string>
  /** Extra relative paths the agent is allowed to create besides seed files. */
  allowCreated?: string[]
  /**
   * When false, skip the extra-file check (creating new files is a valid fix).
   * Default true.
   */
  forbidExtraFiles?: boolean
  /** Return null when passed, otherwise a failure reason. */
  score: (workspace: string) => string | null
}

const WORKSPACE_IGNORE = new Set([".git", "node_modules", ".DS_Store"])

export function listWorkspaceFiles(workspace: string): string[] {
  const out: string[] = []
  const walk = (dir: string, prefix: string) => {
    let entries: string[]
    try {
      entries = readdirSync(dir)
    } catch {
      return
    }
    for (const name of entries) {
      if (WORKSPACE_IGNORE.has(name) || name.startsWith(".")) continue
      const rel = prefix ? `${prefix}/${name}` : name
      const full = join(dir, name)
      try {
        if (statSync(full).isDirectory()) walk(full, rel)
        else out.push(rel.replaceAll("\\", "/"))
      } catch {
        // ignore disappearing files
      }
    }
  }
  walk(workspace, "")
  return out.sort()
}

export function unexpectedWorkspaceFiles(workspace: string, allowed: Iterable<string>): string[] {
  const allow = new Set([...allowed].map((path) => path.replaceAll("\\", "/")))
  return listWorkspaceFiles(workspace).filter((file) => !allow.has(file))
}

export function scoreWithCollateralGuard(task: BenchTask, workspace: string): string | null {
  const fail = task.score(workspace)
  if (fail) return fail
  if (task.forbidExtraFiles === false) return null
  const extra = unexpectedWorkspaceFiles(workspace, [
    ...Object.keys(task.seed ?? {}),
    ...(task.allowCreated ?? []),
  ])
  if (extra.length > 0) return `collateral files: ${extra.slice(0, 8).join(", ")}`
  return null
}

function runNode(workspace: string, script: string): { ok: boolean; output: string } {
  const result = spawnSync(process.execPath, [script], {
    cwd: workspace,
    encoding: "utf8",
    timeout: 30_000,
    windowsHide: true,
  })
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}${result.error ? String(result.error.message) : ""}`.trim()
  if (result.error && /ETIMEDOUT|ENOENT/i.test(result.error.message)) {
    // Fallback when process.execPath is bun and a cold start times out on Windows.
    const fallback = spawnSync("node", [script], {
      cwd: workspace,
      encoding: "utf8",
      timeout: 30_000,
      windowsHide: true,
    })
    const fallbackOut = `${fallback.stdout ?? ""}${fallback.stderr ?? ""}${fallback.error ? String(fallback.error.message) : ""}`.trim()
    return { ok: fallback.status === 0, output: fallbackOut || output }
  }
  return { ok: result.status === 0, output }
}

/**
 * Agent-capability bench — not toy “write a file” checks.
 * Each task requires tool use / multi-step coding-agent behavior comparable to Claude Code.
 */
export const YOUMI_BENCH_TASKS: BenchTask[] = [
  {
    id: "investigate-fix",
    title: "Investigate and fix buried bug",
    capabilities: ["investigate", "edit", "shell_verify"],
    prompt: [
      "A unit test is failing. Find the bug and fix it.",
      "Do not rewrite unrelated files. Run the test with: node test/math.test.mjs",
      "Stop only when that command exits 0.",
    ].join("\n"),
    seed: {
      "src/utils/math.js": "export function add(a, b) {\n  return a - b\n}\n\nexport function mul(a, b) {\n  return a * b\n}\n",
      "src/index.js": "export { add, mul } from './utils/math.js'\n",
      "test/math.test.mjs": "import { add, mul } from '../src/index.js'\nif (add(2, 3) !== 5) { console.error('add failed'); process.exit(1) }\nif (mul(3, 4) !== 12) { console.error('mul failed'); process.exit(1) }\nconsole.log('ok')\n",
    },
    score: (workspace) => {
      const math = readFileSync(join(workspace, "src/utils/math.js"), "utf8")
      if (!/return\s+a\s*\+\s*b/.test(math)) return "add() not fixed"
      if (!/return\s+a\s*\*\s*b/.test(math)) return "mul() regressed"
      const run = runNode(workspace, "test/math.test.mjs")
      return run.ok ? null : `test still failing: ${run.output}`
    },
  },
  {
    id: "failing-test-loop",
    title: "Failing test → fix → verify",
    capabilities: ["test_loop", "edit", "shell_verify"],
    prompt: [
      "package.json defines test as `node test.mjs`.",
      "Make the test pass. You must run the test yourself and iterate until it passes.",
    ].join("\n"),
    seed: {
      "package.json": "{\n  \"name\": \"cap-bench\",\n  \"type\": \"module\",\n  \"scripts\": { \"test\": \"node test.mjs\" }\n}\n",
      "greeter.js": "export function greet(name) {\n  return `hi ${name}`\n}\n",
      "test.mjs": "import { greet } from './greeter.js'\nconst got = greet('Ada')\nif (got !== 'Hello, Ada!') {\n  console.error('expected Hello, Ada! got', got)\n  process.exit(1)\n}\nconsole.log('pass')\n",
    },
    score: (workspace) => {
      const greeter = readFileSync(join(workspace, "greeter.js"), "utf8")
      if (!/Hello,\s*\$\{name\}!/.test(greeter) && !/Hello, Ada!/.test(greeter)) {
        // Accept any implementation that makes the test pass.
      }
      const run = runNode(workspace, "test.mjs")
      return run.ok ? null : `test still failing: ${run.output}`
    },
  },
  {
    id: "multi-hop-refactor",
    title: "Rename across three files",
    capabilities: ["refactor", "multi_file", "investigate"],
    prompt: [
      "Rename exported function `legacyCompute` to `computeTotal` everywhere it is defined or used.",
      "Keep behavior identical. Touch every file that references the old name.",
    ].join("\n"),
    seed: {
      "lib/compute.js": "export function legacyCompute(items) {\n  return items.reduce((sum, n) => sum + n, 0)\n}\n",
      "services/billing.js": "import { legacyCompute } from '../lib/compute.js'\nexport function invoice(items) {\n  return { total: legacyCompute(items) }\n}\n",
      "app.js": "import { invoice } from './services/billing.js'\nconsole.log(invoice([1,2,3]).total)\n",
    },
    score: (workspace) => {
      for (const rel of ["lib/compute.js", "services/billing.js", "app.js"]) {
        const text = readFileSync(join(workspace, rel), "utf8")
        if (/legacyCompute/.test(text)) return `${rel} still has legacyCompute`
      }
      const compute = readFileSync(join(workspace, "lib/compute.js"), "utf8")
      if (!/function\s+computeTotal\b/.test(compute)) return "computeTotal missing"
      return null
    },
  },
  {
    id: "implement-from-spec",
    title: "Implement from SPEC then verify",
    capabilities: ["investigate", "multi_file", "shell_verify"],
    prompt: [
      "Read SPEC.md and implement it.",
      "Verify with: node verify.mjs",
      "Do not change verify.mjs.",
    ].join("\n"),
    allowCreated: ["src/clamp.js"],
    seed: {
      "SPEC.md": "# Spec\n\nCreate `src/clamp.js` exporting `clamp(value, min, max)` that:\n- returns min when value < min\n- returns max when value > max\n- otherwise returns value\n",
      "verify.mjs": "import { clamp } from './src/clamp.js'\nconst cases = [[5,0,10,5],[-1,0,10,0],[99,0,10,10]]\nfor (const [v,min,max,expected] of cases) {\n  const got = clamp(v,min,max)\n  if (got !== expected) { console.error({v,min,max,expected,got}); process.exit(1) }\n}\nconsole.log('ok')\n",
    },
    score: (workspace) => {
      if (!existsSync(join(workspace, "src/clamp.js"))) return "src/clamp.js missing"
      const verify = readFileSync(join(workspace, "verify.mjs"), "utf8")
      if (!verify.includes("import { clamp }")) return "verify.mjs was altered"
      const run = runNode(workspace, "verify.mjs")
      return run.ok ? null : `verify failed: ${run.output}`
    },
  },
  {
    id: "shell-debug",
    title: "Debug broken script until exit 0",
    capabilities: ["shell_verify", "edit", "investigate"],
    prompt: [
      "scripts/build.mjs currently exits non-zero.",
      "Fix it so `node scripts/build.mjs` prints DONE and exits 0.",
      "You must run the script yourself.",
    ].join("\n"),
    allowCreated: ["dist/out.txt"],
    seed: {
      "scripts/build.mjs": "import { writeFileSync } from 'node:fs'\nconst out = 'dist/out.txt'\nwriteFileSync(out, 'artifact')\nconsole.log('DONE')\n",
    },
    score: (workspace) => {
      const run = runNode(workspace, "scripts/build.mjs")
      if (!run.ok) return `script still failing: ${run.output}`
      if (!existsSync(join(workspace, "dist/out.txt"))) return "dist/out.txt missing (did not create directory?)"
      return null
    },
  },
  {
    id: "surgical-edit",
    title: "Surgical fix without collateral damage",
    capabilities: ["edit", "shell_verify"],
    prompt: [
      "Only fix `formatDate`. Do not change `formatMoney` behavior.",
      "Verify with node check.mjs",
    ].join("\n"),
    seed: {
      "format.js": "export function formatDate(iso) {\n  return iso.slice(0, 4)\n}\n\nexport function formatMoney(cents) {\n  return `$${(cents / 100).toFixed(2)}`\n}\n",
      "check.mjs": "import { formatDate, formatMoney } from './format.js'\nif (formatDate('2026-08-12') !== '2026-08-12') { console.error('date'); process.exit(1) }\nif (formatMoney(199) !== '$1.99') { console.error('money'); process.exit(1) }\nconsole.log('ok')\n",
    },
    score: (workspace) => {
      const format = readFileSync(join(workspace, "format.js"), "utf8")
      if (!/formatMoney/.test(format)) return "formatMoney removed"
      const run = runNode(workspace, "check.mjs")
      return run.ok ? null : `check failed: ${run.output}`
    },
  },
  {
    id: "import-path-trace",
    title: "Trace broken import and repair",
    capabilities: ["investigate", "multi_file", "shell_verify"],
    prompt: [
      "node run.mjs fails due to a bad import path somewhere in the module graph.",
      "Find and fix it. Keep public API the same. run.mjs must print READY.",
    ].join("\n"),
    seed: {
      "run.mjs": "import { ready } from './src/boot.js'\nconsole.log(ready())\n",
      "src/boot.js": "import { status } from './core/status.js'\nexport function ready() { return status() }\n",
      "src/core/state.js": "export function status() { return 'READY' }\n",
    },
    score: (workspace) => {
      const run = runNode(workspace, "run.mjs")
      if (!run.ok) return `run.mjs failed: ${run.output}`
      if (!/READY/.test(run.output)) return `expected READY, got ${JSON.stringify(run.output)}`
      return null
    },
  },
  {
    id: "regression-guard",
    title: "Fix bug while keeping suite green",
    capabilities: ["test_loop", "edit", "shell_verify"],
    prompt: [
      "There are two tests: test/alpha.mjs and test/beta.mjs.",
      "alpha currently fails. Fix the library so BOTH pass.",
      "Run: node test/alpha.mjs && node test/beta.mjs",
    ].join("\n"),
    seed: {
      "lib/text.js": "export function titleCase(s) {\n  return s.toUpperCase()\n}\n\nexport function reverse(s) {\n  return s.split('').reverse().join('')\n}\n",
      "test/alpha.mjs": "import { titleCase } from '../lib/text.js'\nif (titleCase('ada lovelace') !== 'Ada Lovelace') { console.error('alpha fail'); process.exit(1) }\nconsole.log('alpha ok')\n",
      "test/beta.mjs": "import { reverse } from '../lib/text.js'\nif (reverse('youmi') !== 'imuoy') { console.error('beta fail'); process.exit(1) }\nconsole.log('beta ok')\n",
    },
    score: (workspace) => {
      const alpha = runNode(workspace, "test/alpha.mjs")
      if (!alpha.ok) return `alpha failed: ${alpha.output}`
      const beta = runNode(workspace, "test/beta.mjs")
      if (!beta.ok) return `beta failed: ${beta.output}`
      return null
    },
  },

  // ── Long / multi-hop agent stress (same DeepSeek model; harness comparison) ──
  {
    id: "long-cascade-fix",
    title: "Fix cascading bugs across 5 modules",
    suite: "long",
    capabilities: ["investigate", "multi_file", "edit", "shell_verify", "test_loop"],
    prompt: [
      "This mini app has multiple interacting bugs across config → parser → validator → service → cli.",
      "Goal: `node test/integration.mjs` exits 0 and prints ALL_GREEN.",
      "Do not weaken or delete tests. Fix the real bugs.",
      "Investigate with tools; iterate until the integration test passes.",
    ].join("\n"),
    seed: {
      "config/defaults.json": "{\n  \"taxRate\": 0.1,\n  \"currency\": \"USD\",\n  \"roundMode\": \"floor\"\n}\n",
      "src/config.js": "import { readFileSync } from 'node:fs'\nimport { join, dirname } from 'node:path'\nimport { fileURLToPath } from 'node:url'\nconst root = join(dirname(fileURLToPath(import.meta.url)), '..')\nexport function loadConfig() {\n  const raw = JSON.parse(readFileSync(join(root, 'config/defaults.json'), 'utf8'))\n  // BUG: taxRate silently coerced wrong\n  return { ...raw, taxRate: Number(raw.taxRate) * 0 }\n}\n",
      "src/parser.js": "export function parseLine(line) {\n  const [sku, qty, price] = line.trim().split(',')\n  // BUG: qty off-by-one\n  return { sku, qty: Number(qty) + 1, price: Number(price) }\n}\n",
      "src/validator.js": "export function validateItem(item) {\n  if (!item.sku) return { ok: false, error: 'sku' }\n  if (!(item.qty > 0)) return { ok: false, error: 'qty' }\n  if (!(item.price >= 0)) return { ok: false, error: 'price' }\n  // BUG: rejects valid USD items\n  if (item.sku.includes('-')) return { ok: false, error: 'sku-format' }\n  return { ok: true }\n}\n",
      "src/service.js": "import { loadConfig } from './config.js'\nimport { parseLine } from './parser.js'\nimport { validateItem } from './validator.js'\nexport function quote(lines) {\n  const cfg = loadConfig()\n  let subtotal = 0\n  for (const line of lines) {\n    const item = parseLine(line)\n    const v = validateItem(item)\n    if (!v.ok) throw new Error(`invalid:${v.error}:${line}`)\n    subtotal += item.qty * item.price\n  }\n  const tax = subtotal * cfg.taxRate\n  const total = cfg.roundMode === 'floor' ? Math.floor(subtotal + tax) : Math.round(subtotal + tax)\n  return { subtotal, tax, total, currency: cfg.currency }\n}\n",
      "cli.mjs": "import { quote } from './src/service.js'\nconst lines = process.argv.slice(2)\nconst out = quote(lines)\nconsole.log(JSON.stringify(out))\n",
      "test/integration.mjs": "import { quote } from '../src/service.js'\nconst out = quote(['SKU-1,2,10', 'SKU-2,1,5'])\nif (out.subtotal !== 25) { console.error('subtotal', out); process.exit(1) }\nif (Math.abs(out.tax - 2.5) > 1e-9) { console.error('tax', out); process.exit(1) }\nif (out.total !== 27) { console.error('total', out); process.exit(1) }\nif (out.currency !== 'USD') { console.error('currency', out); process.exit(1) }\nconsole.log('ALL_GREEN')\n",
    },
    score: (workspace) => {
      const run = runNode(workspace, "test/integration.mjs")
      if (!run.ok) return `integration failed: ${run.output}`
      if (!/ALL_GREEN/.test(run.output)) return "missing ALL_GREEN"
      const cfg = readFileSync(join(workspace, "src/config.js"), "utf8")
      if (/\*\s*0\b/.test(cfg) && /taxRate/.test(cfg)) {
        // allow if tests pass — behavior is source of truth
      }
      return null
    },
  },
  {
    id: "long-spec-feature",
    title: "Implement multi-module feature from long SPEC",
    suite: "long",
    capabilities: ["investigate", "multi_file", "edit", "shell_verify"],
    prompt: [
      "Read SPEC.md carefully and implement the full feature set.",
      "Create every required module. Do not modify verify.mjs.",
      "Verify with: node verify.mjs — iterate until it prints SPEC_OK.",
    ].join("\n"),
    allowCreated: ["src/account.js", "src/ledger.js", "src/transfer.js", "src/format.js"],
    seed: {
      "SPEC.md": [
        "# Wallet Ledger Spec",
        "",
        "Implement a tiny wallet system:",
        "",
        "1. `src/account.js` — `createAccount(id)` returns `{ id, balance: 0 }`",
        "2. `src/ledger.js` — `apply(account, { type, amount })` where type is `credit` or `debit`",
        "   - credit adds amount; debit subtracts; balance must never go negative (throw `InsufficientFunds`)",
        "   - amount must be a positive number else throw `InvalidAmount`",
        "3. `src/transfer.js` — `transfer(from, to, amount)` debits from and credits to atomically",
        "   - if debit would fail, neither account changes",
        "4. `src/format.js` — `formatBalance(account)` returns string like `ACC:12.50` with 2 decimals",
        "",
        "Export named functions exactly as specified.",
      ].join("\n"),
      "verify.mjs": [
        "import { createAccount } from './src/account.js'",
        "import { apply } from './src/ledger.js'",
        "import { transfer } from './src/transfer.js'",
        "import { formatBalance } from './src/format.js'",
        "",
        "const a = createAccount('A')",
        "const b = createAccount('B')",
        "apply(a, { type: 'credit', amount: 100 })",
        "if (a.balance !== 100) { console.error('credit'); process.exit(1) }",
        "try { apply(a, { type: 'debit', amount: 150 }); console.error('should throw'); process.exit(1) } catch (e) {",
        "  if (e.message !== 'InsufficientFunds' && e.name !== 'InsufficientFunds') { console.error('err', e); process.exit(1) }",
        "}",
        "if (a.balance !== 100) { console.error('mutated on fail'); process.exit(1) }",
        "transfer(a, b, 40)",
        "if (a.balance !== 60 || b.balance !== 40) { console.error('transfer', a, b); process.exit(1) }",
        "try { transfer(a, b, 999); console.error('bad transfer'); process.exit(1) } catch {}",
        "if (a.balance !== 60 || b.balance !== 40) { console.error('atomic fail', a, b); process.exit(1) }",
        "if (formatBalance(a) !== 'A:60.00') { console.error('format', formatBalance(a)); process.exit(1) }",
        "try { apply(a, { type: 'credit', amount: -1 }); console.error('neg'); process.exit(1) } catch (e) {",
        "  if (!String(e.message || e.name).includes('InvalidAmount')) { console.error('invalid', e); process.exit(1) }",
        "}",
        "console.log('SPEC_OK')",
      ].join("\n"),
    },
    score: (workspace) => {
      const verify = readFileSync(join(workspace, "verify.mjs"), "utf8")
      if (!verify.includes("SPEC_OK")) return "verify.mjs altered"
      for (const rel of ["src/account.js", "src/ledger.js", "src/transfer.js", "src/format.js"]) {
        if (!existsSync(join(workspace, rel))) return `${rel} missing`
      }
      const run = runNode(workspace, "verify.mjs")
      if (!run.ok) return `verify failed: ${run.output}`
      if (!/SPEC_OK/.test(run.output)) return "missing SPEC_OK"
      return null
    },
  },
  {
    id: "long-dep-graph",
    title: "Repair broken package graph (4 packages)",
    suite: "long",
    capabilities: ["investigate", "multi_file", "shell_verify", "refactor"],
    prompt: [
      "This workspace is a tiny multi-package tree under packages/.",
      "`node apps/runner.mjs` should print GRAPH_OK.",
      "Imports/exports/paths are wrong in more than one place. Fix the graph without rewriting the runner's expected output string.",
      "Do not change apps/runner.mjs expected final print beyond making it succeed.",
    ].join("\n"),
    forbidExtraFiles: false,
    seed: {
      "packages/core/math.js": "export function sum(xs) { return xs.reduce((a, b) => a + b, 0) }\n",
      "packages/core/index.js": "export { sum as addAll } from './math.js'\n",
      "packages/stats/mean.js": "import { sum } from '../core/math.js'\nexport function mean(xs) {\n  if (!xs.length) return 0\n  return sum(xs) / xs.length\n}\n",
      "packages/stats/index.js": "export { mean } from './avg.js'\n",
      "packages/report/format.js": "export function formatMean(n) {\n  return `mean=${n.toFixed(2)}`\n}\n",
      "packages/report/index.js": "import { mean } from '../stats/index.js'\nimport { formatMean } from './format.js'\nexport function report(xs) {\n  return formatMean(mean(xs))\n}\n",
      "apps/runner.mjs": "import { report } from '../packages/report/index.js'\nconst out = report([2, 4, 6])\nif (out !== 'mean=4.00') { console.error(out); process.exit(1) }\nconsole.log('GRAPH_OK')\n",
    },
    score: (workspace) => {
      const run = runNode(workspace, "apps/runner.mjs")
      if (!run.ok) return `runner failed: ${run.output}`
      if (!/GRAPH_OK/.test(run.output)) return "missing GRAPH_OK"
      const statsIndex = readFileSync(join(workspace, "packages/stats/index.js"), "utf8")
      if (/avg\.js/.test(statsIndex) && !existsSync(join(workspace, "packages/stats/avg.js"))) {
        return "stats/index still points at missing avg.js"
      }
      return null
    },
  },
  {
    id: "long-pipeline-debug",
    title: "Debug 3-stage pipeline until green",
    suite: "long",
    capabilities: ["shell_verify", "investigate", "edit", "test_loop", "multi_file"],
    prompt: [
      "Pipeline stages: ingest → transform → emit.",
      "Run `node pipeline/run.mjs`. It must exit 0 and print PIPELINE_OK.",
      "Each stage can fail independently. Fix whatever is broken; keep stage contracts in comments.",
      "You must actually run the pipeline while debugging.",
    ].join("\n"),
    allowCreated: ["out/result.json"],
    seed: {
      "data/input.csv": "name,score\nalice,10\nbob,20\ncara,30\n",
      "pipeline/ingest.mjs": "import { readFileSync } from 'node:fs'\nexport function ingest(path) {\n  const text = readFileSync(path, 'utf8').trim()\n  const [header, ...rows] = text.split(/\\r?\\n/)\n  const keys = header.split(',')\n  return rows.map((row) => {\n    const vals = row.split(',')\n    const obj = {}\n    keys.forEach((k, i) => { obj[k] = vals[i] })\n    return obj\n  })\n}\n",
      "pipeline/transform.mjs": "export function transform(rows) {\n  // BUG: treats score as string concat / wrong field\n  return rows.map((r) => ({ name: r.name.toUpperCase(), score: r.score + 1 }))\n}\n",
      "pipeline/emit.mjs": "import { mkdirSync, writeFileSync } from 'node:fs'\nexport function emit(rows, outPath) {\n  mkdirSync('out', { recursive: true })\n  const total = rows.reduce((s, r) => s + r.score, 0)\n  // BUG: writes wrong summary key expected by run.mjs\n  writeFileSync(outPath, JSON.stringify({ sum: total, rows }), 'utf8')\n  return total\n}\n",
      "pipeline/run.mjs": [
        "import { ingest } from './ingest.mjs'",
        "import { transform } from './transform.mjs'",
        "import { emit } from './emit.mjs'",
        "import { readFileSync } from 'node:fs'",
        "",
        "const rows = ingest('data/input.csv')",
        "const next = transform(rows)",
        "emit(next, 'out/result.json')",
        "const saved = JSON.parse(readFileSync('out/result.json', 'utf8'))",
        "if (saved.total !== 60) { console.error('bad total', saved); process.exit(1) }",
        "if (saved.rows.length !== 3) { console.error('rows'); process.exit(1) }",
        "if (saved.rows[0].name !== 'ALICE' || saved.rows[0].score !== 10) { console.error('row0', saved.rows[0]); process.exit(1) }",
        "console.log('PIPELINE_OK')",
      ].join("\n"),
    },
    score: (workspace) => {
      const run = runNode(workspace, "pipeline/run.mjs")
      if (!run.ok) return `pipeline failed: ${run.output}`
      if (!/PIPELINE_OK/.test(run.output)) return "missing PIPELINE_OK"
      if (!existsSync(join(workspace, "out/result.json"))) return "out/result.json missing"
      return null
    },
  },
  {
    id: "long-port-algorithm",
    title: "Port algorithm from notes + keep full suite green",
    suite: "long",
    capabilities: ["investigate", "edit", "test_loop", "shell_verify", "multi_file"],
    prompt: [
      "Port the algorithm described in notes/ALGORITHM.md into src/scheduler.js.",
      "Make ALL tests pass: node test/basic.mjs && node test/edge.mjs && node test/order.mjs",
      "Do not change test files.",
    ].join("\n"),
    seed: {
      "notes/ALGORITHM.md": [
        "# Interval Scheduler",
        "",
        "`schedule(tasks)` where each task is `{ id, duration, deadline }`.",
        "",
        "Rules:",
        "- Greedy: always run the pending task with the earliest deadline first.",
        "- Ties: lower `id` lexicographically first.",
        "- Start at time 0; tasks run sequentially without overlap.",
        "- A task is late if finishTime > deadline.",
        "- Return `{ order: string[], late: string[] }` where order is ids in run order,",
        "  and late is ids that finished after their deadline (stable by run order).",
      ].join("\n"),
      "src/scheduler.js": "export function schedule(tasks) {\n  return { order: [], late: [] }\n}\n",
      "test/basic.mjs": [
        "import { schedule } from '../src/scheduler.js'",
        "const r = schedule([",
        "  { id: 'a', duration: 2, deadline: 4 },",
        "  { id: 'b', duration: 2, deadline: 3 },",
        "])",
        "if (r.order.join(',') !== 'b,a') { console.error(r); process.exit(1) }",
        "if (r.late.join(',') !== '') { console.error('late', r); process.exit(1) }",
        "console.log('basic ok')",
      ].join("\n"),
      "test/edge.mjs": [
        "import { schedule } from '../src/scheduler.js'",
        "const r = schedule([",
        "  { id: 'x', duration: 5, deadline: 4 },",
        "  { id: 'y', duration: 1, deadline: 10 },",
        "])",
        "if (r.order.join(',') !== 'x,y') { console.error(r); process.exit(1) }",
        "if (r.late.join(',') !== 'x') { console.error('late', r); process.exit(1) }",
        "console.log('edge ok')",
      ].join("\n"),
      "test/order.mjs": [
        "import { schedule } from '../src/scheduler.js'",
        "const r = schedule([",
        "  { id: 'm', duration: 2, deadline: 5 },",
        "  { id: 'k', duration: 1, deadline: 5 },",
        "  { id: 'z', duration: 3, deadline: 3 },",
        "])",
        "if (r.order.join(',') !== 'z,k,m') { console.error(r); process.exit(1) }",
        "if (r.late.join(',') !== 'm') { console.error('late', r); process.exit(1) }",
        "console.log('order ok')",
      ].join("\n"),
    },
    score: (workspace) => {
      for (const t of ["test/basic.mjs", "test/edge.mjs", "test/order.mjs"]) {
        const run = runNode(workspace, t)
        if (!run.ok) return `${t} failed: ${run.output}`
      }
      return null
    },
  },
  {
    id: "long-regression-maze",
    title: "Surgical fix through a regression maze",
    suite: "long",
    capabilities: ["edit", "test_loop", "shell_verify", "investigate", "multi_file"],
    prompt: [
      "lib/pricing.js has a discount bug. Fix it so EVERY test passes:",
      "node test/t1.mjs && node test/t2.mjs && node test/t3.mjs && node test/t4.mjs && node test/t5.mjs",
      "Naive rewrites often break loyalty / coupon / tax interactions — be surgical.",
      "Do not modify tests.",
    ].join("\n"),
    seed: {
      "lib/pricing.js": [
        "export function price({ base, coupon = 0, loyalty = false, taxRate = 0.1 }) {",
        "  let amount = base",
        "  // BUG: coupon applied after tax and loyalty double-counts",
        "  if (loyalty) amount = amount * 0.9",
        "  amount = amount * (1 + taxRate)",
        "  amount = amount - coupon",
        "  if (loyalty) amount = amount * 0.9",
        "  return Number(amount.toFixed(2))",
        "}",
      ].join("\n"),
      "NOTES.md": [
        "Pricing rules (source of truth):",
        "1. Apply loyalty 10% off on base (once) when loyalty=true",
        "2. Then subtract coupon from the post-loyalty amount",
        "3. Then apply tax on the post-coupon amount",
        "4. Round to 2 decimals at the end",
        "5. Amount must never be negative — clamp to 0",
      ].join("\n"),
      "test/t1.mjs": "import { price } from '../lib/pricing.js'\nif (price({ base: 100 }) !== 110) { console.error('t1'); process.exit(1) }\nconsole.log('t1 ok')\n",
      "test/t2.mjs": "import { price } from '../lib/pricing.js'\nif (price({ base: 100, loyalty: true }) !== 99) { console.error('t2'); process.exit(1) }\nconsole.log('t2 ok')\n",
      "test/t3.mjs": "import { price } from '../lib/pricing.js'\nif (price({ base: 100, coupon: 20 }) !== 88) { console.error('t3'); process.exit(1) }\nconsole.log('t3 ok')\n",
      "test/t4.mjs": "import { price } from '../lib/pricing.js'\nif (price({ base: 100, loyalty: true, coupon: 10 }) !== 88) { console.error('t4'); process.exit(1) }\nconsole.log('t4 ok')\n",
      "test/t5.mjs": "import { price } from '../lib/pricing.js'\nif (price({ base: 10, coupon: 50 }) !== 0) { console.error('t5'); process.exit(1) }\nconsole.log('t5 ok')\n",
    },
    score: (workspace) => {
      for (const t of ["test/t1.mjs", "test/t2.mjs", "test/t3.mjs", "test/t4.mjs", "test/t5.mjs"]) {
        const run = runNode(workspace, t)
        if (!run.ok) return `${t} failed: ${run.output}`
      }
      return null
    },
  },
]

/** Tasks tagged suite=long (multi-hop agent stress). */
export const YOUMI_LONG_TASKS = YOUMI_BENCH_TASKS.filter((task) => task.suite === "long")

/** Short capability smoke (default suite when suite omitted). */
export const YOUMI_CORE_TASKS = YOUMI_BENCH_TASKS.filter((task) => (task.suite ?? "core") === "core")

export function createTaskWorkspace(task: BenchTask, baseDir?: string): string {
  const root = join(baseDir ?? tmpdir(), `youmi-bench-${task.id}-${Date.now()}-${Math.random().toString(16).slice(2)}`)
  mkdirSync(root, { recursive: true })
  for (const [rel, content] of Object.entries(task.seed ?? {})) {
    const full = join(root, rel)
    mkdirSync(join(full, ".."), { recursive: true })
    writeFileSync(full, content, "utf8")
  }
  return root
}

export function cleanupWorkspace(workspace: string) {
  try {
    rmSync(workspace, { recursive: true, force: true })
  } catch {
    // ignore cleanup races
  }
}

export interface BenchTaskResult {
  taskId: string
  engine: BenchEngine
  passed: boolean
  reason: string | null
  durationMs: number
  skipped?: boolean
  error?: string
  capabilities?: AgentCapability[]
}

export interface BenchReport {
  startedAt: string
  finishedAt: string
  engines: BenchEngine[]
  /** Gate: agent capability parity with Claude Code. */
  gate: "claude-agent-parity"
  results: BenchTaskResult[]
  summary: Partial<Record<BenchEngine, { passed: number; failed: number; skipped: number; total: number }>>
  capabilitySummary?: Partial<Record<BenchEngine, Partial<Record<AgentCapability, { passed: number; total: number }>>>>
}

export function summarizeResults(engines: BenchEngine[], results: BenchTaskResult[]): BenchReport["summary"] {
  const summary: BenchReport["summary"] = {}
  for (const engine of engines) {
    const rows = results.filter((row) => row.engine === engine)
    summary[engine] = {
      passed: rows.filter((row) => row.passed).length,
      failed: rows.filter((row) => !row.passed && !row.skipped).length,
      skipped: rows.filter((row) => row.skipped).length,
      total: rows.length,
    }
  }
  return summary
}

export function summarizeCapabilities(
  engines: BenchEngine[],
  results: BenchTaskResult[],
  tasks: BenchTask[] = YOUMI_BENCH_TASKS,
): BenchReport["capabilitySummary"] {
  const byId = new Map(tasks.map((task) => [task.id, task]))
  const out: NonNullable<BenchReport["capabilitySummary"]> = {}
  for (const engine of engines) {
    const bucket: Partial<Record<AgentCapability, { passed: number; total: number }>> = {}
    for (const row of results.filter((result) => result.engine === engine && !result.skipped)) {
      const caps = row.capabilities ?? byId.get(row.taskId)?.capabilities ?? []
      for (const cap of caps) {
        const current = bucket[cap] ?? { passed: 0, total: 0 }
        current.total += 1
        if (row.passed) current.passed += 1
        bucket[cap] = current
      }
    }
    out[engine] = bucket
  }
  return out
}

export function writeBenchReport(report: BenchReport, outDir: string): string {
  mkdirSync(outDir, { recursive: true })
  const stamp = report.startedAt.replace(/[:.]/g, "-")
  const path = join(outDir, `${stamp}.json`)
  writeFileSync(path, `${JSON.stringify(report, null, 2)}\n`, "utf8")
  return path
}
