import { readdirSync, readFileSync, statSync } from "node:fs"
import { relative, resolve, sep } from "node:path"
import type { ToolDefinitionConfig, ToolExecutionContext } from "@prismshadow/penguin-core"
import type { ShippedPlugin } from "../shared/plugin"

const SKIP_DIR_NAMES = new Set([".git", "node_modules", "dist", ".aiang", ".penguin"])
const MAX_GLOB_HITS = 200
const MAX_GREP_HITS = 80
const MAX_GREP_FILES = 400
const MAX_FILE_BYTES = 256_000

export const YOUMI_SHIPPED_PLUGINS: ShippedPlugin[] = [
  {
    name: "youmi-coding-tools",
    version: "1.0.0",
    description: "Youmi 内置编码工具插件：Glob 列文件、Grep 搜内容。",
    tools: ["glob", "grep"],
    builtin: true,
  },
  {
    name: "youmi-web",
    version: "1.0.0",
    description: "公开网页抓取（fetch_url）。只允许 http/https，拦截内网地址。",
    tools: ["fetch_url"],
    builtin: true,
  },
  {
    name: "youmi-toolkit",
    version: "1.0.0",
    description: "对齐 DSH toolkit 的常用小工具：当前时间。",
    tools: ["now"],
    builtin: true,
  },
]

export const GLOB_TOOL_DEFINITION: ToolDefinitionConfig = {
  name: "glob",
  description: "List files in the workspace matching a glob pattern (e.g. **/*.ts, src/**/*.tsx).",
  permission: "r",
  parameters: {
    type: "object",
    additionalProperties: false,
    properties: {
      pattern: { type: "string", description: "Glob pattern relative to the workspace." },
      path: { type: "string", description: "Optional subdirectory to search from." },
    },
    required: ["pattern"],
  },
}

export const GREP_TOOL_DEFINITION: ToolDefinitionConfig = {
  name: "grep",
  description: "Search file contents in the workspace for a regex or literal pattern.",
  permission: "r",
  parameters: {
    type: "object",
    additionalProperties: false,
    properties: {
      pattern: { type: "string", description: "Regex or literal text to search for." },
      path: { type: "string", description: "Optional file or directory to search." },
      glob: { type: "string", description: "Optional filename glob, e.g. *.ts." },
    },
    required: ["pattern"],
  },
}

export const FETCH_URL_TOOL_DEFINITION: ToolDefinitionConfig = {
  name: "fetch_url",
  description: "Fetch a public http(s) URL and return text (HTML/JSON/plain). Private/localhost addresses are blocked.",
  permission: "r",
  parameters: {
    type: "object",
    additionalProperties: false,
    properties: {
      url: { type: "string", description: "Public http or https URL." },
    },
    required: ["url"],
  },
}

export const NOW_TOOL_DEFINITION: ToolDefinitionConfig = {
  name: "now",
  description: "Return the current date and time in ISO-8601 and local timezone.",
  permission: "r",
  parameters: {
    type: "object",
    additionalProperties: false,
    properties: {},
  },
}

export const YOUMI_SHIPPED_TOOL_DEFINITIONS: ToolDefinitionConfig[] = [
  GLOB_TOOL_DEFINITION,
  GREP_TOOL_DEFINITION,
  FETCH_URL_TOOL_DEFINITION,
  NOW_TOOL_DEFINITION,
]

function asString(value: unknown): string {
  return typeof value === "string" ? value : ""
}

function resolveInsideWorkspace(workspaceDir: string, maybeRelative: string): string {
  const target = resolve(workspaceDir, maybeRelative || ".")
  const root = resolve(workspaceDir)
  const prefix = root.endsWith(sep) ? root : `${root}${sep}`
  if (target !== root && !target.startsWith(prefix)) {
    throw new Error("Path is outside the workspace.")
  }
  return target
}

function globToRegExp(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "{{GLOBSTAR}}")
    .replace(/\*/g, "[^/\\\\]*")
    .replace(/\?/g, "[^/\\\\]")
    .replace(/{{GLOBSTAR}}/g, ".*")
  return new RegExp(`^${escaped}$`, "i")
}

