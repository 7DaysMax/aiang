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
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "../ui/resizable"
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
        "group flex h-[22px] w-full items-center gap-1 pr-2 text-left text-[12px] leading-none transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
        selected
          ? "bg-foreground/10 text-foreground"
          : "text-foreground/85 hover:bg-muted/60",
      )}
      style={{ paddingLeft: `${8 + depth * 12}px` }}
    >
      {isDir ? (
        expanded ? (
          <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground/80" />
        ) : (
          <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground/80" />
        )
      ) : (
        <span className="w-3 shrink-0" />
      )}
      {isDir ? (
        expanded ? (
          <FolderOpen className="h-3.5 w-3.5 shrink-0 text-sky-400/90" />
        ) : (
          <Folder className="h-3.5 w-3.5 shrink-0 text-sky-400/90" />
        )
      ) : (
        <FileTypeIcon
          fileName={entry.name}
          fallback={<File className="h-3.5 w-3.5 text-muted-foreground" />}
        />
      )}
      <span className="min-w-0 truncate">{entry.name}</span>
    </button>
  )
}

function FileTreePane({
  rootEntries,
  dirCache,
  expandedDirs,
  openFile,
  onToggleDir,
  onOpenFile,
}: {
  rootEntries: ProjectTreeEntry[] | null
  dirCache: Record<string, ProjectTreeEntry[]>
  expandedDirs: Set<string>
  openFile: string | null
  onToggleDir: (entry: ProjectTreeEntry) => void
  onOpenFile: (entry: ProjectTreeEntry) => void
}) {
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
          onToggleDir={onToggleDir}
          onOpenFile={onOpenFile}
        />,
      ]
      if (isDir && expanded) {
        if (dirCache[entry.path]) {
          rows.push(...renderTree(dirCache[entry.path]!, depth + 1))
        } else {
          rows.push(
            <div
              key={`${entry.path}:loading`}
              className="flex h-[22px] items-center gap-1.5 text-[11px] text-muted-foreground"
              style={{ paddingLeft: `${8 + (depth + 1) * 12 + 16}px` }}
            >
              <Loader2 className="h-3 w-3 animate-spin" /> 加载…
            </div>,
          )
        }
      }
      return rows
    })

  return (
    <ScrollArea className="h-full min-h-0">
      <div className="py-1">
        {rootEntries === null ? (
          <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> 加载项目文件…
          </div>
        ) : rootEntries.length === 0 ? (
          <div className="px-3 py-2 text-xs text-muted-foreground">空目录</div>
        ) : (
          renderTree(rootEntries, 0)
        )}
      </div>
    </ScrollArea>
  )
}

