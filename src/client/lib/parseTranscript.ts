import { hydrateToolResult } from "../../shared/tools"
import type { HydratedToolCall, HydratedTranscriptMessage, NormalizedToolCall, TranscriptEntry } from "../../shared/types"

function createTimestamp(createdAt: number): string {
  return new Date(createdAt).toISOString()
}

function createBaseMessage(entry: TranscriptEntry) {
  return {
    id: entry._id,
    messageId: entry.messageId,
    timestamp: createTimestamp(entry.createdAt),
    hidden: entry.hidden,
  }
}

function hydrateToolCall(entry: Extract<TranscriptEntry, { kind: "tool_call" }>): HydratedToolCall {
  return {
    id: entry._id,
    messageId: entry.messageId,
    hidden: entry.hidden,
    kind: "tool",
    toolKind: entry.tool.toolKind,
    toolName: entry.tool.toolName,
    toolId: entry.tool.toolId,
    input: entry.tool.input as HydratedToolCall["input"],
    inputTrimmed: entry.trimmed,
    timestamp: createTimestamp(entry.createdAt),
  } as HydratedToolCall
}

/**
 * The structured result for the two tool kinds that need it.
 *
 * `structuredResult` is lifted server-side out of `debugRaw`. The `debugRaw`
 * fallback covers entries served by an older server that still shipped the raw
 * payload inline.
 */
function getStructuredToolResult(entry: Extract<TranscriptEntry, { kind: "tool_result" }>): unknown {
  if (entry.structuredResult !== undefined) return entry.structuredResult
  if (!entry.debugRaw) return undefined

  try {
    const parsed = JSON.parse(entry.debugRaw) as { tool_use_result?: unknown }
    return parsed.tool_use_result
  } catch {
    return undefined
  }
}

/**
 * 合并同一 messageId 的连续思考/正文条目：ccb 的流式部分消息（thinking/
 * assistant_text 增量）共享同一个 messageId，只有合并起来才是一条完整消息，
 * 否则每个 token 增量都会渲染成独立卡片。
 *
 * Cursor 的 cursor-agent 思考增量历史上没有 messageId，连续的 thinking
 * 碎片也按同一段推理合并（否则会出现十几张各十几字的「思考过程」卡片）。
 */
function canMergeTextEntries(
  previous: HydratedTranscriptMessage | undefined,
  next: Extract<HydratedTranscriptMessage, { kind: "assistant_text" | "assistant_thinking" }>,
): previous is Extract<HydratedTranscriptMessage, { kind: "assistant_text" | "assistant_thinking" }> {
  if (!previous || previous.kind !== next.kind) return false
  if (previous.messageId && next.messageId) return previous.messageId === next.messageId
  return next.kind === "assistant_thinking" && !previous.messageId && !next.messageId
}

function pushOrMergeTextEntry(
  messages: HydratedTranscriptMessage[],
  next: Extract<HydratedTranscriptMessage, { kind: "assistant_text" | "assistant_thinking" }>,
) {
  const previous = messages[messages.length - 1]
  if (canMergeTextEntries(previous, next)) {
    // 旧版流式推送的是「到当前为止的全文」快照：快照是前面内容的超集，
    // 用替换而不是追加，避免二次方膨胀；新版推增量，互不包含，追加语义不变。
    previous.text = next.text.startsWith(previous.text) ? next.text : previous.text + next.text
    return
  }
  messages.push(next)
}

