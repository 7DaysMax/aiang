import { useState } from "react"
import { MessageCircleQuestion } from "lucide-react"
import type { ProcessedToolCall, AskUserQuestionItem } from "./types"
import type { AskUserQuestionAnswerMap } from "../../../shared/types"
import { useTranscriptRenderOptions } from "./render-context"
import ApprovalCard from "@/components/primitives/ApprovalCard"

interface Props {
  message: Extract<ProcessedToolCall, { toolKind: "ask_user_question" }>
  onSubmit: (toolUseId: string, questions: AskUserQuestionItem[], answers: AskUserQuestionAnswerMap) => void
  isLatest: boolean
}

function getQuestionKey(question: AskUserQuestionItem): string {
  return question.id || question.question
}

function parseAnswersFromResult(
  result: Extract<ProcessedToolCall, { toolKind: "ask_user_question" }>["result"]
): AskUserQuestionAnswerMap | undefined {
  return result?.answers
}

export function AskUserQuestionMessage({ message, onSubmit, isLatest }: Props) {
  const renderOptions = useTranscriptRenderOptions()
  const questions = message.input.questions
  const isComplete = !!message.result
  const savedAnswers = parseAnswersFromResult(message.result)
  const isDiscarded = message.result?.discarded === true
  const [submittedAnswers, setSubmittedAnswers] = useState<AskUserQuestionAnswerMap | null>(savedAnswers ?? null)
  const [isSubmitted, setIsSubmitted] = useState(isComplete)

  const handleSubmit = (answers: Record<string, string[]>) => {
    const finalAnswers: AskUserQuestionAnswerMap = {}
    for (const question of questions) {
      const key = getQuestionKey(question)
      finalAnswers[key] = answers[key] ?? []
    }
    setSubmittedAnswers(finalAnswers)
    setIsSubmitted(true)
    onSubmit(message.toolId, questions, finalAnswers)
  }

  if (isSubmitted || isComplete) {
    const displayAnswers = savedAnswers || submittedAnswers || {}
    return (
      <div className="flex w-full items-center gap-3" style={{ animation: "pop-in 260ms cubic-bezier(0.23,1,0.32,1) both" }}>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-green-tint py-1 pr-2.5 pl-1 text-[12.5px] font-medium text-green">
          <span className="flex size-4.5 items-center justify-center rounded-full bg-green text-white">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
          </span>
          {isDiscarded ? "Discarded" : "Answers sent"}
        </span>
        <span className="min-w-0 truncate text-[12.5px] text-ink-2">
          {questions.map((question) => (displayAnswers[getQuestionKey(question)] ?? []).join(", ")).filter(Boolean).join(" · ")}
        </span>
      </div>
    )
  }

  if (renderOptions.readonly) {
    return (
      <div className="w-full overflow-hidden rounded-card bg-surface shadow-card">
        <div className="primitive-card-bar border-b border-line text-[12.5px] font-medium text-ink">Awaiting response</div>
        {questions.map((question) => (
          <div key={getQuestionKey(question)} className="border-b border-line px-3.5 py-2.5 last:border-0">
            <div className="text-[13px] text-ink">{question.question}</div>
            <div className="mt-0.5 text-[12px] text-ink-3">{question.options?.map((option) => option.label).join(", ") || "Freeform"}</div>
          </div>
        ))}
      </div>
    )
  }

  if (!isLatest) {
    return (
      <div className="flex items-center gap-2 py-2">
        <MessageCircleQuestion className="h-4 w-4 text-ink-3" />
        <span className="text-[13px] text-ink-3">Questions pending</span>
      </div>
    )
  }

  return (
    <ApprovalCard
      questions={questions.map((question) => ({
        key: getQuestionKey(question),
        question: question.question,
        multiSelect: question.multiSelect,
        options: question.options ?? [],
      }))}
      onSubmit={handleSubmit}
    />
  )
}
