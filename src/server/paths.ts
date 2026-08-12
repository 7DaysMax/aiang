import { spawn } from "node:child_process"
import { readdirSync } from "node:fs"
import { mkdir, readdir, stat } from "node:fs/promises"
import { homedir } from "node:os"
import path from "node:path"
import type { FsDirEntry, FsListResult } from "../shared/types"

/**
 * 按名字在常见目录（桌面/文档/下载/主目录）里找同名文件夹。拖入文件夹时，
 * 部分浏览器（如 Codex 桌面内置浏览器）拿不到真实绝对路径，只能给出文件夹
 * 名；这时用这个名字在常用位置兜底定位，最多返回 3 个候选。
 */
export function findFolderByName(name: string): string[] {
  const trimmed = name.trim()
  if (!trimmed) return []
  const home = homedir()
  const roots = [
    path.join(home, "Desktop"),
    path.join(home, "Documents"),
    path.join(home, "Downloads"),
    home,
  ]
  const matches: string[] = []
  const lowerName = trimmed.toLocaleLowerCase()
  for (const root of roots) {
    if (matches.length >= 3) break
    let entries: string[] = []
    try {
      entries = readdirSync(root)
    } catch {
      continue
    }
    // 精确匹配优先，其次大小写不敏感匹配（Windows/macOS 默认大小写不敏感）。
    const exact = entries.find((entry) => entry === trimmed)
    const candidate = exact ?? entries.find((entry) => entry.toLocaleLowerCase() === lowerName)
    if (candidate) {
      const fullPath = path.join(root, candidate)
      if (!matches.includes(fullPath)) matches.push(fullPath)
    }
  }
  return matches
}

/** Render an absolute path with the home directory abbreviated to `~`. */
export function formatDisplayPath(filePath: string) {
  const homePath = homedir()
  if (filePath === homePath) return "~"
  if (filePath.startsWith(`${homePath}${path.sep}`)) {
    return `~${filePath.slice(homePath.length)}`
  }
  return filePath
}

export function resolveLocalPath(localPath: string) {
  const trimmed = localPath.trim()
  if (!trimmed) {
    throw new Error("Project path is required")
  }
  if (trimmed === "~") {
    return homedir()
  }
  if (trimmed.startsWith("~/")) {
    return path.join(homedir(), trimmed.slice(2))
  }
  return path.resolve(trimmed)
}

/**
 * Require a directory to already exist on disk. `project.open` must NOT create
 * missing directories: a dropped/typed path that doesn't exist is almost always
 * a misread folder name (e.g. `C:\测试` instead of `C:\Users\me\Desktop\测试`),
 * and mkdir -p would silently materialize a bogus empty workspace.
 */
export async function requireExistingDirectory(localPath: string) {
  const resolvedPath = resolveLocalPath(localPath)
  let info
  try {
    info = await stat(resolvedPath)
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === "ENOENT") throw new Error(`Folder not found: ${resolvedPath}`)
    if (code === "EACCES" || code === "EPERM") throw new Error(`Permission denied: ${resolvedPath}`)
    throw error
  }
  if (!info.isDirectory()) {
    throw new Error(`Not a folder: ${resolvedPath}`)
  }
}

/** A clone can target a path that doesn't exist yet, or an existing empty directory. */
async function isAvailableCloneTarget(p: string): Promise<boolean> {
  try {
    const entries = await readdir(p)
    return entries.length === 0
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "ENOENT"
  }
}

/**
 * Pick a clone destination that is missing or empty.
 * Tries `localPath` first, then falls back to `fallbackPath` if provided.
 * Returns the resolved absolute path that was chosen.
 */
export async function resolveClonePath(localPath: string, fallbackPath?: string): Promise<string> {
  const primary = resolveLocalPath(localPath)
  if (await isAvailableCloneTarget(primary)) {
    return primary
  }
  if (fallbackPath) {
    const secondary = resolveLocalPath(fallbackPath)
    if (await isAvailableCloneTarget(secondary)) {
      return secondary
    }
  }
  throw new Error(`Destination path '${primary}' already exists and is not empty`)
}

/**
 * Clone a git repository into the given local path.
 * The parent directory is created if it doesn't exist.
 * Rejects if `git clone` exits with a non-zero code.
 */
export async function cloneRepository(cloneUrl: string, resolvedPath: string): Promise<void> {
  const parentDir = path.dirname(resolvedPath)

  await mkdir(parentDir, { recursive: true })

  return new Promise<void>((resolve, reject) => {
    const child = spawn("git", ["clone", cloneUrl, resolvedPath], {
      stdio: ["ignore", "pipe", "pipe"],
    })

    let stderr = ""
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString()
    })

    child.on("error", (err) => {
      reject(new Error(`Failed to start git clone: ${err.message}`))
    })

    child.on("close", (code) => {
      if (code === 0) {
        resolve()
      } else {
        const message = stderr.trim() || `git clone exited with code ${code}`
        reject(new Error(message))
      }
    })
  })
}

