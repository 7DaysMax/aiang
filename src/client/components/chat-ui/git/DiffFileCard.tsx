import { PatchDiff, Virtualizer } from "@pierre/diffs/react"
import { Ban, ChevronDown, ChevronUp, Code, Copy, Ellipsis, FolderOpen, LoaderCircle, Trash2 } from "lucide-react"
import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react"
import type { ChatAttachment } from "../../../../shared/types"
import { cn } from "../../../lib/utils"
import { AttachmentFileCard, AttachmentImageCard } from "../../messages/AttachmentCard"
import { AttachmentPreviewModal } from "../../messages/AttachmentPreviewModal"
import { classifyAttachmentPreview } from "../../messages/attachmentPreview"
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from "../../ui/context-menu"
import { DiffFileStat, StageCheckbox, type DiffFile, type DiffRenderMode } from "./shared"

/** Past this many patch lines, skip word-level highlight — it freezes the sidebar. */
const WORD_DIFF_LINE_BUDGET = 400
/** Soft height for expanded patch so one giant file can't own the whole panel. */
const DIFF_MAX_HEIGHT_PX = 520

export function shouldLoadDiffPatchNow(args: {
  isCollapsed: boolean
  hasPreviewAttachment: boolean
  patch?: string
  patchError?: string
  isPatchLoading: boolean
}) {
  return !args.isCollapsed
    && !args.hasPreviewAttachment
    && args.patch === undefined
    && args.patchError === undefined
    && !args.isPatchLoading
}

function countPatchLines(patch: string | undefined): number {
  if (!patch) return 0
  let n = 0
  for (let i = 0; i < patch.length; i++) {
    if (patch.charCodeAt(i) === 10) n++
  }
  return n + (patch.length > 0 ? 1 : 0)
}

function getDiffPreviewAttachment(projectId: string | null, file: DiffFile): ChatAttachment | null {
  if (!projectId || !file.mimeType || typeof file.size !== "number" || file.changeType === "deleted") {
    return null
  }

  if (!file.mimeType.startsWith("image/") && file.mimeType !== "application/pdf") {
    return null
  }

  return {
    id: `diff:${file.path}`,
    kind: file.mimeType.startsWith("image/") ? "image" : "file",
    displayName: file.path.split("/").pop() ?? file.path,
    absolutePath: file.path,
    relativePath: file.path,
    contentUrl: `/api/projects/${projectId}/files/${encodeURIComponent(file.path)}/content`,
    mimeType: file.mimeType,
    size: file.size,
  }
}

export interface DiffFileActions {
  onOpenFile: (path: string) => void
  onOpenInFinder: (path: string) => void
  onDiscardFile: (path: string) => void
  onIgnoreFile: (path: string) => void
  onIgnoreFolder: (path: string) => void
  onCopyFilePath: (path: string) => void
  onCopyRelativePath: (path: string) => void
}

export function canIgnoreDiffFile(file: DiffFile) {
  // New files are ignorable whether they are untracked or already staged (the
  // server unstages staged new files before adding the .gitignore entry).
  // Tracked files stay disabled: .gitignore has no effect on tracked files.
  return file.isUntracked || file.changeType === "added"
}

export function canIgnoreDiffFolder(file: DiffFile) {
  if (!canIgnoreDiffFile(file)) {
    return false
  }
  return file.path.includes("/")
}

function fileName(path: string): string {
  const parts = path.split("/")
  return parts[parts.length - 1] || path
}

function fileDir(path: string): string | null {
  const idx = path.lastIndexOf("/")
  if (idx <= 0) return null
  return path.slice(0, idx)
}

