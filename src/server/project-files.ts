import { readdir, readFile, stat, writeFile } from "node:fs/promises"
import path from "node:path"
import type { EventStore } from "./event-store"
import { inferProjectFileContentType } from "./uploads"

export const MAX_PROJECT_FILE_BYTES = 5 * 1024 * 1024
/** 响应头：本次返回被截断，以及文件的真实字节数。 */
export const FILE_TRUNCATED_HEADER = "x-aiang-truncated"
export const FILE_SIZE_HEADER = "x-aiang-file-size"
const MAX_TREE_ENTRIES = 2000
const MAX_COMPILE_OUTPUT_CHARS = 60_000
const COMPILE_TIMEOUT_MS = 180_000

/**
 * 文件面板隐藏的噪音目录/文件（体积大或内部产物）。
 *
 * 同一份名单也是无 git 项目快照扫描的过滤器，那边要把每个文件读出来做哈希，
 * 所以漏掉一个缓存目录的代价比这里大得多：一个 Rust 的 target/ 或 Python 的
 * .venv/ 动辄上万个文件。
 *
 * 收录标准是「几乎不可能是人写的源码」。`build`、`out` 这类裸名字故意不收，
 * 它们在部分项目里确实放着源码或脚本，藏掉比留着更糟。
 */
export const IGNORED_TREE_NAMES = new Set([
  ".git", "node_modules", "dist", ".kanna", ".aiang", ".DS_Store", "Thumbs.db",
  // 包管理器 lockfile
  "bun.lock", "package-lock.json", "pnpm-lock.yaml", "yarn.lock",
  // 构建/打包工具缓存
  ".next", ".nuxt", ".svelte-kit", ".turbo", ".parcel-cache", ".gradle", ".cache", "target",
  // Python
  "__pycache__", ".venv", "venv", ".mypy_cache", ".pytest_cache", ".ruff_cache", ".tox",
  // 测试覆盖率产物
  "coverage", ".nyc_output",
])

/** 路径上任意一段命中噪音名单即为噪音（名单只认单段名字）。 */
export function isNoiseTreePath(relativePath: string) {
  return relativePath.split("/").some((segment) => IGNORED_TREE_NAMES.has(segment))
}

export interface ProjectTreeEntry {
  name: string
  /** 相对项目根的 posix 路径。 */
  path: string
  type: "dir" | "file"
}

export interface ProjectTreeSnapshot {
  /** 请求的目录（相对项目根，"" = 根）。 */
  dir: string
  entries: ProjectTreeEntry[]
}

export interface CompileResult {
  ok: boolean
  exitCode: number
  command: string
  output: string
  durationMs: number
}

/**
 * 解析项目内相对路径：规范化、防目录穿越、必须在项目根内。
 * 返回绝对路径；非法时返回 null。
 */
function resolveProjectPath(projectRoot: string, relativePath: string): string | null {
  const normalized = path.posix.normalize(relativePath.replaceAll("\\", "/"))
  if (!normalized || normalized === "." || normalized.startsWith("../") || normalized.includes("/../") || path.posix.isAbsolute(normalized)) {
    return null
  }
  const filePath = path.resolve(projectRoot, normalized)
  const root = path.resolve(projectRoot)
  if (filePath !== root && !filePath.startsWith(`${root}${path.sep}`)) {
    return null
  }
  return filePath
}

function getProject(store: EventStore, projectId: string) {
  const project = store.getProject(projectId)
  if (!project) return null
  return project
}

export async function handleProjectTree(req: Request, url: URL, store: EventStore): Promise<Response | null> {
  const match = url.pathname.match(/^\/api\/projects\/([^/]+)\/tree$/)
  if (!match) return null
  if (req.method !== "GET") {
    return new Response(null, { status: 405, headers: { Allow: "GET" } })
  }

  const project = getProject(store, match[1]!)
  if (!project) return Response.json({ error: "Project not found" }, { status: 404 })

  const dir = (url.searchParams.get("path") ?? "").replaceAll("\\", "/")
  const resolved = dir ? resolveProjectPath(project.localPath, dir) : path.resolve(project.localPath)
  if (!resolved) return Response.json({ error: "Invalid project path" }, { status: 400 })

  let entries: ProjectTreeEntry[]
  try {
    const names = await readdir(resolved, { withFileTypes: true })
    const rows = names
      .filter((entry) => !IGNORED_TREE_NAMES.has(entry.name))
      .sort((a, b) => {
        if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1
        return a.name.localeCompare(b.name, "en", { sensitivity: "base" })
      })
      .slice(0, MAX_TREE_ENTRIES)
    entries = rows.map((entry) => ({
      name: entry.name,
      path: path.posix.join(dir, entry.name),
      type: entry.isDirectory() ? "dir" : "file",
    }))
  } catch {
    return Response.json({ error: "Directory not found" }, { status: 404 })
  }

  return Response.json({ dir, entries } satisfies ProjectTreeSnapshot)
}

