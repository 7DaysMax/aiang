import { memo, useMemo, useState } from "react"
import {
  ChevronDown,
  FileMinus2,
  FilePenLine,
  FilePlus2,
  FileSearch,
  RotateCcw,
} from "lucide-react"
import type { ChatDiffFile } from "../../../shared/types"
import { Button } from "../ui/button"
import { cn } from "../../lib/utils"

export interface ChangesSummaryActions {
  /** 点文件行：在编辑器里打开文件。 */
  onOpenFile: (path: string) => void
  /** 撤销单个文件的改动（不依赖 git，快照模式同样可用）。 */
  onDiscardFile: (path: string) => void
  /** 撤销全部改动（调用方负责确认）。 */
  onDiscardAll: () => void
  /** 审核：打开右侧「改动」面板查看完整 diff。 */
  onReview: () => void
}

const MAX_VISIBLE_FILES = 8

const CHANGE_TYPE_META: Record<
  ChatDiffFile["changeType"],
  { label: string; Icon: typeof FilePlus2; className: string; chip: string }
> = {
  added: {
    label: "新增",
    Icon: FilePlus2,
    className: "text-emerald-600 dark:text-emerald-400",
    chip: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  },
  modified: {
    label: "修改",
    Icon: FilePenLine,
    className: "text-sky-600 dark:text-sky-400",
    chip: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
  },
  deleted: {
    label: "删除",
    Icon: FileMinus2,
    className: "text-red-600 dark:text-red-400",
    chip: "bg-red-500/10 text-red-700 dark:text-red-300",
  },
  renamed: {
    label: "重命名",
    Icon: FileSearch,
    className: "text-violet-600 dark:text-violet-400",
    chip: "bg-violet-500/10 text-violet-700 dark:text-violet-300",
  },
}

function formatStat(count: number): string {
  return count.toLocaleString()
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

export const ChangesSummaryCard = memo(function ChangesSummaryCard({
  files,
  actions,
}: {
  files: ChatDiffFile[]
  actions: ChangesSummaryActions
}) {
  const [expanded, setExpanded] = useState(false)

  const totals = useMemo(() => {
    let additions = 0
    let deletions = 0
    const byType = { added: 0, deleted: 0, modified: 0, renamed: 0 }
    for (const file of files) {
      additions += file.additions ?? 0
      deletions += file.deletions ?? 0
      byType[file.changeType] += 1
    }
    return { additions, deletions, byType }
  }, [files])

  const visibleFiles = expanded ? files : files.slice(0, MAX_VISIBLE_FILES)
  const remaining = files.length - visibleFiles.length

  return (
    <div className="my-1 overflow-hidden rounded-2xl border border-border bg-white text-zinc-900 shadow-sm dark:border-border/80 dark:bg-card/90 dark:text-foreground dark:shadow-[0_1px_0_rgba(255,255,255,0.04)]">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 px-3.5 pt-3 pb-2.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-muted/80">
            <FilePenLine className="size-3.5 text-foreground/70" />
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-medium tracking-tight text-foreground">
              改动摘要
            </div>
            <div className="truncate text-[11px] text-muted-foreground">
              <span className="tabular-nums">{files.length}</span> 个文件
              {totals.byType.added > 0 && (
                <span className="ml-1.5 text-emerald-600/90 dark:text-emerald-400/90">
                  · {totals.byType.added} 新增
                </span>
              )}
              {totals.byType.modified > 0 && (
                <span className="ml-1 text-sky-600/90 dark:text-sky-400/90">
                  · {totals.byType.modified} 修改
                </span>
              )}
              {totals.byType.deleted > 0 && (
                <span className="ml-1 text-red-600/90 dark:text-red-400/90">
                  · {totals.byType.deleted} 删除
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2 rounded-full bg-muted/50 px-2.5 py-1 font-mono text-[11px] tabular-nums">
          <span className="text-emerald-600 dark:text-emerald-400">+{formatStat(totals.additions)}</span>
          <span className="text-muted-foreground/40">·</span>
          <span className="text-red-600 dark:text-red-400">−{formatStat(totals.deletions)}</span>
        </div>
      </div>

      {/* File list */}
      <div className="border-t border-border/50">
        {visibleFiles.map((file) => {
          const meta = CHANGE_TYPE_META[file.changeType]
          const Icon = meta.Icon
          const dir = fileDir(file.path)
          return (
            <div
              key={file.path}
              role="button"
              tabIndex={0}
              onClick={() => actions.onOpenFile(file.path)}
              onKeyDown={(event) => {
                if (event.key !== "Enter" && event.key !== " ") return
                event.preventDefault()
                actions.onOpenFile(file.path)
              }}
              className="group flex cursor-pointer items-center gap-2.5 px-3.5 py-2 text-[13px] transition-colors hover:bg-accent/50"
            >
              <span
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-md",
                  meta.chip,
                )}
                title={meta.label}
              >
                <Icon className="size-3.5" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium leading-tight text-zinc-900 dark:text-foreground">
                  {fileName(file.path)}
                </div>
                {dir ? (
                  <div className="truncate font-mono text-[10.5px] leading-tight text-zinc-500 dark:text-muted-foreground/70">
                    {dir}
                  </div>
                ) : null}
              </div>
              <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
                <span className="text-emerald-600 dark:text-emerald-400">+{formatStat(file.additions ?? 0)}</span>
                {" "}
                <span className="text-red-600 dark:text-red-400">−{formatStat(file.deletions ?? 0)}</span>
              </span>
              <Button
                variant="ghost"
                size="icon-sm"
                className="size-7 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
                title={`撤销 ${file.path} 的改动`}
                aria-label={`撤销 ${file.path} 的改动`}
                onClick={(event) => {
                  event.stopPropagation()
                  actions.onDiscardFile(file.path)
                }}
              >
                <RotateCcw className="size-3.5" />
              </Button>
            </div>
          )
        })}

        {remaining > 0 && (
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            className="flex w-full cursor-pointer items-center justify-center gap-1.5 border-t border-border/40 px-3.5 py-2 text-xs text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground"
          >
            <ChevronDown className={cn("size-3.5 transition-transform duration-200", expanded && "rotate-180")} />
            {expanded ? "收起" : `还有 ${formatStat(remaining)} 个文件`}
          </button>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-2 border-t border-border/50 bg-muted/20 px-3.5 py-2.5">
        <Button
          variant="ghost"
          size="sm"
          onClick={actions.onDiscardAll}
          className="h-8 text-muted-foreground hover:text-destructive"
        >
          <RotateCcw className="size-3.5" />
          全部撤销
        </Button>
        <Button
          variant="default"
          size="sm"
          onClick={actions.onReview}
          className="h-8 gap-1.5 shadow-sm"
        >
          <FileSearch className="size-3.5" />
          审核改动
        </Button>
      </div>
    </div>
  )
})
