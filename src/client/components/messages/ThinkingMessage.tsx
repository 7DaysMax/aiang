import { useEffect, useRef } from "react"
import type { ProcessedThinkingMessage } from "./types"
import { AssistantReplyHeader, type AssistantModelIdentity } from "./AssistantReplyHeader"
import { StreamText } from "@/components/atoms/StreamText"
import ThinkingState from "@/components/primitives/ThinkingState"
import { DEFAULT_BEAUTIFUL_UI_PREFERENCES, type BeautifulUiThinkingVariant } from "@/shared/types"
import { useAppSettingsStore } from "../../stores/appSettingsStore"

interface Props {
  message: ProcessedThinkingMessage
  model?: AssistantModelIdentity
  /**
   * 思考条目是目前这一轮还没被正文/下一段思考收掉的开放条目。
   * 未传 `streaming` 时回退为「思考中」——方便单测。
   */
  isLatest?: boolean
  /** 会话仍在生成，且这条思考还是开放的。 */
  streaming?: boolean
  /** 同一用户回合只在第一段助手内容上显示一次模型身份。 */
  showHeader?: boolean
}

function VariantMarker({ variant, done }: { variant: BeautifulUiThinkingVariant; done: boolean }) {
  if (variant === "Reasoning") return null
  if (variant === "Search") {
    return <span aria-hidden className="mt-1.5 size-2 shrink-0 rounded-full bg-accent" />
  }
  if (variant === "Coding") {
    return <span aria-hidden className="mt-0.5 shrink-0 font-mono text-[11px] text-ink-3">&gt;_</span>
  }
  return done ? (
    <svg aria-hidden className="mt-0.5 size-3.5 shrink-0 text-ink-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="m5 12 4 4L19 6" /></svg>
  ) : (
    <span aria-hidden className="mt-1 size-3 shrink-0 rounded-full border-[1.5px] border-line-strong border-t-ink-2 animate-spin" />
  )
}

function ThinkingBody({ text, working, variant }: { text: string; working: boolean; variant: BeautifulUiThinkingVariant }) {
  const paragraphs = text.split(/\n\n+/).filter((paragraph) => paragraph.trim().length > 0)
  if (paragraphs.length === 0) {
    return working ? <span className="stream-caret is-streaming" aria-hidden /> : null
  }

  return (
    <>
      {paragraphs.map((paragraph, index) => {
        const isLast = index === paragraphs.length - 1
        return (
          <div
            key={index}
            className="flex min-h-7 w-full items-start gap-2 rounded-[6px] px-1.5 py-0.5"
            style={{ animation: `fade-up 320ms cubic-bezier(0.23,1,0.32,1) ${index * 80}ms both` }}
          >
            <VariantMarker variant={variant} done={!working || !isLast} />
            <span className="min-w-0 whitespace-pre-wrap leading-relaxed text-[12.5px] text-ink-2">
              {working && isLast ? (
                <StreamText text={paragraph} live />
              ) : (
                paragraph
              )}
            </span>
          </div>
        )
      })}
    </>
  )
}

export function ThinkingMessage({ message, model, isLatest = false, streaming, showHeader = true }: Props) {
  const variant = useAppSettingsStore(
    (store) => store.settings?.beautifulUi?.thinking ?? DEFAULT_BEAUTIFUL_UI_PREFERENCES.thinking,
  )
  // 思考中卡片内部是独立滚动容器：内容每 ~180ms 增长一次，不跟随的话用户
  // 只能看到第一屏，长思考就得手动往下拉。内容更新时钉在底部，和 Claude
  // 的思考流表现一致。
  const streamBoxRef = useRef<HTMLDivElement | null>(null)
  const working = streaming ?? isLatest

  useEffect(() => {
    const box = streamBoxRef.current
    if (box) box.scrollTop = box.scrollHeight
  }, [message.text])

  const charCount = message.text.trim().length

  return (
    <div className="flex flex-col gap-1.5">
      {showHeader ? <AssistantReplyHeader model={model} /> : null}
      <ThinkingState
        variant={variant}
        working={working}
        activeLabel="思考中"
        doneLabel="思考过程"
        meta={charCount > 0 ? `${charCount} 字` : working ? "正在生成" : undefined}
        defaultExpanded={working}
        compact
      >
        {working ? (
          <div ref={streamBoxRef} className="max-h-44 overflow-y-auto">
            <ThinkingBody text={message.text} working variant={variant} />
          </div>
        ) : (
          <ThinkingBody text={message.text} working={false} variant={variant} />
        )}
      </ThinkingState>
    </div>
  )
}