/**
 * Prepare a directory for a brand-new project: mkdir -p, then `git init` —
 * but only when the directory is empty (never re-inits an existing repo or
 * touches a folder that already has contents; those degrade to a plain open).
 * Returns the resolved absolute path.
 */
export async function initializeProjectDirectory(localPath: string): Promise<string> {
  const resolved = resolveLocalPath(localPath)
  await mkdir(resolved, { recursive: true })
  const info = await stat(resolved)
  if (!info.isDirectory()) {
    throw new Error(`Not a folder: ${resolved}`)
  }

  const entries = await readdir(resolved)
  if (entries.length > 0) {
    return resolved
  }

  await new Promise<void>((resolve, reject) => {
    const child = spawn("git", ["init"], {
      cwd: resolved,
      stdio: ["ignore", "pipe", "pipe"],
    })

    let stderr = ""
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString()
    })

    child.on("error", (err) => {
      reject(new Error(`Failed to start git init: ${err.message}`))
    })

    child.on("close", (code) => {
      if (code === 0) {
        resolve()
      } else {
        reject(new Error(stderr.trim() || `git init exited with code ${code}`))
      }
    })
  })

  return resolved
}

const FS_LIST_ENTRY_LIMIT = 2_000

function compareEntryNames(a: FsDirEntry, b: FsDirEntry) {
  return a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
}

/** Walk up from `resolved` to the closest existing directory, collecting the missing segments. */
async function findNearestDirectory(resolved: string): Promise<{ path: string; missing: string[] }> {
  let current = resolved
  const missing: string[] = []
  while (true) {
    try {
      const info = await stat(current)
      if (info.isDirectory()) return { path: current, missing }
    } catch {
      // keep walking up
    }
    const parent = path.dirname(current)
    if (parent === current) return { path: current, missing }
    missing.unshift(path.basename(current))
    current = parent
  }
}

/**
 * List a directory for the project browser. One readdir syscall pass:
 * git detection and dir/file split both come from the same dirent array.
 * Defaults to the home directory when no path is given. With `nearest`,
 * a missing path falls back to its closest existing ancestor and the
 * result carries the missing remainder in `missingSuffix`.
 */
export async function listDirectory(
  requestedPath?: string,
  opts?: { nearest?: boolean }
): Promise<FsListResult> {
  let resolved = requestedPath?.trim() ? resolveLocalPath(requestedPath) : homedir()
  let missingSuffix: string | undefined

  if (opts?.nearest) {
    const nearest = await findNearestDirectory(resolved)
    resolved = nearest.path
    missingSuffix = nearest.missing.length > 0 ? nearest.missing.join("/") : undefined
  }

  let dirents
  try {
    dirents = await readdir(resolved, { withFileTypes: true })
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === "ENOENT") throw new Error(`Folder not found: ${resolved}`)
    if (code === "ENOTDIR") throw new Error(`Not a folder: ${resolved}`)
    if (code === "EACCES" || code === "EPERM") throw new Error(`Permission denied: ${resolved}`)
    throw error
  }

  let isGitRepo = false
  const dirs: FsDirEntry[] = []
  const files: FsDirEntry[] = []
  for (const dirent of dirents) {
    if (dirent.isDirectory()) {
      if (dirent.name === ".git") isGitRepo = true
      dirs.push({ name: dirent.name, kind: "dir" })
    } else {
      files.push({ name: dirent.name, kind: "file" })
    }
  }
  dirs.sort(compareEntryNames)
  files.sort(compareEntryNames)

  const entries = [...dirs, ...files]
  const truncated = entries.length > FS_LIST_ENTRY_LIMIT
  const parent = path.dirname(resolved)

  return {
    path: resolved,
    parentPath: parent === resolved ? null : parent,
    homePath: homedir(),
    isGitRepo,
    entries: truncated ? entries.slice(0, FS_LIST_ENTRY_LIMIT) : entries,
    truncated,
    ...(missingSuffix ? { missingSuffix } : {}),
  }
}

/** Create a directory (parents included) and return its fresh listing. */
export async function createDirectory(requestedPath: string): Promise<FsListResult> {
  const resolved = resolveLocalPath(requestedPath)
  await mkdir(resolved, { recursive: true })
  const info = await stat(resolved)
  if (!info.isDirectory()) {
    throw new Error(`Not a folder: ${resolved}`)
  }
  return listDirectory(resolved)
}

export function getProjectUploadDir(localPath: string) {
  return path.join(resolveLocalPath(localPath), ".kanna", "uploads")
}

export function getProjectExportDir(localPath: string) {
  return path.join(resolveLocalPath(localPath), ".kanna", "exports")
}