function walkFiles(root: string, workspaceDir: string, files: string[], cap: number) {
  if (files.length >= cap) return
  let entries
  try {
    entries = readdirSync(root, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    if (files.length >= cap) return
    if (entry.name === "." || entry.name === "..") continue
    const full = resolve(root, entry.name)
    if (entry.isDirectory()) {
      if (SKIP_DIR_NAMES.has(entry.name)) continue
      walkFiles(full, workspaceDir, files, cap)
      continue
    }
    if (!entry.isFile()) continue
    files.push(relative(workspaceDir, full).replaceAll("\\", "/"))
  }
}

export async function executeGlobTool(
  args: Record<string, unknown>,
  ctx: ToolExecutionContext,
): Promise<string> {
  const pattern = asString(args.pattern).trim()
  if (!pattern) return "glob: pattern is required"
  const start = resolveInsideWorkspace(ctx.workspaceDir, asString(args.path))
  const matcher = globToRegExp(pattern.replaceAll("\\", "/"))
  const files: string[] = []
  try {
    const stat = statSync(start)
    if (stat.isFile()) {
      const rel = relative(ctx.workspaceDir, start).replaceAll("\\", "/")
      return matcher.test(rel) ? rel : "(no matches)"
    }
  } catch {
    return "glob: path not found"
  }
  walkFiles(start, ctx.workspaceDir, files, 8_000)
  const hits = files.filter((file) => matcher.test(file)).slice(0, MAX_GLOB_HITS)
  if (hits.length === 0) return "(no matches)"
  const extra = files.filter((file) => matcher.test(file)).length - hits.length
  return extra > 0 ? `${hits.join("\n")}\n… ${extra} more` : hits.join("\n")
}

export async function executeGrepTool(
  args: Record<string, unknown>,
  ctx: ToolExecutionContext,
): Promise<string> {
  const pattern = asString(args.pattern)
  if (!pattern) return "grep: pattern is required"
  let regex: RegExp
  try {
    regex = new RegExp(pattern, "m")
  } catch {
    regex = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "m")
  }
  const start = resolveInsideWorkspace(ctx.workspaceDir, asString(args.path))
  const fileGlob = asString(args.glob).trim()
  const fileMatcher = fileGlob ? globToRegExp(fileGlob.replaceAll("\\", "/")) : null
  const files: string[] = []
  try {
    const stat = statSync(start)
    if (stat.isFile()) {
      files.push(relative(ctx.workspaceDir, start).replaceAll("\\", "/"))
    } else {
      walkFiles(start, ctx.workspaceDir, files, MAX_GREP_FILES)
    }
  } catch {
    return "grep: path not found"
  }

  const hits: string[] = []
  for (const rel of files) {
    if (hits.length >= MAX_GREP_HITS) break
    if (fileMatcher && !fileMatcher.test(rel.split("/").pop() ?? rel)) continue
    const full = resolve(ctx.workspaceDir, rel)
    let text = ""
    try {
      const stat = statSync(full)
      if (stat.size > MAX_FILE_BYTES) continue
      text = readFileSync(full, "utf8")
    } catch {
      continue
    }
    const lines = text.split(/\r?\n/)
    for (let index = 0; index < lines.length; index++) {
      if (hits.length >= MAX_GREP_HITS) break
      const line = lines[index]!
      if (!regex.test(line)) continue
      hits.push(`${rel}:${index + 1}:${line}`)
    }
  }
  if (hits.length === 0) return "(no matches)"
  return hits.join("\n")
}

const MAX_FETCH_CHARS = 80_000

export function assertPublicHttpUrl(raw: string): URL {
  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    throw new Error("fetch_url: invalid URL")
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("fetch_url: only http/https URLs are allowed")
  }
  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "")
  if (
    host === "localhost"
    || host.endsWith(".localhost")
    || host.endsWith(".local")
    || host === "0.0.0.0"
    || host === "::1"
    || host === "127.0.0.1"
    || host.startsWith("127.")
    || host.startsWith("10.")
    || host.startsWith("192.168.")
    || host.startsWith("169.254.")
    || /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)
  ) {
    throw new Error("fetch_url: private or localhost addresses are blocked")
  }
  return parsed
}

export async function executeFetchUrlTool(
  args: Record<string, unknown>,
  _ctx: ToolExecutionContext,
): Promise<string> {
  const raw = asString(args.url).trim()
  if (!raw) return "fetch_url: url is required"
  const parsed = assertPublicHttpUrl(raw)
  const response = await fetch(parsed, {
    redirect: "follow",
    signal: AbortSignal.timeout(15_000),
    headers: { "User-Agent": "YoumiAiagent" },
  })
  const text = await response.text()
  const clipped = text.length > MAX_FETCH_CHARS
    ? `${text.slice(0, MAX_FETCH_CHARS)}\n… truncated`
    : text
  return `HTTP ${response.status} ${response.statusText}\n${clipped}`
}

export async function executeNowTool(): Promise<string> {
  const date = new Date()
  return `${date.toISOString()}\n${date.toString()}`
}
