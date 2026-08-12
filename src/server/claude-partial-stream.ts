import type { TranscriptEntry } from "../shared/types"
import { timestamped } from "./transcript"

/** 部分条目节流间隔：思考/正文增量每 ~180ms 合并推一次，避免每个 token 一条。 */
export const PARTIAL_FLUSH_INTERVAL_MS = 180

type PartialBlockKind = "thinking" | "text" | "tool_use"

interface PartialBlock {
  type: PartialBlockKind
  text: string
  lastEmitAt: number
  /** 上次推送时的文本长度：没有新增内容时（stop/message_stop）不补发，避免重复。 */
  lastEmitLength: number
}

/**
 * 把 Claude Agent SDK 的 `stream_event`（includePartialMessages）增量
 * 累加成语义完整、节流后的部分 transcript 条目，让前端能像 Claude 一样
 * 实时看到思考/正文蹦出来，而不是盯着 Running 干等一个完整步骤。
 *
 * ccb 的 DeepSeek 通道把推理内容映射成 thinking 块、正文映射成 text 块，
 * 工具入参映射成 tool_use 块的 input_json_delta；思考/正文按块累积并按
 * 间隔推送，tool_use 只累积不推送（等完整 assistant 消息再出 tool_call）。
 *
 * 注意：ccb 在 message_stop 前还会补发完整的 assistant 消息（内容与
 * partial 相同），调用方用 shouldSkip() 跳过 thinking/text，避免重复。
 */
export class PartialAssistantAccumulator {
  private blocks = new Map<number, PartialBlock>()
  private streamedThinking = false
  private streamedText = false

  /** 当前消息窗口的 messageId（由调用方在 message_start 时设置）。 */
  messageId: string | undefined

  constructor(private readonly now: () => number = Date.now) {}

  /** 喂入一条 SDK `stream_event` 的原始 event，返回要推送的部分条目。 */
  onStreamEvent(event: Record<string, unknown>): TranscriptEntry[] {
    const entries: TranscriptEntry[] = []
    const eventType = typeof event.type === "string" ? event.type : ""
    const index = typeof event.index === "number" ? event.index : -1

    if (eventType === "message_start") {
      this.reset()
      return entries
    }

    if (eventType === "content_block_start") {
      const block = event.content_block as Record<string, unknown> | undefined
      const blockType = block?.type === "thinking" || block?.type === "text" || block?.type === "tool_use"
        ? block.type
        : null
      if (blockType && index >= 0) {
        this.blocks.set(index, { type: blockType, text: "", lastEmitAt: 0, lastEmitLength: 0 })
      }
      return entries
    }

    if (eventType === "content_block_delta") {
      const delta = event.delta as Record<string, unknown> | undefined
      const block = this.blocks.get(index)
      if (block) {
        if (delta?.type === "thinking_delta" && typeof delta.thinking === "string") block.text += delta.thinking
        else if (delta?.type === "text_delta" && typeof delta.text === "string") block.text += delta.text
        else if (block.type === "tool_use" && delta?.type === "input_json_delta" && typeof delta.partial_json === "string") {
          block.text += delta.partial_json
        }
        if ((block.type === "thinking" || block.type === "text") && block.text && this.now() - block.lastEmitAt >= PARTIAL_FLUSH_INTERVAL_MS) {
          this.flushDelta(entries, block)
        }
      }
      return entries
    }

    if (eventType === "content_block_stop") {
      const block = this.blocks.get(index)
      if (block) {
        if (block.type === "thinking" || block.type === "text") this.flushDelta(entries, block)
        this.blocks.delete(index)
      }
      return entries
    }

    if (eventType === "message_stop") {
      for (const block of this.blocks.values()) {
        if (block.type === "thinking" || block.type === "text") this.flushDelta(entries, block)
      }
      this.reset()
      return entries
    }

    return entries
  }

  /**
   * ccb 在 message_stop 前补发的完整 assistant 消息里，thinking/正文与
   * 已经流式推过的内容重复——返回 true 表示调用方应跳过该条目。
   */
  shouldSkip(entry: TranscriptEntry): boolean {
    if (entry.kind === "thinking") return this.streamedThinking
    if (entry.kind === "assistant_text") return this.streamedText
    return false
  }

  /**
   * 推送自上次推送以来的**增量**，不是全文：全文会被客户端按 messageId
   * 追加合并，每次都推全文会让合并后的文本按推送次数二次方膨胀（内容重复
   * N 份），前端渲染和内存都会爆。
   */
  private flushDelta(entries: TranscriptEntry[], block: PartialBlock) {
    const delta = block.text.slice(block.lastEmitLength)
    if (!delta) return
    block.lastEmitLength = block.text.length
    block.lastEmitAt = this.now()
    entries.push(this.buildEntry(block, delta))
  }

  private buildEntry(block: PartialBlock, delta: string): TranscriptEntry {
    if (block.type === "thinking") {
      this.streamedThinking = true
      return timestamped({ kind: "thinking", messageId: this.messageId, text: delta })
    }
    this.streamedText = true
    return timestamped({ kind: "assistant_text", messageId: this.messageId, text: delta })
  }

  private reset() {
    this.blocks.clear()
    this.streamedThinking = false
    this.streamedText = false
  }
}
