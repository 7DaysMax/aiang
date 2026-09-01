import { useEffect, useRef, useState } from "react"
import { insertComposerText } from "../../lib/composerInsert"
import { CHAT_SELECTION_ZONE_ATTRIBUTE } from "../../app/chatFocusPolicy"

const control =
  "inline-flex h-7 shrink-0 items-center gap-1 rounded-full px-2.5 text-[12px] font-normal text-ink transition-[background-color,color,transform] duration-150 hover:bg-hover active:scale-[0.96]"

const primary =
  "inline-flex h-7 shrink-0 items-center gap-1 rounded-full bg-ink px-2.5 text-[12.5px] font-normal text-canvas shadow-hairline transition-[opacity,transform] duration-150 hover:opacity-90 active:scale-[0.96]"

const ACTIONS = [
  { key: "explain", label: "Explain", prefix: "解释这段：\n" },
  { key: "improve", label: "Improve", prefix: "改写得更好：\n" },
  { key: "shorten", label: "Shorten", prefix: "缩短这段：\n" },
] as const

export function SelectionBar() {
  const [picked, setPicked] = useState("")
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null)
  const barRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onSelection = () => {
      const selection = window.getSelection()
      if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
        setAnchor(null)
        setPicked("")
        return
      }
      const text = selection.toString().trim()
      if (text.length < 2) {
        setAnchor(null)
        return
      }
      const range = selection.getRangeAt(0)
      const node = range.commonAncestorContainer
      const el = node instanceof Element ? node : node.parentElement
      if (!el?.closest(`[${CHAT_SELECTION_ZONE_ATTRIBUTE}]`)) {
        setAnchor(null)
        return
      }
      const rects = range.getClientRects()
      const last = rects[rects.length - 1]
      if (!last) {
        setAnchor(null)
        return
      }
      setPicked(text)
      setAnchor({
        x: last.left + last.width / 2,
        y: last.bottom + 8,
      })
    }

    document.addEventListener("selectionchange", onSelection)
    window.addEventListener("scroll", onSelection, true)
    return () => {
      document.removeEventListener("selectionchange", onSelection)
      window.removeEventListener("scroll", onSelection, true)
    }
  }, [])

  if (!anchor || !picked) return null

  const quoted = `"${picked.slice(0, 400)}${picked.length > 400 ? "…" : ""}"`

  return (
    <div
      ref={barRef}
      className="pointer-events-auto fixed z-50 flex items-center gap-0.5 rounded-full bg-surface p-1 shadow-overlay"
      style={{
        left: anchor.x,
        top: anchor.y,
        transform: "translateX(-50%)",
        animation: "pop-in 180ms cubic-bezier(0.23,1,0.32,1) both",
      }}
    >
      {ACTIONS.map((action) => (
        <button
          key={action.key}
          type="button"
          className={control}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            insertComposerText(`${action.prefix}${quoted}`, { replace: true })
            window.getSelection()?.removeAllRanges()
            setAnchor(null)
          }}
        >
          {action.label}
        </button>
      ))}
      <button
        type="button"
        className={primary}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => {
          insertComposerText(picked, { replace: true })
          window.getSelection()?.removeAllRanges()
          setAnchor(null)
        }}
      >
        Send
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 19V5M5 12l7-7 7 7" />
        </svg>
      </button>
    </div>
  )
}
