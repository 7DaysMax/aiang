export interface ProjectTreeEntry {
  name: string
  path: string
  type: "dir" | "file"
}

export interface ProjectTreeSnapshot {
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

async function parseJsonResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let message = `${response.status} ${response.statusText}`
    try {
      const body = (await response.json()) as { error?: string }
      if (body.error) message = body.error
    } catch {
      // fall through to status text
    }
    throw new Error(message)
  }
  return (await response.json()) as T
}

export async function listProjectTree(projectId: string, dir: string): Promise<ProjectTreeEntry[]> {
  const query = dir ? `?path=${encodeURIComponent(dir)}` : ""
  const snapshot = await parseJsonResponse<ProjectTreeSnapshot>(
    await fetch(`/api/projects/${encodeURIComponent(projectId)}/tree${query}`),
  )
  return snapshot.entries
}

export async function readProjectFileText(projectId: string, filePath: string): Promise<{ text: string; truncated: boolean }> {
  const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/files/${encodeURIComponent(filePath)}/content`)
  if (!response.ok) {
    throw new Error(`读取失败：${response.status} ${response.statusText}`)
  }
  return { text: await response.text(), truncated: false }
}

export async function writeProjectFile(projectId: string, filePath: string, content: string): Promise<void> {
  const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/files/${encodeURIComponent(filePath)}/content`, {
    method: "PUT",
    headers: { "Content-Type": "text/plain; charset=utf-8" },
    body: content,
  })
  if (!response.ok) {
    let message = `${response.status} ${response.statusText}`
    try {
      const body = (await response.json()) as { error?: string }
      if (body.error) message = body.error
    } catch {
      // fall through
    }
    throw new Error(`保存失败：${message}`)
  }
}

export async function compileProject(projectId: string): Promise<CompileResult> {
  return await parseJsonResponse<CompileResult>(
    await fetch(`/api/projects/${encodeURIComponent(projectId)}/compile`, { method: "POST" }),
  )
}

const BINARY_EXTENSIONS = new Set([
  "png", "jpg", "jpeg", "gif", "webp", "ico", "bmp", "avif",
  "pdf", "zip", "gz", "tgz", "tar", "7z", "rar", "wasm", "woff", "woff2", "ttf", "otf",
  "mp3", "mp4", "mov", "webm", "wav", "aac", "flac", "ogg", "db", "sqlite", "lock",
])

export function isProbablyTextFile(filePath: string): boolean {
  const name = filePath.split("/").at(-1) ?? filePath
  if (name.startsWith(".") && !name.includes(".")) return false
  const extension = name.includes(".") ? name.split(".").at(-1)!.toLowerCase() : ""
  if (!extension) return true
  return !BINARY_EXTENSIONS.has(extension)
}
