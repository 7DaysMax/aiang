import { useState } from "react"

export type TaskStatus = "pending" | "in_progress" | "completed"

export interface TaskListItem {
  content: string
  status: TaskStatus
  activeForm?: string
}

function SpinnerRing({ active, children }: { active?: boolean; children?: number }) {
  const size = 24
  const stroke = 2
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  return (
    <span className="relative inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        className="absolute inset-0"
        style={active ? { animation: "spin 1.1s linear infinite" } : undefined}
      >
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line)" strokeWidth={stroke} />
        {active ? (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="var(--ink-3)"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${c * 0.28} ${c * 0.72}`}
          />
        ) : null}
      </svg>
      <span className="relative text-[10.5px] font-semibold tabular-nums text-ink">{children}</span>
    </span>
  )
}

function Badge({ tone, children }: { tone: "red" | "green"; children: React.ReactNode }) {
  return (
    <span
      className={`flex size-5.5 shrink-0 items-center justify-center rounded-full text-white ${
        tone === "red" ? "bg-red" : "bg-green"
      }`}
      style={{ animation: "pop-in 300ms cubic-bezier(0.23,1,0.32,1) both" }}
    >
      {children}
    </span>
  )
}

const CheckIcon = (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 6L9 17l-5-5" />
  </svg>
)

const STATUS_PILL: Record<TaskStatus, { label: string; className: string } | null> = {
  completed: {
    label: "Completed",
    className: "inline-flex h-5.5 items-center rounded-full bg-green-tint px-2 text-[11.5px] font-medium text-green",
  },
  in_progress: {
    label: "Running",
    className: "inline-flex h-5.5 items-center rounded-full bg-orange-tint px-2 text-[11.5px] font-medium text-orange",
  },
  pending: null,
}

export function TaskList({
  items,
  variant = "capsules",
}: {
  title?: string
  items: TaskListItem[]
  variant?: "capsules" | "list"
}) {
  const [manualOpen, setManualOpen] = useState<Record<number, boolean>>({})
  const list = variant === "list"
  const inProgressIndex = items.findIndex((item) => item.status === "in_progress")

  return (
    <div
      className={`flex w-full flex-col ${
        list ? "gap-0 overflow-hidden rounded-card bg-surface shadow-card" : "gap-2"
      }`}
    >
      {items.map((item, index) => {
        const label = item.status === "in_progress" && item.activeForm ? item.activeForm : item.content
        const details = item.activeForm && item.activeForm !== item.content
          ? [
              { label: item.content, meta: item.status === "completed" ? "done" : "task" },
              { label: item.activeForm, meta: item.status === "in_progress" ? "now" : "form" },
            ]
          : [{ label: item.content, meta: item.status === "completed" ? "done" : item.status === "in_progress" ? "now" : "queued" }]
        const open = manualOpen[index] ?? (index === inProgressIndex)
        const pill = STATUS_PILL[item.status]
        const badge = item.status === "completed" ? (
          <Badge tone="green">{CheckIcon}</Badge>
        ) : (
          <SpinnerRing active={item.status === "in_progress"}>{index + 1}</SpinnerRing>
        )

        return (
          <div
            key={`${item.content}-${index}`}
            className={`self-stretch overflow-hidden transition-[border-radius,background-color] duration-300 hover:bg-inset ${
              list ? "border-b border-line last:border-0" : "bg-surface shadow-card"
            }`}
            style={{
              borderRadius: list ? 0 : open ? 14 : 22,
              animation: `fade-up 450ms cubic-bezier(0.23,1,0.32,1) ${index * 80}ms both`,
            }}
          >
            <button
              type="button"
              aria-expanded={open}
              onClick={() => setManualOpen((current) => ({ ...current, [index]: !open }))}
              className="flex h-11 w-full items-center gap-2.5 px-2.5 text-left"
            >
              <span className="flex size-6 shrink-0 items-center justify-center">{badge}</span>
              <span className={`min-w-0 flex-1 truncate text-[13px] font-medium ${item.status === "completed" ? "text-ink-3" : "text-ink"}`}>
                {label}
              </span>
              {pill ? <span className={pill.className}>{pill.label}</span> : null}
              <span aria-hidden="true" className="-ml-2 flex size-7 shrink-0 items-center justify-center rounded-full text-ink-3">
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="transition-transform duration-300"
                  style={{ transform: open ? "rotate(180deg)" : "rotate(0)" }}
                >
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </span>
            </button>
            <div
              className="grid transition-[grid-template-rows,opacity] duration-300"
              style={{
                gridTemplateRows: open ? "1fr" : "0fr",
                opacity: open ? 1 : 0,
                transitionTimingFunction: "cubic-bezier(0.23, 1, 0.32, 1)",
              }}
            >
              <div className="overflow-hidden">
                <div className="mb-2.5 grid grid-cols-[24px_1fr] gap-2.5 px-2.5">
                  <span aria-hidden className="mx-auto h-full w-px bg-line" />
                  <div className="flex flex-col gap-1.5">
                    {details.map((detail, detailIndex) => (
                      <div
                        key={`${detail.label}-${detailIndex}`}
                        className="flex items-center justify-between"
                        style={
                          open
                            ? { animation: `fade-up 300ms cubic-bezier(0.23,1,0.32,1) ${120 + detailIndex * 100}ms both` }
                            : undefined
                        }
                      >
                        <span className="text-[12px] text-ink-2">{detail.label}</span>
                        <span className="font-mono text-[11.5px] text-ink-3 tabular-nums">{detail.meta}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
