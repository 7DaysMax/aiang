import { useCallback, useEffect, useRef, useState } from "react"
import { Check, FolderOpen, FolderPlus, FolderUp, LoaderCircle, PencilLine, TriangleAlert } from "lucide-react"
import type { FsListResult } from "../../shared/types"
import type { KannaState } from "../app/useKannaState"
import { cn } from "../lib/utils"
import { Button } from "./ui/button"
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "./ui/dialog"
import { Input } from "./ui/input"

/**
 * 拖入文件夹添加项目：把 Finder/资源管理器里的文件夹拖进窗口，松开后弹窗
 * 让用户自定义显示名称（侧边栏固定显示），确认后打开项目并新建对话。
 *
 * 浏览器不会把拖入目录的绝对路径直接交给页面，这里按优先级尝试多个来源：
 * 1. Electron/桌面外壳（Codex 桌面内置浏览器）：File.path —— 真实绝对路径
 * 2. Chromium：DataTransferItem.webkitGetAsEntry().fullPath
 * 3. Firefox/部分文件管理器：text/uri-list 里的 file:// URL
 * 4. text/plain 里直接是绝对路径
 * 都拿不到或路径不对时：路径可手动编辑，并用 fs.list 实时校验；校验失败还会
 * 按文件夹名在桌面/文档/下载里兜底查找（fs.findFolderByName）。
 */
export function normalizeDroppedPath(rawPath: string): string {
  const trimmed = rawPath.trim()
  if (!trimmed) return ""
  // Windows：/C:/Users/... → C:/Users/...（保留 \\server\share 这类 UNC 前缀）。
  if (/^\/[A-Za-z]:[\\/]/.test(trimmed)) return trimmed.slice(1)
  return trimmed
}

