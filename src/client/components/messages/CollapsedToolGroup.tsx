import { useMemo } from "react"
import { ToolCallMessage } from "./ToolCallMessage"
import { useToolPayloadPrefetch } from "./tool-payload-context"
import { Shimmer } from "@/components/atoms/Shimmer"
import { LiveDiffChips } from "@/components/primitives/ToolChips"
import { collectToolDiffChips } from "./toolChipPresentation"
import type { ProcessedToolCall } from "./types"
import type { HydratedTranscriptMessage } from "../../../shared/types"

interface Props {
  messages: HydratedTranscriptMessage[]
  isLoading: boolean
  localPath?: string | null
  expanded: boolean
  onExpandedChange: (next: boolean) => void
}

export function CollapsedToolGroup({ messages, isLoading, localPath, expanded, onExpandedChange }: Props) {
  const tools = messages as ProcessedToolCall[]
  const anyInProgress = tools.some((message) => message.resultEntryId === undefined)
  const showLoadingState = anyInProgress && isLoading
  const label = `${messages.length} 次工具调用`
  const diffs = useMemo(() => collectToolDiffChips(tools), [tools])

  const prefetchPayloads = useToolPayloadPrefetch()
  const prefetchGroupPayloads = () => {
    const entryIds: Array<string | undefined> = []
    for (const message of tools) {
      if (message.inputTrimmed) entryIds.push(message.id)
      if (message.resultTrimmed) entryIds.push(message.resultEntryId)
    }
    if (entryIds.length > 0) prefetchPayloads(entryIds)
  }

  return (
    <div className="w-full pb-1" onPointerEnter={prefetchGroupPayloads}>
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => onExpandedChange(!expanded)}
        className="-mx-1.5 flex w-fit items-center gap-1.5 rounded-control px-1.5 py-1 text-[12.5px] text-ink-2 transition-colors duration-100 hover:bg-hover-2"
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="transition-transform duration-200"
          style={{ transform: expanded ? "rotate(0deg)" : "rotate(-90deg)" }}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
        {showLoadingState ? (
          <Shimmer className="text-[12.5px] tabular-nums">{label}</Shimmer>
        ) : (
          <span className="tabular-nums">{label}</span>
        )}
      </button>
      <div
        className="grid transition-[grid-template-rows,opacity] duration-300"
        style={{
          gridTemplateRows: expanded ? "1fr" : "0fr",
          opacity: expanded ? 1 : 0,
        }}
      >
        <div className="-mx-1 overflow-hidden px-1.5 pb-1">
          {expanded ? (
            <>
              <div className="mt-1.5 flex flex-col gap-1">
                {tools.map((message) => (
                  <ToolCallMessage
                    key={message.id}
                    message={message}
                    isLoading={isLoading}
                    localPath={localPath}
                  />
                ))}
              </div>
              <LiveDiffChips files={diffs} maxVisible={5} />
              {messages.length > 5 ? (
                <button
                  type="button"
                  onClick={() => onExpandedChange(false)}
                  className="mt-1 -mx-1.5 flex w-fit items-center gap-1.5 rounded-control px-1.5 py-1 text-[12px] text-ink-3 transition-colors hover:bg-hover-2 hover:text-ink-2"
                >
                  收起
                </button>
              ) : null}
            </>
          ) : null}
        </div>
      </div>
    </div>
  )
}