export function processTranscriptMessages(entries: TranscriptEntry[]): HydratedTranscriptMessage[] {
  const pendingToolCalls = new Map<string, { hydrated: HydratedToolCall; normalized: NormalizedToolCall }>()
  const messages: HydratedTranscriptMessage[] = []

  for (const entry of entries) {
    switch (entry.kind) {
      case "user_prompt":
        messages.push({
          ...createBaseMessage(entry),
          kind: "user_prompt",
          content: entry.content,
          attachments: entry.attachments ?? [],
          steered: entry.steered,
        })
        break
      case "system_init":
        messages.push({
          ...createBaseMessage(entry),
          kind: "system_init",
          provider: entry.provider,
          model: entry.model,
          tools: entry.tools,
          agents: entry.agents,
          slashCommands: entry.slashCommands,
          mcpServers: entry.mcpServers,
          debugRaw: entry.debugRaw,
        })
        break
      case "account_info":
        messages.push({
          ...createBaseMessage(entry),
          kind: "account_info",
          accountInfo: entry.accountInfo,
        })
        break
      case "assistant_text":
        pushOrMergeTextEntry(messages, {
          ...createBaseMessage(entry),
          kind: "assistant_text",
          text: entry.text,
        })
        break
      case "thinking":
        pushOrMergeTextEntry(messages, {
          ...createBaseMessage(entry),
          kind: "assistant_thinking",
          text: entry.text,
        })
        break
      case "tool_call": {
        const toolCall = hydrateToolCall(entry)
        pendingToolCalls.set(entry.tool.toolId, { hydrated: toolCall, normalized: entry.tool })
        messages.push(toolCall)
        break
      }
      case "tool_result": {
        const pendingCall = pendingToolCalls.get(entry.toolId)
        if (pendingCall) {
          // Recorded whether or not the body came with it: this is what marks
          // the call finished, and what the expanded view fetches by.
          pendingCall.hydrated.isError = entry.isError
          pendingCall.hydrated.resultEntryId = entry._id
          pendingCall.hydrated.resultTimestamp = createTimestamp(entry.createdAt)
          pendingCall.hydrated.resultTrimmed = entry.trimmed

          // A trimmed result has no body to hydrate — the expanded view fetches
          // it and hydrates there, so nothing is derived from an absent payload.
          if (!entry.trimmed) {
            const rawResult = (
              pendingCall.normalized.toolKind === "ask_user_question" ||
              pendingCall.normalized.toolKind === "exit_plan_mode"
            )
              ? getStructuredToolResult(entry) ?? entry.content
              : entry.content

            pendingCall.hydrated.result = hydrateToolResult(pendingCall.normalized, rawResult) as never
            pendingCall.hydrated.rawResult = rawResult
          }
        }
        break
      }
      case "result":
        messages.push({
          ...createBaseMessage(entry),
          kind: "result",
          success: !entry.isError,
          cancelled: entry.subtype === "cancelled",
          result: entry.result,
          durationMs: entry.durationMs,
          costUsd: entry.costUsd,
        })
        break
      case "status":
        messages.push({
          ...createBaseMessage(entry),
          kind: "status",
          status: entry.status,
        })
        break
      case "context_window_updated":
        messages.push({
          ...createBaseMessage(entry),
          kind: "context_window_updated",
          usage: entry.usage,
        })
        break
      case "compact_boundary":
        messages.push({
          ...createBaseMessage(entry),
          kind: "compact_boundary",
        })
        break
      case "compact_summary":
        messages.push({
          ...createBaseMessage(entry),
          kind: "compact_summary",
          summary: entry.summary,
        })
        break
      case "context_cleared":
        messages.push({
          ...createBaseMessage(entry),
          kind: "context_cleared",
        })
        break
      case "handoff_boundary":
        messages.push({
          ...createBaseMessage(entry),
          kind: "handoff_boundary",
          fromProvider: entry.fromProvider,
          toProvider: entry.toProvider,
        })
        break
      case "collaboration_review":
        messages.push({
          ...createBaseMessage(entry),
          kind: "collaboration_review",
          verdict: entry.verdict,
          summary: entry.summary,
        })
        break
      case "session_restored":
        messages.push({
          ...createBaseMessage(entry),
          kind: "session_restored",
          provider: entry.provider,
        })
        break
      case "interrupted":
        messages.push({
          ...createBaseMessage(entry),
          kind: "interrupted",
        })
        break
      default:
        messages.push({
          ...createBaseMessage(entry),
          kind: "unknown",
          json: JSON.stringify(entry, null, 2),
        })
        break
    }
  }

  return messages
}