export function DiffFileCard({
  file,
  projectId,
  isCollapsed,
  isChecked,
  editorLabel,
  diffRenderMode,
  wrapLines,
  onToggleCollapsed,
  onToggleChecked,
  fileActions,
  patch,
  patchError,
  isPatchLoading,
  onLoadPatch,
}: {
  file: DiffFile
  projectId: string | null
  isCollapsed: boolean
  isChecked: boolean
  editorLabel: string
  diffRenderMode: DiffRenderMode
  wrapLines: boolean
  onToggleCollapsed: () => void
  onToggleChecked: () => void
  fileActions: DiffFileActions
  patch?: string
  patchError?: string
  isPatchLoading: boolean
  onLoadPatch: (path: string) => Promise<string>
}) {
  const canIgnore = canIgnoreDiffFile(file)
  const canIgnoreFolder = canIgnoreDiffFolder(file)
  const [selectedAttachmentId, setSelectedAttachmentId] = useState<string | null>(null)
  const cardRef = useRef<HTMLDivElement | null>(null)
  const autoLoadPatchKeyRef = useRef<string | null>(null)
  const previewAttachment = useMemo(() => getDiffPreviewAttachment(projectId, file), [file, projectId])
  const hasPreviewAttachment = previewAttachment !== null
  const shouldLoadPatchWhenVisible = shouldLoadDiffPatchNow({
    isCollapsed,
    hasPreviewAttachment,
    patch,
    patchError,
    isPatchLoading,
  })

  const patchLineCount = useMemo(() => countPatchLines(patch), [patch])
  // Word-level highlight is beautiful on small hunks and a freeze on 1k-line files.
  const lineDiffType = patchLineCount > WORD_DIFF_LINE_BUDGET ? "none" : "char"
  const dir = fileDir(file.path)

  useEffect(() => {
    if (!shouldLoadPatchWhenVisible) {
      return
    }

    const autoLoadKey = `${file.path}\u0000${file.patchDigest}`
    if (autoLoadPatchKeyRef.current === autoLoadKey) {
      return
    }

    autoLoadPatchKeyRef.current = autoLoadKey
    void onLoadPatch(file.path).catch(() => {})
  }, [file.patchDigest, file.path, onLoadPatch, shouldLoadPatchWhenVisible])

  function handleAttachmentClick(attachment: ChatAttachment) {
    const target = classifyAttachmentPreview(attachment)
    if (target.openInNewTab) {
      if (typeof window !== "undefined") {
        window.open(new URL(attachment.contentUrl, window.location.origin).toString(), "_blank", "noopener,noreferrer")
      }
      return
    }
    setSelectedAttachmentId(attachment.id)
  }

  function openContextMenuFromButton(event: ReactMouseEvent<HTMLButtonElement>) {
    event.preventDefault()
    event.stopPropagation()
    const rect = event.currentTarget.getBoundingClientRect()
    cardRef.current?.dispatchEvent(new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      clientX: rect.left + rect.width / 2,
      clientY: rect.bottom,
      view: window,
    }))
  }

  function handleToggleRequest() {
    if (!isCollapsed) {
      onToggleCollapsed()
      return
    }

    if (hasPreviewAttachment || patch !== undefined) {
      onToggleCollapsed()
      return
    }

    if (isPatchLoading) {
      return
    }

    const shouldLoadBeforeExpand = patchError !== undefined || shouldLoadDiffPatchNow({
      isCollapsed: false,
      hasPreviewAttachment,
      patch,
      patchError,
      isPatchLoading,
    })
    if (!shouldLoadBeforeExpand) {
      onToggleCollapsed()
      return
    }

    void onLoadPatch(file.path).then(() => {
      onToggleCollapsed()
    }).catch(() => {})
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          ref={cardRef}
          key={file.path}
          className={cn(
            "relative overflow-hidden border-b border-border/40 bg-background transition-colors",
            !isCollapsed && "bg-card/40",
          )}
        >
          <div
            role="button"
            tabIndex={0}
            onClick={handleToggleRequest}
            onKeyDown={(event) => {
              if (event.key !== "Enter" && event.key !== " ") return
              event.preventDefault()
              handleToggleRequest()
            }}
            className={cn(
              "group/header sticky top-0 z-20 flex cursor-pointer items-center justify-between gap-3 px-3 py-2 text-[13px] text-zinc-600 transition-colors dark:text-muted-foreground",
              "hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-accent/70 dark:hover:text-foreground",
              !isCollapsed && "border-b border-border/50 bg-zinc-50/95 backdrop-blur-sm dark:bg-background/95",
            )}
          >
            <div className="flex min-w-0 items-center gap-1">
              <StageCheckbox
                checked={isChecked}
                onClick={onToggleChecked}
              />
              <div className="min-w-0 pl-1.5">
                <div className="truncate select-none font-medium leading-tight text-zinc-900 dark:text-foreground">
                  {fileName(file.path)}
                </div>
                {dir ? (
                  <div className="truncate select-none font-mono text-[10.5px] leading-tight text-zinc-500 dark:text-muted-foreground/70">
                    {dir}
                  </div>
                ) : null}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1.5 select-none">
              <DiffFileStat additions={file.additions} deletions={file.deletions} />
              <button
                type="button"
                aria-label={`Open actions for ${file.path}`}
                onClick={openContextMenuFromButton}
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-all hover:bg-accent hover:text-foreground group-hover/header:opacity-100"
              >
                <Ellipsis className="h-3.5 w-3.5 shrink-0" />
              </button>
              <span className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground/80">
                {isPatchLoading && isCollapsed && !previewAttachment ? (
                  <LoaderCircle className="h-3.5 w-3.5 shrink-0 animate-spin" />
                ) : isCollapsed ? (
                  <ChevronDown className="h-3.5 w-3.5 shrink-0 transition-transform" />
                ) : (
                  <ChevronUp className="h-3.5 w-3.5 shrink-0 transition-transform" />
                )}
              </span>
            </div>
          </div>
          {!isCollapsed ? (
            <div className="kanna-diff-patch overflow-hidden">
              {previewAttachment ? (
                <div className="flex justify-center p-3">
                  {previewAttachment.kind === "image" ? (
                    <AttachmentImageCard
                      attachment={previewAttachment}
                      onClick={() => handleAttachmentClick(previewAttachment)}
                    />
                  ) : (
                    <AttachmentFileCard
                      attachment={previewAttachment}
                      onClick={() => handleAttachmentClick(previewAttachment)}
                    />
                  )}
                </div>
              ) : (
                isPatchLoading ? (
                  <div className="flex items-center justify-center gap-2 px-3 py-10 text-sm text-muted-foreground">
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                    加载差异…
                  </div>
                ) : patchError ? (
                  <div className="px-4 py-5 text-sm text-destructive">{patchError}</div>
                ) : patch !== undefined ? (
                  <Virtualizer
                    style={{ maxHeight: DIFF_MAX_HEIGHT_PX }}
                    className="overflow-auto"
                  >
                    <PatchDiff
                      patch={patch}
                      options={{
                        diffStyle: diffRenderMode,
                        disableFileHeader: true,
                        disableBackground: false,
                        overflow: wrapLines ? "wrap" : "scroll",
                        lineDiffType,
                        // Collapse long unchanged runs so large files stay scannable
                        collapsedContextThreshold: 3,
                        diffIndicators: "classic",
                        // Follow app light/dark so syntax tokens stay readable on white
                        themeType: "system",
                      }}
                    />
                  </Virtualizer>
                ) : (
                  <div className="px-4 py-5 text-sm text-muted-foreground">差异不可用</div>
                )
              )}
            </div>
          ) : null}
          <AttachmentPreviewModal
            attachment={previewAttachment && selectedAttachmentId === previewAttachment.id ? previewAttachment : null}
            onOpenChange={(open) => !open && setSelectedAttachmentId(null)}
          />
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem
          onSelect={(event) => {
            event.stopPropagation()
            fileActions.onOpenFile(file.path)
          }}
        >
          <Code className="h-3.5 w-3.5" />
          <span className="text-xs font-medium">在 {editorLabel} 中打开</span>
        </ContextMenuItem>
        <ContextMenuItem
          onSelect={(event) => {
            event.stopPropagation()
            fileActions.onOpenInFinder(file.path)
          }}
        >
          <FolderOpen className="h-3.5 w-3.5" />
          <span className="text-xs font-medium">在 Finder 中显示</span>
        </ContextMenuItem>
        <ContextMenuItem
          onSelect={(event) => {
            event.stopPropagation()
            fileActions.onDiscardFile(file.path)
          }}
          className="text-destructive dark:text-red-400 hover:bg-destructive/10 focus:bg-destructive/10 dark:hover:bg-red-500/20 dark:focus:bg-red-500/20"
        >
          <Trash2 className="h-3.5 w-3.5" />
          <span className="text-xs font-medium">撤销改动</span>
        </ContextMenuItem>
        <ContextMenuItem
          disabled={!canIgnore}
          onSelect={(event) => {
            event.stopPropagation()
            if (!canIgnore) return
            fileActions.onIgnoreFile(file.path)
          }}
        >
          <Ban className="h-3.5 w-3.5" />
          <span className="text-xs font-medium">忽略此文件</span>
        </ContextMenuItem>
        <ContextMenuItem
          disabled={!canIgnoreFolder}
          onSelect={(event) => {
            event.stopPropagation()
            if (!canIgnoreFolder) return
            fileActions.onIgnoreFolder(file.path)
          }}
        >
          <Ban className="h-3.5 w-3.5" />
          <span className="text-xs font-medium">忽略所在文件夹…</span>
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          onSelect={(event) => {
            event.stopPropagation()
            fileActions.onCopyFilePath(file.path)
          }}
        >
          <Copy className="h-3.5 w-3.5" />
          <span className="text-xs font-medium">复制绝对路径</span>
        </ContextMenuItem>
        <ContextMenuItem
          onSelect={(event) => {
            event.stopPropagation()
            fileActions.onCopyRelativePath(file.path)
          }}
        >
          <Copy className="h-3.5 w-3.5" />
          <span className="text-xs font-medium">复制相对路径</span>
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}
