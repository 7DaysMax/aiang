import { useMemo, useState, type ReactNode } from "react"
import { ChevronDown, FileCode2 } from "lucide-react"
import { PatchDiff } from "@pierre/diffs/react"
import { buildEditDiffPatch } from "../../lib/diffPatch"
import { cn } from "../../lib/utils"

/** Soft cap so a single tool expansion never freezes the transcript. */
export const DEFAULT_FILE_PREVIEW_LINES = 400
/** Below this line count we keep the rich PatchDiff renderer. */
const RICH_DIFF_LINE_BUDGET = 280

interface FileContentViewProps {
  content: string
  isDiff?: boolean
  oldString?: string
  newString?: string
  /** Language hint for PatchDiff (e.g. src/App.tsx). */
  filePath?: string
  /** Max lines shown before "Show more". */
  maxLines?: number
}

interface ParsedLine {
  lineNumber: number | null
  content: string
}

interface FastDiffLine {
  type: "context" | "removed" | "added"
  content: string
}

function parseContent(content: string): ParsedLine[] {
  const lines = content.split("\n")
  const lineNumberPattern = /^\s*(\d+)→(.*)$/

  return lines.map((line) => {
    const match = line.match(lineNumberPattern)
    if (match) {
      return {
        lineNumber: parseInt(match[1], 10),
        content: match[2],
      }
    }
    return {
      lineNumber: null,
      content: line,
    }
  })
}

function stripXmlTags(text: string): string {
  return text.replace(/<[^>]+>/g, "")
}

type RawLine = { type: "context" | "removed" | "added"; text: string }

function buildLCS(a: string[], b: string[]): number[][] {
  const m = a.length
  const n = b.length
  // Guard: O(n*m) memory. For huge edits we fall through to a simpler path.
  if (m * n > 1_200_000) return []
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0))
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1])
    }
  }
  return dp
}

function buildRawDiff(oldLines: string[], newLines: string[], dp: number[][]): RawLine[] {
  if (dp.length === 0) {
    // Fallback when LCS is too expensive: just show removals then additions.
    return [
      ...oldLines.map((text) => ({ type: "removed" as const, text })),
      ...newLines.map((text) => ({ type: "added" as const, text })),
    ]
  }

  const result: RawLine[] = []
  let i = oldLines.length
  let j = newLines.length

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      result.push({ type: "context", text: oldLines[i - 1] })
      i--
      j--
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.push({ type: "added", text: newLines[j - 1] })
      j--
    } else {
      result.push({ type: "removed", text: oldLines[i - 1] })
      i--
    }
  }

  return result.reverse()
}

function computeUnifiedDiff(oldStr: string, newStr: string): FastDiffLine[] {
  const oldLines = oldStr.split("\n")
  const newLines = newStr.split("\n")
  const lcs = buildLCS(oldLines, newLines)
  const raw = buildRawDiff(oldLines, newLines, lcs)
  return raw.map((d) => ({
    type: d.type,
    content: d.text,
  }))
}

function countLines(...parts: Array<string | undefined>): number {
  let total = 0
  for (const part of parts) {
    if (!part) continue
    total += part.split("\n").length
  }
  return total
}

function PreviewShell({
  label,
  meta,
  children,
  footer,
}: {
  label: string
  meta?: string
  children: ReactNode
  footer?: ReactNode
}) {
  return (
    <div className="my-1 overflow-hidden rounded-xl border border-border bg-zinc-50 text-zinc-900 shadow-sm dark:border-border/80 dark:bg-card dark:text-foreground dark:shadow-[0_1px_0_rgba(255,255,255,0.04)]">
      <div className="flex items-center gap-2 border-b border-border/70 bg-zinc-100/90 px-3 py-1.5 dark:border-border/60 dark:bg-muted/40">
        <FileCode2 className="size-3.5 shrink-0 text-zinc-500 dark:text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate text-[11px] font-medium tracking-wide text-zinc-600 uppercase dark:text-muted-foreground">
          {label}
        </span>
        {meta ? (
          <span className="shrink-0 font-mono text-[11px] tabular-nums text-zinc-500 dark:text-muted-foreground/80">
            {meta}
          </span>
        ) : null}
      </div>
      {children}
      {footer}
    </div>
  )
}

function ExpandFooter({
  hiddenCount,
  expanded,
  onToggle,
}: {
  hiddenCount: number
  expanded: boolean
  onToggle: () => void
}) {
  if (hiddenCount <= 0 && !expanded) return null
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex w-full cursor-pointer items-center justify-center gap-1.5 border-t border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
    >
      <ChevronDown className={cn("size-3.5 transition-transform duration-200", expanded && "rotate-180")} />
      {expanded ? "收起" : `还有 ${hiddenCount.toLocaleString()} 行，点击展开`}
    </button>
  )
}

