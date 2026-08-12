import { ChevronDown, ChevronRight, File, Folder, FolderOpen, Hammer, Loader2, Save, X } from "lucide-react"
import { useCallback, useEffect, useState, type ReactNode } from "react"
import { detectLanguage } from "../../lib/highlight"
import { FileTypeIcon } from "../../lib/fileIcons"
import { cn } from "../../lib/utils"
import {
  compileProject,
  isProbablyTextFile,
  listProjectTree,
  readProjectFileText,
  type CompileResult,
  type ProjectTreeEntry,
  writeProjectFile,
} from "../../lib/projectFiles"
import { Button } from "../ui/button"
import { ScrollArea } from "../ui/scroll-area"
import { CodeEditor } from "./CodeEditor"

function TreeRow({
  entry,
  depth,
  expanded,
  selected,
  onToggleDir,
  onOpenFile,
}: {
  entry: ProjectTreeEntry
  depth: number
  expanded: boolean
  selected: boolean
  onToggleDir: (entry: ProjectTreeEntry) => void
  onOpenFile: (entry: ProjectTreeEntry) => void
}) {
  const isDir = entry.type === "dir"
  return (
    <button
      type="button"
      onClick={() => (isDir ? onToggleDir(entry) : onOpenFile(entry))}
      aria-current={selected ? "true" : undefined}
      className={cn(
        "flex w-full items-center gap-1.5 border-l-2 py-1 pr-2 text-left text-[13px] leading-tight transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        selected
          ? "border-logo bg-logo/10 font-medium text-foreground"
          : "border-transparent text-foreground/90 hover:bg-muted/50",
      )}
      style={{ paddingLeft: `${6 + depth * 14}px` }}
    >
      {isDir ? (
        expanded ? <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
      ) : (
        <span className="w-3 shrink-0" />
      )}
      {isDir ? (
        expanded ? (
          <FolderOpen className="h-3.5 w-3.5 shrink-0 text-amber-500/90" />
        ) : (
          <Folder className="h-3.5 w-3.5 shrink-0 text-amber-500/90" />
        )
      ) : (
        <span className={cn("shrink-0", selected ? "opacity-100" : "opacity-90")}>
          <FileTypeIcon
            fileName={entry.name}
            fallback={<File className={cn("h-3.5 w-3.5", selected ? "text-foreground/80" : "text-muted-foreground")} />}
          />
        </span>
      )}
      <span className={cn("min-w-0 truncate", selected && "text-foreground")}>{entry.name}</span>
    </button>
  )
}

