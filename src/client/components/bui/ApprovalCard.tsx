import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react"
import { Button } from "./atoms/Button"

const ROLL_MS = 400
const SLIDE = "360ms cubic-bezier(0.22, 1, 0.36, 1)"

function RollingDigits({ value }: { value: string }) {
  const prevRef = useRef(value)
  const [oldVal, setOldVal] = useState(value)
  const [newVal, setNewVal] = useState(value)
  const [rolling, setRolling] = useState(false)
  const [shifted, setShifted] = useState(false)
  const [dir, setDir] = useState<"up" | "down">("up")

  useEffect(() => {
    if (prevRef.current === value) return
    const from = prevRef.current
    prevRef.current = value
    const fromN = parseInt(from, 10)
    const toN = parseInt(value, 10)
    setDir(Number.isFinite(fromN) && Number.isFinite(toN) && toN < fromN ? "down" : "up")
    setOldVal(from)
    setNewVal(value)
    setRolling(true)
    setShifted(false)

    let raf2 = 0
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setShifted(true))
    })
    const done = setTimeout(() => {
      setRolling(false)
      setOldVal(value)
      setShifted(false)
    }, ROLL_MS)

    return () => {
      cancelAnimationFrame(raf1)
      cancelAnimationFrame(raf2)
      clearTimeout(done)
    }
  }, [value])

  const chars = rolling ? newVal : oldVal

  return (
    <>
      {Array.from({ length: chars.length }, (_, i) => {
        const o = oldVal[i] ?? ""
        const n = chars[i] ?? ""
        if (!rolling || o === n) {
          return <span key={`${i}-${n}`}>{n}</span>
        }
        const top = dir === "down" ? n : o
        const bottom = dir === "down" ? o : n
        const restY = dir === "down" ? "0" : "-1em"
        const startY = dir === "down" ? "-1em" : "0"
        return (
          <span
            key={`${i}-${o}-${n}-${dir}`}
            style={{ display: "inline-block", position: "relative", overflow: "hidden", height: "1em", lineHeight: "1em", verticalAlign: "-0.05em" }}
          >
            <span
              style={{
                display: "flex",
                flexDirection: "column",
                transition: "transform 350ms cubic-bezier(0.4, 0, 0.2, 1)",
                transform: `translateY(${shifted ? restY : startY})`,
              }}
            >
              <span style={{ height: "1em", lineHeight: "1em" }}>{top}</span>
              <span style={{ height: "1em", lineHeight: "1em" }}>{bottom}</span>
            </span>
          </span>
        )
      })}
    </>
  )
}

function Ico({ path, size = 14, sw = 2 }: { path: ReactNode; size?: number; sw?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {path}
    </svg>
  )
}

export type ApprovalQuestion = {
  key: string
  question: string
  multiSelect?: boolean
  options: Array<{ label: string; description?: string }>
}

