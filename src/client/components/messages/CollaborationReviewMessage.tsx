import { CheckCircle2, CircleAlert } from "lucide-react"
import { Button } from "../ui/button"
import { useTranscriptRenderOptions } from "./render-context"

export function CollaborationReviewMessage({
  message,
}: {
  message: { verdict: "pass" | "fail"; summary: string }
}) {
  const { readonly, onCollaborationRetry } = useTranscriptRenderOptions()
  const passed = message.verdict === "pass"
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-2">
      <div className={`rounded-xl border px-4 py-3 text-sm ${
        passed
          ? "border-emerald-500/30 bg-emerald-500/10"
          : "border-amber-500/30 bg-amber-500/10"
      }`}
      >
        <div className="flex items-center gap-2 font-medium">
          {passed
            ? <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            : <CircleAlert className="h-4 w-4 text-amber-500" />}
          {passed ? "验收通过" : "验收未通过"}
        </div>
        <pre className="mt-2 whitespace-pre-wrap font-sans text-xs leading-5 text-foreground/90">
          {message.summary}
        </pre>
        {!passed && !readonly && onCollaborationRetry ? (
          <Button
            type="button"
            size="sm"
            className="mt-3"
            onClick={() => onCollaborationRetry(message.summary)}
          >
            按意见再改
          </Button>
        ) : null}
      </div>
    </div>
  )
}