export function FilesPanel({
  projectId,
  onClose,
}: {
  projectId: string
  onClose: () => void
}) {
  const [rootEntries, setRootEntries] = useState<ProjectTreeEntry[] | null>(null)
  const [dirCache, setDirCache] = useState<Record<string, ProjectTreeEntry[]>>({})
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set())
  const [openFile, setOpenFile] = useState<string | null>(null)
  const [fileContent, setFileContent] = useState<string | null>(null)
  const [fileTruncated, setFileTruncated] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [loadingFile, setLoadingFile] = useState(false)
  const [treeError, setTreeError] = useState<string | null>(null)
  const [compileState, setCompileState] = useState<{ running: boolean; result: CompileResult | null }>({ running: false, result: null })

  const loadDir = useCallback(async (dir: string) => {
    try {
      const entries = await listProjectTree(projectId, dir)
      setDirCache((current) => ({ ...current, [dir]: entries }))
      if (dir === "") setRootEntries(entries)
      setTreeError(null)
    } catch (error) {
      setTreeError(error instanceof Error ? error.message : String(error))
    }
  }, [projectId])

  useEffect(() => {
    void loadDir("")
  }, [loadDir])

  const toggleDir = useCallback((entry: ProjectTreeEntry) => {
    const dir = entry.path
    setExpandedDirs((current) => {
      const next = new Set(current)
      if (next.has(dir)) {
        next.delete(dir)
      } else {
        next.add(dir)
        if (!dirCache[dir]) {
          void loadDir(dir)
        }
      }
      return next
    })
  }, [dirCache, loadDir])

  const openFileEntry = useCallback(async (entry: ProjectTreeEntry) => {
    if (!isProbablyTextFile(entry.path)) {
      setOpenFile(entry.path)
      setFileContent(null)
      setDirty(false)
      return
    }
    setOpenFile(entry.path)
    setLoadingFile(true)
    setFileContent(null)
    setDirty(false)
    try {
      const { text } = await readProjectFileText(projectId, entry.path)
      setFileContent(text)
      setFileTruncated(false)
    } catch (error) {
      setFileContent(`# 无法读取文件\n\n${error instanceof Error ? error.message : String(error)}`)
      setFileTruncated(false)
    } finally {
      setLoadingFile(false)
    }
  }, [projectId])

  const saveFile = useCallback(async () => {
    if (!openFile || fileContent === null || !dirty) return
    setSaving(true)
    try {
      await writeProjectFile(projectId, openFile, fileContent)
      setDirty(false)
    } catch (error) {
      alert(error instanceof Error ? error.message : String(error))
    } finally {
      setSaving(false)
    }
  }, [dirty, fileContent, openFile, projectId])

  const runCompile = useCallback(async () => {
    setCompileState({ running: true, result: null })
    try {
      const result = await compileProject(projectId)
      setCompileState({ running: false, result })
    } catch (error) {
      setCompileState({
        running: false,
        result: {
          ok: false,
          exitCode: -1,
          command: "compile",
          output: error instanceof Error ? error.message : String(error),
          durationMs: 0,
        },
      })
    }
  }, [projectId])

  // Cmd/Ctrl+S 保存当前打开的文件
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault()
        void saveFile()
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [saveFile])

  const renderTree = (entries: ProjectTreeEntry[], depth: number): ReactNode[] =>
    entries.map((entry) => {
      const isDir = entry.type === "dir"
      const expanded = isDir && expandedDirs.has(entry.path)
      const rows: ReactNode[] = [
        <TreeRow
          key={entry.path}
          entry={entry}
          depth={depth}
          expanded={expanded}
          selected={openFile === entry.path}
          onToggleDir={toggleDir}
          onOpenFile={(item) => void openFileEntry(item)}
        />,
      ]
      if (isDir && expanded) {
        if (dirCache[entry.path]) {
          rows.push(...renderTree(dirCache[entry.path]!, depth + 1))
        } else {
          rows.push(
            <div key={`${entry.path}:loading`} className="flex items-center gap-2 py-1 pl-9 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> 加载…
            </div>,
          )
        }
      }
      return rows
    })

  const openFileName = openFile?.split("/").at(-1) ?? null
  const openFileDir = openFile?.split("/").slice(0, -1).join("/")
  const openFileLanguage = openFile ? detectLanguage(openFile) : null

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <h2 className="text-sm font-semibold">文件</h2>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 px-2 text-xs"
            onClick={() => void runCompile()}
            disabled={compileState.running}
          >
            {compileState.running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Hammer className="h-3.5 w-3.5" />}
            编译
          </Button>
          <Button variant="ghost" size="sm" className="h-7 px-2" onClick={onClose} aria-label="关闭文件面板">
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {treeError ? <div className="px-3 py-2 text-xs text-destructive">{treeError}</div> : null}

      <ScrollArea className="min-h-0 flex-1">
        <div className="py-1">
          {rootEntries === null ? (
            <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> 加载项目文件…
            </div>
          ) : (
            renderTree(rootEntries, 0)
          )}
        </div>
      </ScrollArea>

      {openFile ? (
        <div className="flex min-h-0 flex-1 flex-col border-t border-border">
          <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-1.5">
            <div className="flex min-w-0 items-center gap-2">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-logo" aria-hidden="true" />
              <span className="min-w-0 truncate font-mono text-xs" title={openFile}>
                {openFileDir ? <span className="text-muted-foreground">{openFileDir}/</span> : null}
                <span className="font-medium text-foreground">{openFileName}</span>
              </span>
              {openFileLanguage ? (
                <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                  {openFileLanguage.name}
                </span>
              ) : null}
            </div>
            {dirty ? (
              <Button variant="default" size="sm" className="h-6 gap-1 px-2 text-xs" onClick={() => void saveFile()} disabled={saving}>
                {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                保存
              </Button>
            ) : null}
          </div>
          {loadingFile ? (
            <div className="flex items-center gap-2 px-3 py-3 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> 读取文件…
            </div>
          ) : fileContent === null ? (
            <div className="px-3 py-3 text-xs text-muted-foreground">
              二进制或不可编辑文件，请用外部编辑器打开。
            </div>
          ) : (
            <CodeEditor
              value={fileContent}
              onChange={(next) => {
                setFileContent(next)
                setDirty(true)
              }}
              fileName={openFile}
            />
          )}
          {fileTruncated ? <div className="border-t border-border px-3 py-1 text-xs text-amber-500">文件过大，仅展示前 5MB</div> : null}
        </div>
      ) : (
        <div className="border-t border-border px-3 py-3 text-xs text-muted-foreground">
          点击文件查看/编辑内容；修改后点保存写回磁盘。
        </div>
      )}

      {compileState.result ? (
        <div className={cn("max-h-40 overflow-y-auto border-t border-border px-3 py-2 font-mono text-[11px] leading-relaxed", compileState.result.ok ? "text-muted-foreground" : "text-destructive")}>
          <div className="mb-1 flex items-center gap-2">
            <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-semibold", compileState.result.ok ? "bg-emerald-500/10 text-emerald-500" : "bg-destructive/10 text-destructive")}>
              {compileState.result.ok ? "通过" : "失败"}
            </span>
            <span>{compileState.result.command}</span>
            <span className="ml-auto">{compileState.result.durationMs}ms</span>
          </div>
          <pre className="whitespace-pre-wrap break-words">{compileState.result.output || "（无输出）"}</pre>
        </div>
      ) : null}
    </div>
  )
}
