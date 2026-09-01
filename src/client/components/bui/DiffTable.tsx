import { useMemo, useState } from "react"
import { Button } from "./atoms/Button"

export type DiffTableRow = {
  key: string
  file: string
  kind: "added" | "deleted" | "modified" | "renamed"
  add: number
  del: number
  path: string
}

const KIND_LABEL: Record<DiffTableRow["kind"], string> = {
  added: "Added",
  deleted: "Deleted",
  modified: "Modified",
  renamed: "Renamed",
}

const KIND_DOT: Record<DiffTableRow["kind"], string> = {
  added: "bg-green",
  deleted: "bg-red",
  modified: "bg-accent",
  renamed: "bg-orange",
}

function IncludedMark({ included, tone }: { included: boolean; tone: "red" | "green" }) {
  return (
    <span
      aria-hidden
      className={`flex size-4.5 shrink-0 items-center justify-center rounded-[5px] transition-[background-color,color,transform] duration-150 ${
        included
          ? tone === "red" ? "bg-red text-white" : "bg-green text-white"
          : "bg-inset text-ink-3 shadow-hairline"
      }`}
      style={{ transform: included ? "scale(1)" : "scale(0.92)" }}
    >
      {included ? (
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
      ) : null}
    </span>
  )
}

export function DiffTable({
  title = "Proposed edits",
  rows,
  onOpenFile,
  onApply,
  onDiscardAll,
}: {
  title?: string
  rows: DiffTableRow[]
  onOpenFile?: (path: string) => void
  onApply?: (paths: string[]) => void
  onDiscardAll?: () => void
}) {
  const [included, setIncluded] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(rows.map((row) => [row.key, true])),
  )
  const [accepted, setAccepted] = useState(false)

  const selected = useMemo(() => rows.filter((row) => included[row.key] !== false), [included, rows])
  const additions = selected.filter((row) => row.kind === "added").length
  const removals = selected.filter((row) => row.kind === "deleted").length
  const edits = selected.length

  if (rows.length === 0) return null

  return (
    <div className="w-full">
      <div className="relative overflow-hidden rounded-card bg-surface shadow-card">
        <div className="primitive-card-bar flex items-center justify-between border-b border-line">
          <span className="text-[12.5px] font-medium text-ink">{title}</span>
          {!accepted ? <span className="text-[11px] text-ink-3">Click changed rows to toggle</span> : null}
        </div>
        <table className="w-full table-fixed border-collapse text-left">
          <colgroup>
            <col className="w-[46%]" />
            <col className="w-[28%]" />
            <col className="w-[26%]" />
          </colgroup>
          <thead>
            <tr className="border-b border-line">
              {["File", "Change", "Diff"].map((heading) => (
                <th key={heading} className="primitive-table-cell text-[12px] font-medium text-ink-3">
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const on = included[row.key] !== false
              const removed = row.kind === "deleted"
              const added = row.kind === "added"
              return (
                <tr
                  key={row.key}
                  tabIndex={accepted ? undefined : 0}
                  aria-selected={on}
                  onClick={() => {
                    if (accepted) {
                      onOpenFile?.(row.path)
                      return
                    }
                    setIncluded((current) => ({ ...current, [row.key]: !on }))
                  }}
                  className={`border-b border-line transition-[background-color,filter,opacity] duration-150 last:border-0 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-accent ${
                    accepted ? "cursor-pointer" : "cursor-pointer hover:brightness-[0.985]"
                  }`}
                  style={{
                    background: !on ? undefined : removed ? "var(--red-tint)" : added ? "var(--green-tint)" : undefined,
                  }}
                >
                  <td className="primitive-table-cell text-[13px] font-medium" style={{ color: !on ? "var(--ink-3)" : removed ? "var(--red)" : added ? "var(--green)" : "var(--ink)" }}>
                    <span className="block truncate font-mono">{row.file}</span>
                  </td>
                  <td className="primitive-table-cell">
                    <span className="inline-flex h-5.5 items-center gap-1.5 rounded-full bg-inset px-2 text-[11.5px] font-medium shadow-hairline" style={{ opacity: on ? 1 : 0.55 }}>
                      <span className={`size-1.5 rounded-full ${KIND_DOT[row.kind]}`} />
                      <span className="text-ink-2">{KIND_LABEL[row.kind]}</span>
                    </span>
                  </td>
                  <td className="primitive-table-cell">
                    <span className="flex items-center justify-between gap-2 font-mono text-[12px] tabular-nums">
                      <span>
                        <span className="text-green">+{row.add}</span>{" "}
                        <span className="text-red">−{row.del}</span>
                      </span>
                      <IncludedMark included={on} tone={removed ? "red" : "green"} />
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <div className="primitive-card-footer flex min-h-11 items-center justify-between border-t border-line">
          {accepted ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-green-tint py-1 pr-2.5 pl-1 text-[12.5px] font-medium text-green">
              <span className="flex size-4.5 items-center justify-center rounded-full bg-green text-white">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
              </span>
              {edits} {edits === 1 ? "edit" : "edits"} applied
            </span>
          ) : (
            <>
              <span className="text-[11.5px] tabular-nums text-ink-3">
                {removals} {removals === 1 ? "removal" : "removals"} · {additions} {additions === 1 ? "addition" : "additions"}
              </span>
              <span className="flex items-center gap-1.5">
                {onDiscardAll ? (
                  <Button variant="ghost" size="sm" onClick={onDiscardAll}>
                    Discard
                  </Button>
                ) : null}
                <Button
                  variant="accent"
                  size="sm"
                  disabled={edits === 0}
                  onClick={() => {
                    setAccepted(true)
                    onApply?.(selected.map((row) => row.path))
                  }}
                >
                  Apply {edits} {edits === 1 ? "change" : "changes"}
                </Button>
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