export async function handleProjectFileWrite(req: Request, url: URL, store: EventStore): Promise<Response | null> {
  const match = url.pathname.match(/^\/api\/projects\/([^/]+)\/files\/(.+?)\/content$/)
  if (!match) return null
  // 只处理 PUT，GET 读文件交给后面的 handler。
  if (req.method !== "PUT") return null

  const project = getProject(store, match[1]!)
  if (!project) return Response.json({ error: "Project not found" }, { status: 404 })

  const relativePath = decodeURIComponent(match[2]!)
  const filePath = resolveProjectPath(project.localPath, relativePath)
  if (!filePath) return Response.json({ error: "Invalid project file path" }, { status: 400 })

  const content = await req.text()
  if (Buffer.byteLength(content, "utf8") > MAX_PROJECT_FILE_BYTES) {
    return Response.json({ error: "File too large" }, { status: 413 })
  }

  try {
    const info = await stat(filePath)
    if (!info.isFile()) return Response.json({ error: "File not found" }, { status: 404 })
    await writeFile(filePath, content, "utf8")
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "ENOENT") {
      return Response.json({ error: "File not found" }, { status: 404 })
    }
    return Response.json({ error: "Failed to write file" }, { status: 500 })
  }

  return Response.json({ ok: true })
}

/** 读取项目文件文本内容（给文件面板用，限制大小）。 */
export async function readProjectFileText(projectRoot: string, relativePath: string): Promise<{ text: string; truncated: boolean } | null> {
  const filePath = resolveProjectPath(projectRoot, relativePath)
  if (!filePath) return null
  try {
    const info = await stat(filePath)
    if (!info.isFile()) return null
    const bytes = await readFile(filePath)
    const truncated = bytes.byteLength > MAX_PROJECT_FILE_BYTES
    const sliced = truncated ? bytes.subarray(0, MAX_PROJECT_FILE_BYTES) : bytes
    return { text: new TextDecoder("utf8", { fatal: false }).decode(sliced), truncated }
  } catch {
    return null
  }
}

const COMPILE_SCRIPT_PREFERENCE = ["check", "build", "typecheck"] as const

async function pickCompileScript(projectRoot: string): Promise<string | null> {
  try {
    const pkg = JSON.parse(await readFile(path.join(projectRoot, "package.json"), "utf8")) as { scripts?: Record<string, string> }
    const scripts = pkg.scripts ?? {}
    for (const name of COMPILE_SCRIPT_PREFERENCE) {
      if (typeof scripts[name] === "string" && scripts[name]!.trim()) return name
    }
    return null
  } catch {
    return null
  }
}

export async function handleProjectCompile(req: Request, url: URL, store: EventStore): Promise<Response | null> {
  const match = url.pathname.match(/^\/api\/projects\/([^/]+)\/compile$/)
  if (!match) return null
  if (req.method !== "POST") {
    return new Response(null, { status: 405, headers: { Allow: "POST" } })
  }

  const project = getProject(store, match[1]!)
  if (!project) return Response.json({ error: "Project not found" }, { status: 404 })

  const script = await pickCompileScript(project.localPath)
  if (!script) {
    return Response.json({ ok: false, exitCode: -1, command: "none", output: "package.json 中没有 check/build/typecheck 脚本", durationMs: 0 } satisfies CompileResult)
  }
  const command = `bun run ${script}`

  const startedAt = Date.now()
  const compileProcess = Bun.spawn(["bun", "run", script], {
    cwd: project.localPath,
    stdout: "pipe",
    stderr: "pipe",
    env: process.env,
  })
  const killTimer = setTimeout(() => {
    compileProcess.kill()
  }, COMPILE_TIMEOUT_MS)

  try {
    const [stdout, stderr] = await Promise.all([new Response(compileProcess.stdout).text(), new Response(compileProcess.stderr).text()])
    // Bun.spawn 的 exitCode 在输出管道读完前可能还没填充，等 .exited 拿到最终退出码。
    const exitCode = (await compileProcess.exited.catch(() => -1)) ?? -1
    const output = `${stderr}\n${stdout}`.trim().slice(-MAX_COMPILE_OUTPUT_CHARS)
    return Response.json({
      ok: exitCode === 0,
      exitCode,
      command,
      output,
      durationMs: Date.now() - startedAt,
    } satisfies CompileResult)
  } finally {
    clearTimeout(killTimer)
  }
}

export function contentTypeForProjectFile(relativePath: string, fallbackType: string) {
  return inferProjectFileContentType(relativePath, fallbackType)
}