export function FileContentView({
  content,
  isDiff = false,
  oldString,
  newString,
  filePath = "file.txt",
  maxLines = DEFAULT_FILE_PREVIEW_LINES,
}: FileContentViewProps) {
  const [expanded, setExpanded] = useState(false)

  const totalDiffLines = useMemo(() => {
    if (!isDiff) return 0
    return countLines(oldString, newString)
  }, [isDiff, oldString, newString])

  // Prefer the fast table path for large edits — PatchDiff + word highlight
  // freezes the main thread past a few hundred lines.
  const useRichDiff = isDiff && totalDiffLines > 0 && totalDiffLines <= RICH_DIFF_LINE_BUDGET

  const diffPatch = useMemo(() => {
    if (!useRichDiff || oldString === undefined || newString === undefined) return ""
    return buildEditDiffPatch(filePath, oldString, newString)
  }, [filePath, newString, oldString, useRichDiff])

  const fastDiffLines = useMemo(() => {
    if (!isDiff || useRichDiff || oldString === undefined || newString === undefined) return []
    return computeUnifiedDiff(oldString, newString)
  }, [isDiff, newString, oldString, useRichDiff])

  const parsedLines = useMemo(() => {
    if (isDiff) return []
    return parseContent(content)
  }, [content, isDiff])

  const hasLineNumbers = useMemo(
    () => parsedLines.some((line) => line.lineNumber !== null),
    [parsedLines],
  )

  // ── Rich PatchDiff (small edits) ─────────────────────────────────────────
  if (useRichDiff && diffPatch) {
    return (
      <PreviewShell label="Diff" meta={filePath.split("/").pop()}>
        <div className="max-h-[min(420px,50vh)] overflow-auto">
          <PatchDiff
            patch={diffPatch}
            options={{
              diffStyle: "unified",
              // char is ~3–5× cheaper than word and still readable
              lineDiffType: "char",
              diffIndicators: "classic",
              disableFileHeader: true,
              disableBackground: false,
              overflow: "scroll",
              // Follow app light/dark so tokens are never pale-on-white
              themeType: "system",
              // Collapse long unchanged runs so the card stays short
              collapsedContextThreshold: 4,
            }}
          />
        </div>
      </PreviewShell>
    )
  }

  // ── Fast table diff (large edits) ────────────────────────────────────────
  if (isDiff && fastDiffLines.length > 0) {
    const visible = expanded ? fastDiffLines : fastDiffLines.slice(0, maxLines)
    const hidden = Math.max(0, fastDiffLines.length - visible.length)
    const added = fastDiffLines.filter((l) => l.type === "added").length
    const removed = fastDiffLines.filter((l) => l.type === "removed").length

    return (
      <PreviewShell
        label="Diff"
        meta={`+${added} −${removed}`}
        footer={
          <ExpandFooter
            hiddenCount={hidden}
            expanded={expanded}
            onToggle={() => setExpanded((v) => !v)}
          />
        }
      >
        <div className="max-h-[min(420px,50vh)] overflow-auto">
          <table className="w-full border-collapse text-[12px] leading-[1.55] font-mono">
            <tbody>
              {visible.map((line, i) => {
                const isRemoved = line.type === "removed"
                const isAdded = line.type === "added"
                return (
                  <tr
                    key={i}
                    className={cn(
                      isRemoved && "bg-red-100/80 dark:bg-red-500/[0.14]",
                      isAdded && "bg-emerald-100/80 dark:bg-emerald-500/[0.14]",
                    )}
                  >
                    <td
                      className={cn(
                        "w-0 select-none whitespace-nowrap px-2 py-0 text-center align-top font-medium",
                        isRemoved && "text-red-600 dark:text-red-400",
                        isAdded && "text-emerald-700 dark:text-emerald-400",
                        !isRemoved && !isAdded && "text-zinc-400 dark:text-muted-foreground/50",
                      )}
                    >
                      {isRemoved ? "−" : isAdded ? "+" : " "}
                    </td>
                    <td
                      className={cn(
                        "whitespace-pre-wrap break-all px-2 py-0 select-all",
                        isRemoved && "text-red-800 dark:text-red-200",
                        isAdded && "text-emerald-900 dark:text-emerald-200",
                        !isRemoved && !isAdded && "text-zinc-800 dark:text-foreground",
                      )}
                    >
                      {line.content || "\u00a0"}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </PreviewShell>
    )
  }

  // ── Plain text / Read result ─────────────────────────────────────────────
  const visibleText = expanded ? parsedLines : parsedLines.slice(0, maxLines)
  const hiddenText = Math.max(0, parsedLines.length - visibleText.length)

  return (
    <PreviewShell
      label="File"
      meta={
        parsedLines.length > 0
          ? `${parsedLines.length.toLocaleString()} lines`
          : undefined
      }
      footer={
        <ExpandFooter
          hiddenCount={hiddenText}
          expanded={expanded}
          onToggle={() => setExpanded((v) => !v)}
        />
      }
    >
      <div className="max-h-[min(420px,50vh)] overflow-auto">
        <table className="w-full border-collapse text-[12px] leading-[1.55] font-mono">
          <tbody>
            {visibleText.map((line, i) => (
              <tr key={i} className="hover:bg-zinc-100/80 dark:hover:bg-muted/30">
                {hasLineNumbers && (
                  <td className="w-0 select-none whitespace-nowrap px-2.5 py-0 text-right align-top text-[11px] tabular-nums text-zinc-400 dark:text-muted-foreground/60">
                    {line.lineNumber !== null ? line.lineNumber : ""}
                  </td>
                )}
                <td className="whitespace-pre-wrap break-all px-2 py-0 select-all text-zinc-900 dark:text-foreground">
                  {stripXmlTags(line.content) || "\u00a0"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </PreviewShell>
  )
}