export function parseFileUri(uri: string): string | null {
  if (!/^file:\/\//i.test(uri)) return null
  try {
    const url = new URL(uri)
    if (url.protocol !== "file:") return null
    const pathname = decodeURIComponent(url.pathname)
    const path = normalizeDroppedPath(pathname)
    return path || null
  } catch {
    return null
  }
}

function looksLikeAbsolutePath(value: string): boolean {
  return !/[\r\n]/.test(value) && /^(\/[^/]|[A-Za-z]:[\\/])/.test(value)
}

/**
 * 只含文件夹名的路径（例如 Windows 内核拖入时拿到的 `C:\测试`、`/测试`）。
 * 这类路径不是真实位置，直接当作项目路径打开会打开（甚至建出）错误的空目录。
 */
export function isNameOnlyPath(value: string): boolean {
  const trimmed = value.trim()
  if (!trimmed) return false
  // Windows：盘符 + 单段（C:\测试 / C:/测试）
  if (/^[A-Za-z]:[\\/][^\\/]+$/.test(trimmed)) return true
  // 单段 + 前导斜杠（/测试）
  if (/^\/[^\\/]+$/.test(trimmed)) return true
  return false
}

/** 仅 Windows 盘符 + 单段的路径：确认时一律拦截（可能已被旧版本建出空目录）。 */
export function isWindowsNameOnlyPath(value: string): boolean {
  return /^[A-Za-z]:[\\/][^\\/]+$/.test(value.trim())
}

/** 按名找到完整路径后自动填第一条，其余留给用户切换。 */
export function autoFillFromNameLookup(matches: string[]): { path: string | null; alternatives: string[] } {
  const [path, ...alternatives] = matches
  return { path: path ?? null, alternatives }
}

function pathBasename(localPath: string): string {
  return localPath.split(/[\\/]/).filter(Boolean).pop() ?? localPath
}

interface ExtractedDrop {
  /** 可靠读到的路径；null 表示没读到，需要手动填。 */
  path: string | null
  /** 只读到了文件夹名时的名字（用于按名查找完整路径）。 */
  nameHint: string | null
  /** 是否只是「猜测」的路径（例如只有文件夹名），需要用户确认。 */
  guessed: boolean
  /** 拖入的是文件（不是文件夹）时给出提示。 */
  notice: string | null
  /** 需要打开手动填路径的弹窗（识别到文件夹但读不到路径时）。 */
  openManual: boolean
}

function nativePathOf(file: File | null): string | null {
  // Electron / Codex 桌面内置浏览器给 File 挂了一个非标准 path 属性，
  // 这才是真实绝对路径（如 C:\Users\me\Desktop\测试）。
  const native = (file as { path?: unknown } | null)?.path
  if (typeof native !== "string") return null
  const path = normalizeDroppedPath(native)
  return path && looksLikeAbsolutePath(path) ? path : null
}

export function extractDroppedFolder(event: DragEvent): ExtractedDrop {
  const dataTransfer = event.dataTransfer
  if (!dataTransfer) return { path: null, nameHint: null, guessed: false, notice: null, openManual: false }

  const items = Array.from(dataTransfer.items)
  const hasFiles = items.some((item) => item.kind === "file")
  let sawDirectory = false
  let nameHint: string | null = null

  for (const item of items) {
    if (item.kind !== "file") continue
    const entry = item.webkitGetAsEntry?.()
    if (entry && !entry.isDirectory) continue
    if (entry?.isDirectory) sawDirectory = true
    // 1. Electron/桌面外壳：File.path 是真实绝对路径，优先采用。
    const nativePath = nativePathOf(item.getAsFile?.() ?? null)
    if (nativePath && !isNameOnlyPath(nativePath)) {
      return { path: nativePath, nameHint: null, guessed: false, notice: null, openManual: false }
    }
    if (nativePath) nameHint ??= pathBasename(nativePath)
    // 2. Chromium：webkitGetAsEntry().fullPath。
    if (entry?.isDirectory) {
      const path = normalizeDroppedPath(entry.fullPath)
      if (path && !isNameOnlyPath(path)) {
        return { path, nameHint: null, guessed: true, notice: null, openManual: false }
      }
      if (path) nameHint ??= pathBasename(path)
    }
  }

  // 3. text/uri-list：Firefox / 部分文件管理器会提供 file:// 链接。
  const uriList = dataTransfer.getData("text/uri-list") ?? ""
  for (const line of uriList.split(/\r?\n/)) {
    const path = parseFileUri(line.trim())
    if (path && !isNameOnlyPath(path)) {
      return { path, nameHint: null, guessed: true, notice: null, openManual: false }
    }
    if (path) nameHint ??= pathBasename(path)
  }

  // 4. text/plain：个别环境直接把绝对路径放进纯文本。
  const plain = (dataTransfer.getData("text/plain") ?? "").trim()
  if (looksLikeAbsolutePath(plain)) {
    const path = normalizeDroppedPath(plain)
    if (!isNameOnlyPath(path)) {
      return { path, nameHint: null, guessed: true, notice: null, openManual: false }
    }
    nameHint ??= pathBasename(path)
  }

  // 只识别到文件夹名（Windows 内核常见的 C:\测试）：按名兜底查找完整路径。
  if (nameHint) {
    return {
      path: null,
      nameHint,
      guessed: true,
      openManual: true,
      notice: `拖入只识别到文件夹名「${nameHint}」，已按名称查找完整路径，请选择或手动填写`,
    }
  }

  return {
    path: null,
    nameHint: null,
    guessed: false,
    openManual: sawDirectory,
    notice: sawDirectory
      ? "浏览器没有提供文件夹路径，请在下方手动填写"
      : hasFiles
        ? "拖入的是文件而不是文件夹，请拖整个文件夹进来"
        : "无法自动读取拖入的路径，请在下方手动填写文件夹路径",
  }
}

type PathStatus = "idle" | "checking" | "ok" | "error"

export function DropProjectDialog({ state }: { state: KannaState }) {
  const [dragDepth, setDragDepth] = useState(0)
  const [pending, setPending] = useState<{ notice: string | null } | null>(null)
  const [name, setName] = useState("")
  const [path, setPath] = useState("")
  const [pathStatus, setPathStatus] = useState<PathStatus>("idle")
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [lookupName, setLookupName] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const depthRef = useRef(0)
  const noticeTimerRef = useRef<number | null>(null)

  useEffect(() => {
    const hasFiles = (event: DragEvent) =>
      Array.from(event.dataTransfer?.types ?? []).includes("Files")

    const handleDragEnter = (event: DragEvent) => {
      if (!hasFiles(event)) return
      event.preventDefault()
      depthRef.current += 1
      setDragDepth(depthRef.current)
    }

    const handleDragOver = (event: DragEvent) => {
      if (!hasFiles(event)) return
      event.preventDefault()
      if (event.dataTransfer) event.dataTransfer.dropEffect = "copy"
    }

    const handleDragLeave = (event: DragEvent) => {
      if (!hasFiles(event)) return
      depthRef.current = Math.max(0, depthRef.current - 1)
      setDragDepth(depthRef.current)
    }

    const handleDrop = (event: DragEvent) => {
      if (!hasFiles(event)) return
      event.preventDefault()
      depthRef.current = 0
      setDragDepth(0)

      const { path: droppedPath, nameHint, notice: dropNotice, openManual } = extractDroppedFolder(event)
      if (!droppedPath) {
        // 文件拖入：只给一条短暂提示，避免「没反应」；识别到文件夹但读不到
        // 路径：弹出手动填写路径的弹窗。
        if (noticeTimerRef.current !== null) window.clearTimeout(noticeTimerRef.current)
        setNotice(dropNotice)
        noticeTimerRef.current = window.setTimeout(() => setNotice(null), 3000)
        if (openManual) {
          setPath("")
          setLookupName(nameHint ?? null)
          if (nameHint) setName(nameHint)
          setPending({ notice: dropNotice })
          setError(null)
        }
        return
      }
      setLookupName(null)
      setName(pathBasename(droppedPath))
      setPath(droppedPath)
      setPending({ notice: null })
      setError(null)
    }

    window.addEventListener("dragenter", handleDragEnter)
    window.addEventListener("dragover", handleDragOver)
    window.addEventListener("dragleave", handleDragLeave)
    window.addEventListener("drop", handleDrop)
    return () => {
      window.removeEventListener("dragenter", handleDragEnter)
      window.removeEventListener("dragover", handleDragOver)
      window.removeEventListener("dragleave", handleDragLeave)
      window.removeEventListener("drop", handleDrop)
      if (noticeTimerRef.current !== null) window.clearTimeout(noticeTimerRef.current)
    }
  }, [])

  // 路径实时校验：fs.list 通过 = 有效；失败则按文件夹名在常见位置兜底查找。
  useEffect(() => {
    if (!pending) {
      setPathStatus("idle")
      setSuggestions([])
      return
    }
    const trimmed = path.trim()
    // 拖入只拿到文件夹名（例如 Windows 内核给的 C:\测试）：直接按名字在
    // 常见位置查找完整路径并列出来，避免用错路径打开（或建出）空目录。
    if (!trimmed && lookupName) {
      let cancelled = false
      setPathStatus("checking")
      void state.socket.command<{ matches: string[] }>({ type: "fs.findFolderByName", name: lookupName })
        .then((result) => {
          if (cancelled) return
          const { path: autoPath, alternatives } = autoFillFromNameLookup(result.matches)
          if (autoPath) {
            setPath(autoPath)
            setLookupName(null)
            setSuggestions(alternatives)
            setPending((current) => current
              ? {
                  notice: alternatives.length > 0
                    ? `已自动填入完整路径，还找到 ${alternatives.length} 个同名文件夹，点一下可切换`
                    : null,
                }
              : current)
            return
          }
          setSuggestions([])
          setPathStatus("idle")
        })
        .catch(() => {
          if (cancelled) return
          setSuggestions([])
          setPathStatus("idle")
        })
      return () => { cancelled = true }
    }
    if (!trimmed) {
      setPathStatus("idle")
      setSuggestions([])
      return
    }
    setLookupName(null)
    let cancelled = false
    setPathStatus("checking")
    const timer = window.setTimeout(() => {
      void state.socket.command<FsListResult>({ type: "fs.list", path: trimmed })
        .then(() => {
          if (cancelled) return
          setPathStatus("ok")
          setSuggestions((current) => current.filter((match) => match.toLocaleLowerCase() !== trimmed.toLocaleLowerCase()))
        })
        .catch(() => {
          if (cancelled) return
          setPathStatus("error")
          void state.socket.command<{ matches: string[] }>({ type: "fs.findFolderByName", name: pathBasename(trimmed) })
            .then((result) => {
              if (cancelled) return
              setSuggestions(result.matches.filter((match) => match.toLocaleLowerCase() !== trimmed.toLocaleLowerCase()))
            })
            .catch(() => setSuggestions([]))
        })
    }, 350)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [path, pending, lookupName, state.socket])

  const confirmAdd = useCallback(async () => {
    if (!pending || submitting) return
    const finalName = name.trim() || pathBasename(path)
    const finalPath = path.trim()
    if (!finalPath) {
      setError("请填写文件夹路径")
      return
    }
    // Windows 内核拖入常把路径读成「盘符 + 文件夹名」（C:\测试）。这种路径
    // 不是真实位置，且可能已被旧版本建出同名空目录——确认前必须拦掉。
    if (isWindowsNameOnlyPath(finalPath)) {
      setError("路径不完整：只有文件夹名（如 C:\\测试）。请从下方找到的完整路径中选择，或手动填写完整路径。")
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      // 提交前让服务器确认路径真实存在：project.open 会 mkdir -p，读错路径
      // 会凭空建出垃圾目录，这里先拦一道。
      await state.socket.command<FsListResult>({ type: "fs.list", path: finalPath })
      await state.handleCreateProject({
        mode: "existing",
        localPath: finalPath,
        title: finalName,
        sidebarTitle: finalName,
      })
      setPending(null)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setError(/not found|not a folder|no such|permission/i.test(message)
        ? "路径不存在、不是文件夹或没有访问权限，请检查后重试"
        : message)
    } finally {
      setSubmitting(false)
    }
  }, [name, path, pending, state.handleCreateProject, state.socket, submitting])

  const close = useCallback(() => {
    if (submitting) return
    setPending(null)
    setError(null)
    setSuggestions([])
  }, [submitting])

  return (
    <>
      {dragDepth > 0 ? (
        <div className="pointer-events-none fixed inset-0 z-[60] flex items-center justify-center bg-background/60 backdrop-blur-[2px]">
          <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-primary/60 bg-card px-10 py-8 text-center shadow-lg">
            <FolderUp className="h-10 w-10 text-primary" />
            <p className="text-sm font-medium">松开以添加项目</p>
            <p className="text-xs text-muted-foreground">把文件夹拖进来，可以直接打开并开始对话</p>
          </div>
        </div>
      ) : null}

      {notice ? (
        <div className="pointer-events-none fixed left-1/2 top-4 z-[70] -translate-x-1/2 rounded-full border border-border bg-card px-4 py-2 text-xs text-muted-foreground shadow-md">
          {notice}
        </div>
      ) : null}

      <Dialog open={Boolean(pending)} onOpenChange={(open) => { if (!open) close() }}>
        <DialogContent size="sm" className="overflow-hidden rounded-2xl p-0">
          <div className="border-b border-border bg-gradient-to-b from-muted/50 to-transparent px-6 pb-5 pt-6">
            <div className="flex items-center gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <FolderPlus className="size-5" />
              </div>
              <div className="min-w-0">
                <DialogTitle className="text-base">添加项目</DialogTitle>
                <DialogDescription className="text-xs">
                  自定义显示名称会固定在侧边栏（不会被仓库名覆盖），路径保持不变。
                </DialogDescription>
              </div>
            </div>
          </div>
          <DialogBody className="space-y-4 px-6 py-5">
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">显示名称</label>
              <div className="relative">
                <PencilLine className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="项目名称"
                  className="pl-9"
                  autoFocus
                  disabled={submitting}
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">文件夹路径</label>
              <div className="relative">
                <FolderOpen className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={path}
                  onChange={(event) => setPath(event.target.value)}
                  placeholder="例如 C:\Users\me\Desktop\MyProject"
                  className={cn("pl-9 pr-9 font-mono text-xs", pathStatus === "error" && "border-destructive/60 focus-visible:ring-destructive/30")}
                  disabled={submitting}
                />
                <div className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center">
                  {pathStatus === "checking" ? (
                    <LoaderCircle className="size-4 animate-spin text-muted-foreground" />
                  ) : pathStatus === "ok" ? (
                    <Check className="size-4 text-emerald-600 dark:text-emerald-400" />
                  ) : pathStatus === "error" ? (
                    <TriangleAlert className="size-4 text-destructive" />
                  ) : null}
                </div>
              </div>
              {pending?.notice ? (
                <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                  {pending.notice}
                </p>
              ) : null}
              {suggestions.length > 0 ? (
                <div className="flex flex-col gap-1">
                  <p className="text-xs text-muted-foreground">还找到这些同名文件夹，点一下可切换：</p>
                  {suggestions.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      onClick={() => {
                        setPath(suggestion)
                        setLookupName(null)
                        setSuggestions([])
                        setError(null)
                      }}
                      className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2 text-left text-xs text-foreground transition-colors hover:bg-muted"
                    >
                      <FolderOpen className="size-3.5 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate">{suggestion}</span>
                      <span className="shrink-0 text-primary">使用</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            {error ? (
              <p className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                {error}
              </p>
            ) : null}
          </DialogBody>
          <DialogFooter className="border-t border-border px-6 py-4">
            <Button variant="ghost" onClick={close} disabled={submitting}>
              取消
            </Button>
            <Button onClick={() => void confirmAdd()} disabled={submitting || pathStatus === "checking" || !path.trim()}>
              {submitting ? "添加中…" : "添加并打开"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
