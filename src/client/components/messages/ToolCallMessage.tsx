import { useMemo } from "react"
import type { ProcessedToolCall } from "./types"
import { useToolPayloadPrefetch } from "./tool-payload-context"
import { LiveToolChipRow } from "@/components/primitives/ToolChips"
import { getToolChipPresentation } from "./toolChipPresentation"

interface Props {
  message: ProcessedToolCall
  isLoading?: boolean
  localPath?: string | null
}

export function ToolCallMessage({ message, isLoading = false }: Props) {
  const hasResult = message.resultEntryId !== undefined
  const activityState: "pending" | "done" | "neutral" = !hasResult ? (isLoading ? "pending" : "neutral") : "done"
  const isPending = activityState === "pending"
  const durationMs = useMemo(() => {
    if (!hasResult || !message.resultTimestamp) return null
    const start = Date.parse(message.timestamp)
    const end = Date.parse(message.resultTimestamp)
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null
    return end - start
  }, [hasResult, message.resultTimestamp, message.timestamp])

  const presentation = useMemo(
    () => getToolChipPresentation(message, {
      pending: isPending,
      done: activityState === "done",
      durationMs,
      error: Boolean(message.isError),
    }),
    [activityState, durationMs, isPending, message],
  )

  const prefetchPayloads = useToolPayloadPrefetch()
  const prefetchOwnPayloads = () => {
    if (!message.inputTrimmed && !message.resultTrimmed) return
    prefetchPayloads([
      message.inputTrimmed ? message.id : undefined,
      message.resultTrimmed ? message.resultEntryId : undefined,
    ])
  }

  return (
    <div className="w-full" onPointerEnter={prefetchOwnPayloads}>
      <LiveToolChipRow
        icon={presentation.icon}
        label={presentation.label}
        chip={presentation.chip}
        chipMono={presentation.chipMono}
        detail={presentation.detail}
        detailMono={presentation.detailMono}
        pending={isPending}
        error={Boolean(message.isError)}
      />
    </div>
  )
}
