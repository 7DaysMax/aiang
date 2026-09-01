import type { ProcessedTextMessage } from "./types"
import { TranscriptMarkdown } from "./shared"
import { AnswerActions } from "../bui/AnswerActions"

interface Props {
  message: ProcessedTextMessage
  streaming?: boolean
  retryPrompt?: string
}

export function TextMessage({ message, streaming = false, retryPrompt }: Props) {
  return (
    <div className="text-pretty prose prose-sm dark:prose-invert px-0.5 w-full max-w-full space-y-4">
      {message.text ? (
        <TranscriptMarkdown text={message.text} streaming={streaming} />
      ) : streaming ? (
        <span className="stream-caret is-streaming" aria-hidden />
      ) : null}
      <AnswerActions text={message.text} streaming={streaming} retryPrompt={retryPrompt} />
    </div>
  )
}