function EditorPane({
  openFile,
  fileContent,
  fileTruncated,
  loadingFile,
  dirty,
  saving,
  onChange,
  onSave,
}: {
  openFile: string
  fileContent: string | null
  fileTruncated: boolean
  loadingFile: boolean
  dirty: boolean
  saving: boolean
  onChange: (next: string) => void
  onSave: () => void
}) {
  const openFileName = openFile.split("/").at(-1) ?? openFile
  const openFileDir = openFile.split("/").slice(0, -1).join("/")
  const openFileLanguage = detectLanguage(openFile)

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex h-8 shrink-0 items-center gap-2 border-b border-border px-2">
        <FileTypeIcon
          fileName={openFileName}
          fallback={<File className="h-3.5 w-3.5 text-muted-foreground" />}
        />
        <div className="min-w-0 flex-1 truncate font-mono text-[11px]" title={openFile}>
          {openFileDir ? <span className="text-muted-foreground">{openFileDir}/</span> : null}
          <span className={cn("text-foreground", dirty && "after:ml-0.5 after:text-foreground after:content-['•']")}>
            {openFileName}
          </span>
        </div>
        {openFileLanguage ? (
          <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground/80">
            {openFileLanguage.name}
          </span>
        ) : null}
        {dirty && !fileTruncated ? (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 gap-1 px-1.5 text-[11px]"
            onClick={onSave}
            disabled={saving}
          >
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
        <div className="min-h-0 flex-1">
          <CodeEditor value={fileContent} onChange={onChange} fileName={openFile} />
        </div>
      )}

      {fileTruncated ? (
        <div className="shrink-0 border-t border-border px-3 py-1 text-[11px] text-amber-500">
          文件过大，仅展示前 5MB；为避免截断内容覆盖原文件，此处不可保存
        </div>
      ) : null}
    </div>
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
  const [compileState, setCompileState] = useState<{ running: boolean; result: CompileResult | null }>({
    running: false,
    result: null,
  })

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
      const { text, truncated } = await readProjectFileText(projectId, entry.path)
      setFileContent(text)
      setFileTruncated(truncated)
    } catch (error) {
      setFileContent(`# 无法读取文件\n\n${error instanceof Error ? error.message : String(error)}`)
      setFileTruncated(false)
    } finally {
      setLoadingFile(false)
    }
  }, [projectId])

  const saveFile = useCallback(async () => {
    // 截断的内容只是文件的前一段，写回去等于把剩下的部分删掉。
    if (!openFile || fileContent === null || !dirty || fileTruncated) return
    setSaving(true)
    try {
      await writeProjectFile(projectId, openFile, fileContent)
      setDirty(false)
    } catch (error) {
      alert(error instanceof Error ? error.message : String(error))
    } finally {
      setSaving(false)
    }
  }, [dirty, fileContent, fileTruncated, openFile, projectId])

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

  const treePane = (
    <FileTreePane
      rootEntries={rootEntries}
      dirCache={dirCache}
      expandedDirs={expandedDirs}
      openFile={openFile}
      onToggleDir={toggleDir}
      onOpenFile={(item) => void openFileEntry(item)}
    />
  )

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-border px-2">
        <h2 className="px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          资源管理器
        </h2>
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 px-1.5 text-[11px] text-muted-foreground"
            onClick={() => void runCompile()}
            disabled={compileState.running}
          >
            {compileState.running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Hammer className="h-3.5 w-3.5" />}
            编译
          </Button>
          <Button variant="ghost" size="sm" className="h-7 px-1.5" onClick={onClose} aria-label="关闭文件面板">
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {treeError ? <div className="px-3 py-2 text-xs text-destructive">{treeError}</div> : null}

      <div className="min-h-0 flex-1">
        {openFile ? (
          <ResizablePanelGroup orientation="horizontal" className="h-full">
            <ResizablePanel id="files-tree" defaultSize="28%" minSize="16%" maxSize="50%" className="min-w-[140px]">
              {treePane}
            </ResizablePanel>
            <ResizableHandle orientation="horizontal" withHandle />
            <ResizablePanel id="files-editor" defaultSize="72%" minSize="30%">
              <EditorPane
                openFile={openFile}
                fileContent={fileContent}
                fileTruncated={fileTruncated}
                loadingFile={loadingFile}
                dirty={dirty}
                saving={saving}
                onChange={(next) => {
                  setFileContent(next)
                  setDirty(true)
                }}
                onSave={() => void saveFile()}
              />
            </ResizablePanel>
          </ResizablePanelGroup>
        ) : (
          <div className="flex h-full min-h-0 flex-col">
            <div className="min-h-0 flex-1">{treePane}</div>
            <div className="shrink-0 border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
              选择文件以在右侧打开编辑
            </div>
          </div>
        )}
      </div>

      {compileState.result ? (
        <div
          className={cn(
            "max-h-36 shrink-0 overflow-y-auto border-t border-border px-3 py-2 font-mono text-[11px] leading-relaxed",
            compileState.result.ok ? "text-muted-foreground" : "text-destructive",
          )}
        >
          <div className="mb-1 flex items-center gap-2">
            <span
              className={cn(
                "rounded px-1.5 py-0.5 text-[10px] font-semibold",
                compileState.result.ok ? "bg-emerald-500/10 text-emerald-500" : "bg-destructive/10 text-destructive",
              )}
            >
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
