import { useState } from "react"
import { Shimmer } from "./atoms/Shimmer"
import { ToolChipIcon, type ToolChipIconKind } from "./ToolChipIcons"

export type ToolChipDetailLine = { text: string; tone?: "add" }

export function ToolChipRow({
  icon = "generic",
  label,
  chip,
  chipMono = true,
  detail = [],
  detailMono = false,
  pending = false,
  error = false,
}: {
  icon?: ToolChipIconKind
  label: string
  chip?: string | null
  chipMono?: boolean
  detail?: ToolChipDetailLine[]
  detailMono?: boolean
  pending?: boolean
  error?: boolean
}) {
  const [open, setOpen] = useState(false)
  const expandable = detail.length > 0

  return (
    <div style={{ animation: "fade-up 300ms cubic-bezier(0.23,1,0.32,1) both" }}>
      <button
        type="button"
        aria-expanded={expandable ? open : undefined}
        onClick={() => expandable && setOpen((value) => !value)}
        className="group/row -mx-[3px] flex h-7 w-[calc(100%+6px)] min-w-0 items-center gap-2 rounded-control px-[3px] text-left transition-colors duration-100 hover:bg-hover-2"
      >
        <span className="relative flex size-4 shrink-0 items-center justify-center text-ink-3">
          {pending ? (
            <span
              className={`size-3 rounded-full border-[1.5px] border-line-strong border-t-ink-2 transition-opacity duration-100 group-hover/row:opacity-0 ${open ? "opacity-0" : ""}`}
              style={{ animation: "spin 700ms linear infinite" }}
            />
          ) : error ? (
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--red)"
              strokeWidth="2.4"
              className={`transition-opacity duration-100 group-hover/row:opacity-0 ${open ? "opacity-0" : ""}`}
            >
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          ) : (
            <span className={`transition-opacity duration-100 group-hover/row:opacity-0 ${open ? "opacity-0" : ""}`}>
              <ToolChipIcon kind={icon} />
            </span>
          )}
          {expandable ? (
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={`absolute transition-[opacity,transform] duration-150 group-hover/row:opacity-100 ${open ? "opacity-100" : "opacity-0"}`}
              style={{ transform: open ? "rotate(0deg)" : "rotate(-90deg)" }}
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          ) : null}
        </span>
        <span className="shrink-0 text-[12.5px] font-medium text-ink">
          {pending ? <Shimmer className="text-[12.5px] font-medium">{label}</Shimmer> : label}
        </span>
        {chip ? (
          <span
            className={`inline-flex h-5.5 min-w-0 flex-1 cursor-pointer items-center truncate rounded-chip bg-field px-1.5 text-[11.5px] text-ink-2 shadow-hairline transition-colors duration-100 hover:bg-hover-2 ${
              chipMono ? "font-mono" : ""
            }`}
          >
            {chip}
          </span>
        ) : (
          <span className="min-w-0 flex-1" />
        )}
      </button>

      {expandable ? (
        <div
          className="grid transition-[grid-template-rows,opacity] duration-300"
          style={{
            gridTemplateRows: open ? "1fr" : "0fr",
            opacity: open ? 1 : 0,
            transitionTimingFunction: "cubic-bezier(0.23, 1, 0.32, 1)",
          }}
        >
          <div className="min-h-0 overflow-hidden">
            <div className="mt-0.5 mb-1 ml-2 flex flex-col gap-0.5 border-l border-line py-0.5 pl-3.5">
              {detail.map((line) => (
                <span
                  key={line.text}
                  className={`truncate text-[11.5px] leading-[1.6] ${detailMono ? "font-mono" : ""} ${
                    line.tone === "add" ? "text-green" : "text-ink-2"
                  }`}
                >
                  {line.text}
                </span>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
