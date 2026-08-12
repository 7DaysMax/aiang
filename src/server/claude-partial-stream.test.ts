import { describe, expect, test } from "bun:test"
import { PartialAssistantAccumulator } from "./claude-partial-stream"
import type { TranscriptEntry } from "../shared/types"

function thinkingEntry(text: string): TranscriptEntry {
  return { _id: "t", createdAt: 0, kind: "thinking", text } as TranscriptEntry
}

describe("PartialAssistantAccumulator", () => {
  test("accumulates thinking deltas into throttled partial entries", () => {
    let clock = 0
    const acc = new PartialAssistantAccumulator(() => clock)
    acc.messageId = "m1"
    acc.onStreamEvent({ type: "message_start" })
    acc.onStreamEvent({ type: "content_block_start", index: 0, content_block: { type: "thinking" } })

    // 节流窗口内（180ms）只累积不推送。
    let entries = acc.onStreamEvent({
      type: "content_block_delta",
      index: 0,
      delta: { type: "thinking_delta", thinking: "先分析" },
    })
    expect(entries).toHaveLength(0)

    clock = 200
    entries = acc.onStreamEvent({
      type: "content_block_delta",
      index: 0,
      delta: { type: "thinking_delta", thinking: "需求" },
    })
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({ kind: "thinking", messageId: "m1", text: "先分析需求" })
  })

  test("flushes the final chunk at content_block_stop and resets at message_stop", () => {
    let clock = 0
    const acc = new PartialAssistantAccumulator(() => clock)
    acc.messageId = "m2"
    acc.onStreamEvent({ type: "message_start" })
    acc.onStreamEvent({ type: "content_block_start", index: 0, content_block: { type: "text" } })
    acc.onStreamEvent({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "你好" } })

    const stop = acc.onStreamEvent({ type: "content_block_stop", index: 0 })
    expect(stop).toHaveLength(1)
    expect(stop[0]).toMatchObject({ kind: "assistant_text", messageId: "m2", text: "你好" })

    const end = acc.onStreamEvent({ type: "message_stop" })
    expect(end).toHaveLength(0)
    // message_stop 后状态重置：下一条消息窗口不受影响。
    expect(acc.shouldSkip(thinkingEntry("x"))).toBe(false)
  })

  test("tool_use blocks accumulate input json without emitting", () => {
    let clock = 0
    const acc = new PartialAssistantAccumulator(() => clock)
    acc.messageId = "m3"
    acc.onStreamEvent({ type: "message_start" })
    acc.onStreamEvent({
      type: "content_block_start",
      index: 0,
      content_block: { type: "tool_use", name: "Bash", id: "call_1" },
    })
    clock = 500
    const entries = acc.onStreamEvent({
      type: "content_block_delta",
      index: 0,
      delta: { type: "input_json_delta", partial_json: "{\"command\":\"ls\"}" },
    })
    expect(entries).toHaveLength(0)
    const stop = acc.onStreamEvent({ type: "content_block_stop", index: 0 })
    expect(stop).toHaveLength(0)
  })

  test("does not re-emit identical text at content_block_stop", () => {
    let clock = 0
    const acc = new PartialAssistantAccumulator(() => clock)
    acc.messageId = "m5"
    acc.onStreamEvent({ type: "message_start" })
    acc.onStreamEvent({ type: "content_block_start", index: 0, content_block: { type: "thinking" } })
    // 节流窗口过了，delta 直接推送全文。
    clock = 200
    const delta = acc.onStreamEvent({
      type: "content_block_delta",
      index: 0,
      delta: { type: "thinking_delta", thinking: "完整思考" },
    })
    expect(delta).toHaveLength(1)
    // 没有新增内容，block_stop 不应补发重复文本。
    const stop = acc.onStreamEvent({ type: "content_block_stop", index: 0 })
    expect(stop).toHaveLength(0)
  })

  test("emits only the delta after the first flush, not the full accumulated text", () => {
    let clock = 0
    const acc = new PartialAssistantAccumulator(() => clock)
    acc.messageId = "m6"
    acc.onStreamEvent({ type: "message_start" })
    acc.onStreamEvent({ type: "content_block_start", index: 0, content_block: { type: "thinking" } })

    // 第一次推送的是首段（此前没有发过，整段都是增量）。
    clock = 200
    let entries = acc.onStreamEvent({
      type: "content_block_delta",
      index: 0,
      delta: { type: "thinking_delta", thinking: "第一段" },
    })
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({ kind: "thinking", messageId: "m6", text: "第一段" })

    // 第二次只推新增部分：客户端按 messageId 追加合并，推全文会二次方膨胀。
    clock = 400
    entries = acc.onStreamEvent({
      type: "content_block_delta",
      index: 0,
      delta: { type: "thinking_delta", thinking: "第二段" },
    })
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({ kind: "thinking", messageId: "m6", text: "第二段" })

    // 收尾不再补发已推过的文本。
    const stop = acc.onStreamEvent({ type: "content_block_stop", index: 0 })
    expect(stop).toHaveLength(0)
  })

  test("shouldSkip suppresses the duplicate full assistant content only for what streamed", () => {
    let clock = 0
    const acc = new PartialAssistantAccumulator(() => clock)
    acc.messageId = "m4"
    acc.onStreamEvent({ type: "message_start" })
    acc.onStreamEvent({ type: "content_block_start", index: 0, content_block: { type: "thinking" } })
    acc.onStreamEvent({ type: "content_block_delta", index: 0, delta: { type: "thinking_delta", thinking: "t" } })
    acc.onStreamEvent({ type: "content_block_stop", index: 0 })

    expect(acc.shouldSkip(thinkingEntry("t"))).toBe(true)
    // 工具调用没有流式推送过，完整 assistant 消息里的 tool_use 不应被跳过。
    expect(acc.shouldSkip({ _id: "c", createdAt: 0, kind: "tool_call", tool: {} } as unknown as TranscriptEntry)).toBe(false)
  })
})
