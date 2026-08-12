import { useEffect, useRef, useState } from "react"
import { Brain, ChevronRight, LoaderCircle } from "lucide-react"
import type { ProcessedThinkingMessage } from "./types"
import { AssistantReplyHeader, type AssistantModelIdentity } from "./AssistantReplyHeader"
import { TranscriptMarkdown } from "./shared"
import { cn } from "../../lib/utils"

interface Props {
  message: ProcessedThinkingMessage
  model?: AssistantModelIdentity
  /**
   * 思考条目是目前最后一条消息（正文还没到）——渲染为「思考中…」，
   * 正文到达后自动切换为可折叠的思考过程卡片。
   */
  isLatest?: boolean
}

export function ThinkingMessage({ message, model, isLatest = false }: Props) {
  const [open, setOpen] = useState(false)
  // 思考中卡片内部是独立滚动容器：内容每 ~180ms 增长一次，不跟随的话用户
  // 只能看到第一屏，长思考就得手动往下拉。内容更新时钉在底部，和 Claude
  // 的思考流表现一致。
  const streamBoxRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const box = streamBoxRef.current
    if (box) box.scrollTop = box.scrollHeight
  }, [message.text])

  return (
    <div className="flex flex-col gap-1.5">
      <AssistantReplyHeader model={model} />
      {isLatest ? (
        message.text ? (
          <div className="overflow-hidden rounded-lg border border-border/70 bg-muted/40">
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-muted-foreground">
              <LoaderCircle className="h-3.5 w-3.5 shrink-0 animate-spin" />
              <span className="font-medium">思考中…</span>
              <span className="ml-auto text-[10px] opacity-60">正在生成</span>
            </div>
            <div
              ref={streamBoxRef}
              className="max-h-48 overflow-y-auto border-t border-border/70 px-3 py-2 text-sm text-muted-foreground prose prose-sm dark:prose-invert"
            >
              {/* 流式阶段用纯文本：思考增量每 ~180ms 来一次，markdown 全量
                  重渲染会把整个思考文本每帧解析一遍，长思考会卡。等思考
                  结束折叠成卡片时再一次性渲染 markdown。 */}
              <div className="whitespace-pre-wrap break-words">{message.text}</div>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
            <span>思考中…</span>
          </div>
        )
      ) : (
        <div className="overflow-hidden rounded-lg border border-border/70 bg-muted/40">
          <button
            onClick={() => setOpen(!open)}
            className="flex w-full cursor-pointer items-center gap-1.5 px-2.5 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:bg-muted/60"
          >
            <ChevronRight className={cn("h-3.5 w-3.5 shrink-0 transition-transform duration-200", open && "rotate-90")} />
            <Brain className="h-3.5 w-3.5 shrink-0 text-logo" />
            <span className="font-medium">思考过程</span>
            <span className="ml-auto opacity-60">{open ? "收起" : "展开"}</span>
          </button>
          {open && (
            <div className="max-w-none border-t border-border/70 px-3 py-2 text-sm text-muted-foreground prose prose-sm dark:prose-invert">
              <TranscriptMarkdown text={message.text} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
