import type { ProcessedTextMessage } from "./types"
import { TranscriptMarkdown } from "./shared"
import { LiveStreamingText } from "@/components/primitives/StreamingText"

interface Props {
  message: ProcessedTextMessage
  streaming?: boolean
  retryPrompt?: string
  showActions?: boolean
}

export function TextMessage({ message, streaming = false, retryPrompt, showActions = true }: Props) {
  return (
    <div className="text-pretty prose prose-sm dark:prose-invert px-0.5 w-full max-w-full space-y-4">
      <LiveStreamingText text={message.text} streaming={streaming} retryPrompt={retryPrompt} showActions={showActions}>
        {message.text ? <TranscriptMarkdown text={message.text} streaming={streaming} /> : streaming ? <span className="stream-caret is-streaming" aria-hidden /> : null}
      </LiveStreamingText>
    </div>
  )
}
