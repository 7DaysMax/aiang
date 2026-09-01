import { useState } from "react"
import { createPortal } from "react-dom"

export type DiffChipLine = { text: string; tone: "add" | "del" | "ctx" }

export type DiffChipFile = {
  file: string
  path?: string
  add: number
  del: number
  lines?: DiffChipLine[]
}

function previewHeight(file: DiffChipFile) {
  const lineCount = file.lines?.length ?? 0
  return 38 + Math.max(lineCount, lineCount === 0 ? 2 : 0) * 19
}

export function DiffChips({
  files,
  maxVisible = 8,
  onOpenFile,
  rule = true,
}: {
  files: DiffChipFile[]
  maxVisible?: number
  onOpenFile?: (path: string) => void
  rule?: boolean
}) {
  const [preview, setPreview] = useState<{
    file: DiffChipFile
    x: number
    top?: number
    bottom?: number
  } | null>(null)
  const [expanded, setExpanded] = useState(false)

  if (files.length === 0) return null

  const visible = expanded ? files : files.slice(0, maxVisible)
  const remaining = files.length - visible.length

  const openPreview = (file: DiffChipFile) => (event: React.SyntheticEvent) => {
    const target = (event.currentTarget as Element).closest("[data-diffchip]")
    if (!target) return
    const rect = target.getBoundingClientRect()
    const height = previewHeight(file)
    const fitsBelow = rect.bottom + 6 + height <= window.innerHeight - 12
    setPreview({
      file,
      x: Math.max(12, Math.min(rect.left, window.innerWidth - 300)),
      ...(fitsBelow
        ? { top: rect.bottom + 6 }
        : { bottom: window.innerHeight - rect.top + 6 }),
    })
  }

  const closePreview = (file: DiffChipFile) => () =>
    setPreview((current) => (current?.file.file === file.file && current.file.path === file.path ? null : current))

  return (
    <div className={`flex max-w-full flex-wrap gap-1.5 ${rule ? "mt-2.5 border-t border-line pt-2.5" : ""}`}>
      {visible.map((file, index) => (
        <span
          key={`${file.path ?? file.file}-${index}`}
          data-diffchip
          className="relative"
          onMouseEnter={openPreview(file)}
          onMouseLeave={closePreview(file)}
        >
          <button
            type="button"
            aria-expanded={preview?.file === file}
            aria-label={`Show diff for ${file.file}`}
            onFocus={openPreview(file)}
            onBlur={closePreview(file)}
            onClick={() => onOpenFile?.(file.path ?? file.file)}
            className="inline-flex h-7 max-w-full items-center gap-2 rounded-chip bg-surface px-2 font-mono text-[11.5px] text-ink shadow-btn transition-colors duration-100 hover:bg-hover"
            style={{ animation: `pop-in 250ms cubic-bezier(0.23,1,0.32,1) ${index * 80}ms both` }}
          >
            <span className="min-w-0 truncate">{file.file}</span>
            <span className="shrink-0 text-green tabular-nums">+{file.add}</span>
            {file.del > 0 ? <span className="shrink-0 text-red tabular-nums">−{file.del}</span> : null}
          </button>
        </span>
      ))}
      {remaining > 0 ? (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="inline-flex h-7 items-center rounded-chip px-1.5 font-mono text-[11.5px] text-ink-3 underline decoration-transparent underline-offset-2 transition-colors duration-100 hover:text-ink-2 hover:decoration-current"
          style={{ animation: `fade-in 300ms ease-out ${visible.length * 80}ms both` }}
        >
          +{remaining} more
        </button>
      ) : null}
      {preview && typeof document !== "undefined"
        ? createPortal(
            <div
              className="fixed z-50 w-72 overflow-hidden rounded-[10px] bg-surface shadow-overlay"
              style={{
                left: preview.x,
                top: preview.top,
                bottom: preview.bottom,
                animation: "pop-in 160ms cubic-bezier(0.23,1,0.32,1) both",
                transformOrigin: preview.top === undefined ? "bottom left" : "top left",
              }}
            >
              <div className="flex items-center justify-between border-b border-line px-2.5 py-1.5 font-mono text-[11px]">
                <span className="min-w-0 truncate text-ink-2">{preview.file.file}</span>
                <span className="shrink-0 tabular-nums">
                  <span className="text-green">+{preview.file.add}</span>
                  {preview.file.del > 0 ? <span className="text-red"> −{preview.file.del}</span> : null}
                </span>
              </div>
              <div className="py-1 font-mono text-[11px] leading-[1.8]">
                {(preview.file.lines ?? []).length > 0 ? (
                  preview.file.lines!.map((line, index) => (
                    <div
                      key={index}
                      className={`flex gap-2 px-2.5 whitespace-pre ${
                        line.tone === "add"
                          ? "bg-green-tint text-green"
                          : line.tone === "del"
                            ? "bg-red-tint text-red"
                            : "text-ink-2"
                      }`}
                    >
                      <span className="w-3 shrink-0 select-none">
                        {line.tone === "add" ? "+" : line.tone === "del" ? "−" : " "}
                      </span>
                      <span className="min-w-0 truncate">{line.text}</span>
                    </div>
                  ))
                ) : (
                  <div className="px-2.5 py-1 text-[11.5px] text-ink-3">
                    {preview.file.add > 0 ? `+${preview.file.add}` : "0"}{" "}
                    {preview.file.del > 0 ? `−${preview.file.del}` : "−0"}
                  </div>
                )}
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}