export function ApprovalCard({
  questions,
  onSubmit,
  onSkip,
}: {
  questions: ApprovalQuestion[]
  onSubmit: (answers: Record<string, string[]>) => void
  onSkip?: () => void
}) {
  const [qi, setQi] = useState(0)
  const [answers, setAnswers] = useState<Record<number, number[]>>({})
  const [custom, setCustom] = useState<Record<number, string>>({})
  const [sent, setSent] = useState(false)

  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const questionRefs = useRef<(HTMLDivElement | null)[]>([])
  const measured = useRef(false)
  const [viewportH, setViewportH] = useState<number | undefined>(undefined)
  const [trackY, setTrackY] = useState(0)
  const [animate, setAnimate] = useState(false)

  const last = qi === questions.length - 1
  const selected = answers[qi] ?? []
  const hasAnswer = selected.length > 0 || Boolean(custom[qi]?.trim())
  const current = questions[qi]

  const sync = (withAnim: boolean) => {
    const item = questionRefs.current[qi]
    if (!item) return
    const reduce = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
    setViewportH(item.offsetHeight)
    setTrackY(item.offsetTop)
    setAnimate(withAnim && !reduce)
  }

  useLayoutEffect(() => {
    const withAnim = measured.current
    measured.current = true
    sync(withAnim)
  }, [qi, answers, custom, sent])

  useEffect(() => {
    const id = requestAnimationFrame(() => sync(measured.current))
    return () => cancelAnimationFrame(id)
  }, [qi])

  useEffect(() => () => { if (advanceTimer.current) clearTimeout(advanceTimer.current) }, [])

  const collect = () => {
    const result: Record<string, string[]> = {}
    questions.forEach((question, index) => {
      const picked = (answers[index] ?? []).map((optionIndex) => question.options[optionIndex]?.label).filter(Boolean) as string[]
      const extra = custom[index]?.trim()
      result[question.key] = extra ? [...picked, extra] : picked
    })
    return result
  }

  const goTo = (next: number) => {
    if (advanceTimer.current) clearTimeout(advanceTimer.current)
    setQi(Math.min(Math.max(next, 0), questions.length - 1))
  }

  const send = () => {
    if (advanceTimer.current) clearTimeout(advanceTimer.current)
    setSent(true)
    onSubmit(collect())
  }

  const advance = () => {
    if (last) send()
    else goTo(qi + 1)
  }

  const toggle = (index: number) => {
    if (!current) return
    setAnswers((currentAnswers) => {
      const picked = currentAnswers[qi] ?? []
      const next = current.multiSelect
        ? picked.includes(index)
          ? picked.filter((item) => item !== index)
          : [...picked, index]
        : [index]
      return { ...currentAnswers, [qi]: next }
    })
    if (!current.multiSelect) {
      setCustom((currentCustom) => ({ ...currentCustom, [qi]: "" }))
      if (advanceTimer.current) clearTimeout(advanceTimer.current)
      advanceTimer.current = setTimeout(() => {
        if (last) send()
        else setQi((value) => Math.min(questions.length - 1, value + 1))
      }, 480)
    }
  }

  if (sent) {
    return (
      <div className="flex w-full items-center gap-3" style={{ animation: "pop-in 260ms cubic-bezier(0.23,1,0.32,1) both" }}>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-green-tint py-1 pr-2.5 pl-1 text-[12.5px] font-medium text-green">
          <span className="flex size-4.5 items-center justify-center rounded-full bg-green text-white">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
          </span>
          Answers sent
        </span>
      </div>
    )
  }

  if (!current) return null

  return (
    <div className="w-full">
      <div className="relative overflow-hidden rounded-card bg-surface shadow-card" style={{ animation: "fade-up 380ms cubic-bezier(0.23,1,0.32,1) both" }}>
        {onSkip ? (
          <button
            type="button"
            aria-label="Dismiss"
            onClick={onSkip}
            className="primitive-icon-button absolute right-2.5 top-2.5 z-10 text-ink-3 transition-colors duration-100 hover:bg-hover hover:text-ink"
          >
            <Ico size={14} sw={2.2} path={<path d="M18 6L6 18M6 6l12 12" />} />
          </button>
        ) : null}
        <div className="primitive-card-pad">
          <div
            className="overflow-hidden"
            style={{ height: viewportH, transition: animate ? `height ${SLIDE}` : undefined }}
            aria-live="polite"
          >
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 26,
                transform: `translate3d(0, ${-trackY}px, 0)`,
                transition: animate ? `transform ${SLIDE}` : undefined,
                willChange: "transform",
              }}
            >
              {questions.map((question, qIdx) => {
                const active = qIdx === qi
                const picked = answers[qIdx] ?? []
                const questionStyle: CSSProperties = {
                  opacity: active ? 1 : 0,
                  transition: animate ? `opacity ${SLIDE}` : undefined,
                  pointerEvents: active ? undefined : "none",
                }
                return (
                  <div
                    key={question.key}
                    ref={(el) => { questionRefs.current[qIdx] = el }}
                    aria-hidden={active ? undefined : true}
                    style={questionStyle}
                  >
                    <div className="pr-7 text-[14px] font-medium text-ink">{question.question}</div>
                    <div className="mt-2 flex flex-col gap-0.5">
                      {question.options.map((option, i) => {
                        const on = picked.includes(i)
                        return (
                          <button
                            key={option.label}
                            type="button"
                            aria-pressed={on}
                            tabIndex={active ? 0 : -1}
                            onClick={() => { if (active) toggle(i) }}
                            className="flex items-center gap-2 rounded-control px-1.5 py-1 text-left transition-colors duration-100 hover:bg-hover"
                          >
                            <span
                              className={`flex size-4 shrink-0 items-center justify-center transition-colors duration-200 ${
                                question.multiSelect ? "rounded-[5px]" : "rounded-full"
                              } ${on ? "bg-ink text-canvas" : "shadow-[inset_0_0_0_1.5px_var(--line-strong)] text-transparent"}`}
                            >
                              {question.multiSelect ? (
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
                              ) : (
                                <span className="size-1.5 rounded-full bg-canvas transition-transform duration-200" style={{ transform: on ? "scale(1)" : "scale(0)" }} />
                              )}
                            </span>
                            <span className="min-w-0">
                              <span className={`block text-[13px] transition-colors duration-200 ${on ? "text-ink" : "text-ink-2"}`}>{option.label}</span>
                              {option.description ? <span className="block text-[11.5px] text-ink-3">{option.description}</span> : null}
                            </span>
                          </button>
                        )
                      })}
                      <label className="flex items-center gap-2 rounded-control px-1.5 py-1 transition-colors duration-100 focus-within:bg-hover hover:bg-hover">
                        <span aria-hidden="true" className="size-4 shrink-0" />
                        <input
                          value={custom[qIdx] ?? ""}
                          tabIndex={active ? 0 : -1}
                          onChange={(event) => {
                            if (!active) return
                            setCustom((currentCustom) => ({ ...currentCustom, [qIdx]: event.target.value }))
                            if (!question.multiSelect) setAnswers((currentAnswers) => ({ ...currentAnswers, [qIdx]: [] }))
                          }}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" && hasAnswer) {
                              event.preventDefault()
                              advance()
                            }
                          }}
                          placeholder="Something else…"
                          aria-label="Custom answer"
                          className="min-w-0 flex-1 bg-transparent text-[13px] text-ink outline-none placeholder:text-ink-3"
                        />
                      </label>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
        <div className="primitive-card-footer flex items-center justify-between gap-3">
          <div className="flex items-center gap-1 text-ink-3">
            <button
              type="button"
              aria-label="Previous question"
              disabled={qi <= 0}
              onClick={() => goTo(qi - 1)}
              className="flex size-[18px] items-center justify-center rounded-[5px] transition-colors duration-100 enabled:hover:text-ink disabled:opacity-30"
            >
              <Ico size={14} path={<path d="M18 15l-6-6-6 6" />} />
            </button>
            <span className="inline-flex items-center text-[12px] font-medium tabular-nums text-ink-3" style={{ letterSpacing: "-0.1px", lineHeight: 1 }}>
              <RollingDigits value={`${qi + 1} / ${questions.length}`} />
            </span>
            <button
              type="button"
              aria-label="Next question"
              disabled={last}
              onClick={() => goTo(qi + 1)}
              className="flex size-[18px] items-center justify-center rounded-[5px] transition-colors duration-100 enabled:hover:text-ink disabled:opacity-30"
            >
              <Ico size={14} path={<path d="M6 9l6 6 6-6" />} />
            </button>
          </div>
          <div className="-mr-0.5 flex items-center gap-1.5">
            {onSkip ? (
              <Button variant="ghost" size="sm" onClick={onSkip}>Skip</Button>
            ) : null}
            <Button variant="accent" size="sm" disabled={!hasAnswer} onClick={advance}>
              {last ? "Send" : "Continue"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

export function ApprovalShell({
  step,
  total,
  question,
  onBack,
  children,
  footer,
}: {
  step: number
  total: number
  question: string
  onBack?: () => void
  children: ReactNode
  footer?: ReactNode
}) {
  return (
    <div className="overflow-hidden rounded-window bg-surface shadow-card">
      <div className="flex items-center gap-2 border-b border-line bg-inset px-3.5 py-2.5">
        {onBack ? (
          <button type="button" onClick={onBack} className="flex size-7 items-center justify-center rounded-full text-ink-2 hover:bg-hover">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M15 6l-6 6 6 6" />
            </svg>
          </button>
        ) : null}
        {total > 1 ? (
          <span className="font-mono text-[11.5px] tabular-nums text-ink-3">
            {step + 1} / {total}
          </span>
        ) : null}
        <span className="min-w-0 text-[13px] font-medium text-ink">{question}</span>
      </div>
      {total > 1 ? (
        <div className="h-0.5 bg-line">
          <div className="h-full bg-ink-3 transition-all duration-300" style={{ width: `${((step + 1) / total) * 100}%` }} />
        </div>
      ) : null}
      <div className="p-2">{children}</div>
      {footer ? <div className="flex items-center justify-end gap-2 border-t border-line px-3 py-2.5">{footer}</div> : null}
    </div>
  )
}

export function ApprovalOption({
  selected,
  multi,
  label,
  description,
  onClick,
}: {
  selected: boolean
  multi?: boolean
  label: string
  description?: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-start gap-2.5 rounded-control px-2.5 py-2 text-left transition-colors ${
        selected ? "bg-accent-tint" : "hover:bg-hover"
      }`}
    >
      <span
        className={`mt-0.5 flex size-4 shrink-0 items-center justify-center border ${
          multi ? "rounded-[4px]" : "rounded-full"
        } ${selected ? "border-ink bg-ink text-canvas" : "border-line-strong"}`}
      >
        {selected ? (
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5">
            <path d="M20 6L9 17l-5-5" />
          </svg>
        ) : null}
      </span>
      <span className="min-w-0">
        <span className="block text-[13px] text-ink">{label}</span>
        {description ? <span className="mt-0.5 block text-[12px] text-ink-3">{description}</span> : null}
      </span>
    </button>
  )
}

export function ApprovalButton({
  children,
  onClick,
  disabled,
}: {
  children: ReactNode
  onClick?: () => void
  disabled?: boolean
}) {
  return (
    <Button variant="accent" size="sm" onClick={onClick} disabled={disabled}>
      {children}
    </Button>
  )
}
