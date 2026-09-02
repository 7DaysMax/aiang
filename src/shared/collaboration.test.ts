import { describe, expect, test } from "bun:test"
import {
  buildCollaborationRetryPrompt,
  engineSupportsCollaboration,
  parseCollaborationVerdict,
} from "./collaboration"
import type { TranscriptEntry } from "./types"

function entry(partial: object): TranscriptEntry {
  return {
    _id: crypto.randomUUID(),
    createdAt: Date.now(),
    ...partial,
  } as TranscriptEntry
}

describe("collaboration helpers", () => {
  test("Cursor is excluded; every other engine can collaborate", () => {
    expect(engineSupportsCollaboration("cursor")).toBe(false)
    expect(engineSupportsCollaboration("claude")).toBe(true)
    expect(engineSupportsCollaboration("codex")).toBe(true)
    expect(engineSupportsCollaboration("youmi")).toBe(true)
    expect(engineSupportsCollaboration("deepseek")).toBe(true)
    expect(engineSupportsCollaboration("reasonix")).toBe(true)
    expect(engineSupportsCollaboration("pi")).toBe(true)
  })

  test("reads PASS/FAIL from the last assistant cluster, not the implement turn", () => {
    const failed = parseCollaborationVerdict([
      entry({ kind: "user_prompt", content: "加一个按钮" }),
      entry({ kind: "assistant_text", text: "PASS\n我先实现。" }),
      entry({ kind: "result", subtype: "success", isError: false, durationMs: 10, result: "" }),
      entry({ kind: "assistant_text", text: "FAIL\nsrc/button.tsx 没接 onClick" }),
      entry({ kind: "result", subtype: "success", isError: false, durationMs: 4, result: "" }),
    ])
    expect(failed.pass).toBe(false)
    expect(failed.summary).toContain("没接 onClick")

    const passed = parseCollaborationVerdict([
      entry({ kind: "user_prompt", content: "加一个按钮" }),
      entry({ kind: "assistant_text", text: "改完了" }),
      entry({ kind: "result", subtype: "success", isError: false, durationMs: 10, result: "" }),
      entry({ kind: "assistant_text", text: "PASS\n按钮和测试都在。" }),
    ])
    expect(passed.pass).toBe(true)
    expect(passed.summary).toContain("按钮和测试都在")
  })

  test("finds a verdict line even if the model wrote a preface first", () => {
    const verdict = parseCollaborationVerdict([
      entry({ kind: "assistant_text", text: "对照任务看了一遍。\nFAIL\n缺测试" }),
    ])
    expect(verdict.pass).toBe(false)
    expect(verdict.summary).toContain("缺测试")
  })

  test("parses PASS/FAIL split across streamed delta entries", () => {
    // 流式输出把同一段文本拆成多个 assistant_text 增量条目，"PASS" 会
    // 变成 "P" + "ASS" 落在不同 entry，join 后是 "P\n\nASS"。
    const passed = parseCollaborationVerdict([
      entry({ kind: "user_prompt", content: "加按钮" }),
      entry({ kind: "assistant_text", text: "P" }),
      entry({ kind: "assistant_text", text: "ASS" }),
      entry({ kind: "assistant_text", text: "验收依据：按钮已加" }),
      entry({ kind: "result", subtype: "success", isError: false, durationMs: 4, result: "" }),
    ])
    expect(passed.pass).toBe(true)
    expect(passed.summary).toContain("验收依据")

    const failed = parseCollaborationVerdict([
      entry({ kind: "assistant_text", text: "F" }),
      entry({ kind: "assistant_text", text: "AIL" }),
      entry({ kind: "assistant_text", text: "缺测试" }),
    ])
    expect(failed.pass).toBe(false)
    expect(failed.summary).toContain("缺测试")
  })

  test("keeps the verdict before a whitespace-only streamed delta", () => {
    const passed = parseCollaborationVerdict([
      entry({ kind: "assistant_text", messageId: "review-1", text: "PASS" }),
      entry({ kind: "assistant_text", messageId: "review-1", text: "\n\n" }),
      entry({ kind: "assistant_text", messageId: "review-1", text: "输出与要求一致。" }),
      entry({ kind: "result", subtype: "success", isError: false, durationMs: 4, result: "" }),
    ])

    expect(passed.pass).toBe(true)
    expect(passed.summary).toStartWith("PASS")
  })

  test("treats a missing verdict as pass with an explicit note", () => {
    // 验收回合没有产出文本（只 thinking 或流中断）：无意见 = 没有发现必须
    // 改的问题，应视为通过；占位文案不能被当作 FAIL 意见继续发给实现者。
    const verdict = parseCollaborationVerdict([
      entry({ kind: "result", subtype: "success", isError: false, durationMs: 1, result: "" }),
    ])
    expect(verdict.pass).toBe(true)
    expect(verdict.summary).toContain("没有写出结论")
  })

  test("retry prompt keeps the review notes and asks to stay scoped", () => {
    const prompt = buildCollaborationRetryPrompt("FAIL\nsrc/a.ts 缺导出")
    expect(prompt).toContain("只修列出的问题")
    expect(prompt).toContain("src/a.ts 缺导出")
  })
})
