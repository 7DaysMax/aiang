import { useEffect, useRef } from "react"
import type { ProcessedThinkingMessage } from "./types"
import { AssistantReplyHeader, type AssistantModelIdentity } from "./AssistantReplyHeader"
import { ThinkingTrace } from "../bui/ThinkingTrace"
import { StreamText } from "../bui/atoms/StreamText"

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
}

function ThinkingBody({ text, working }: { text: string; working: boolean }) {
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
            <span className="min-w-0 whitespace-pre-wrap leading-relaxed text-[12.5px] text-ink-2">
              {working && isLast ? (
                <StreamText text={paragraph} streaming charsPerTick={4} tickMs={8} />
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

export function ThinkingMessage({ message, model, isLatest = false, streaming }: Props) {
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
      <AssistantReplyHeader model={model} />
      <ThinkingTrace
        working={working}
        title="思考中"
        doneTitle="思考过程"
        meta={charCount > 0 ? `${charCount} 字` : working ? "正在生成" : undefined}
        defaultOpen
      >
        {working ? (
          <div ref={streamBoxRef} className="max-h-44 overflow-y-auto">
            <ThinkingBody text={message.text} working />
          </div>
        ) : (
          <ThinkingBody text={message.text} working={false} />
        )}
      </ThinkingTrace>
    </div>
  )
}
