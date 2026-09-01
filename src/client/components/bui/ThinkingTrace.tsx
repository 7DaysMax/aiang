import { useLayoutEffect, useRef, useState, type ReactNode } from "react"
import { Shimmer } from "./atoms/Shimmer"

export function ThinkingTrace({
  working,
  title = "思考中",
  doneTitle = "思考过程",
  meta,
  children,
  defaultOpen,
}: {
  working: boolean
  title?: string
  doneTitle?: string
  meta?: ReactNode
  children?: ReactNode
  defaultOpen?: boolean
}) {
  const [manualOpen, setManualOpen] = useState<boolean | null>(null)
  const traceRef = useRef<HTMLDivElement>(null)
  const [lineHeight, setLineHeight] = useState(0)
  const expanded = manualOpen ?? (defaultOpen ?? true)

  useLayoutEffect(() => {
    if (traceRef.current) setLineHeight(traceRef.current.offsetHeight)
  }, [children, expanded, working])

  return (
    <div
      className="flex w-full flex-col"
      style={{
        transition: "min-height 400ms cubic-bezier(0.23,1,0.32,1)",
      }}
    >
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setManualOpen((current) => !(current ?? (defaultOpen ?? true)))}
        className="-mx-1.5 flex w-fit items-center gap-2 rounded-control px-1.5 py-1 transition-colors duration-100 hover:bg-hover-2"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill={working ? "var(--ink-2)" : "var(--ink-3)"} aria-hidden>
          <path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8z" />
        </svg>
        <span role="status" className="contents">
          {working ? (
            <Shimmer className="text-[13px] font-medium whitespace-nowrap">{title}</Shimmer>
          ) : (
            <span className="text-[13px] font-medium whitespace-nowrap text-ink-2" style={{ animation: "fade-in 350ms ease-out both" }}>
              {doneTitle}
            </span>
          )}
        </span>
        {meta ? <span className="text-[11.5px] tabular-nums text-ink-3">{meta}</span> : null}
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--ink-3)"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="transition-transform duration-300"
          style={{ transform: expanded ? "rotate(180deg)" : "rotate(0)" }}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      <div
        className="grid transition-[grid-template-rows,opacity] duration-400"
        style={{
          gridTemplateRows: expanded ? "1fr" : "0fr",
          opacity: expanded ? 1 : 0,
          transitionTimingFunction: "cubic-bezier(0.23, 1, 0.32, 1)",
        }}
      >
        <div className="overflow-hidden">
          <div className="relative mt-1 ml-[5px] pl-4">
            <span
              aria-hidden
              className="absolute left-[3px] w-px bg-line"
              style={{ top: -8, height: lineHeight ? lineHeight - 2 : 0, transition: "height 500ms cubic-bezier(0.23,1,0.32,1)" }}
            />
            <div ref={traceRef} className="flex flex-col gap-1 py-1 text-[12.5px] leading-relaxed text-ink-2">
              {children}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
