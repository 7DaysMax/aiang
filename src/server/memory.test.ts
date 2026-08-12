import { describe, expect, test } from "bun:test"
import type { TranscriptEntry } from "../shared/types"
import { buildMemorySystemHint, buildMemoryText, loadMemorySystemHint, resetMemoryCacheForTests } from "./memory"

function entry(overrides: Partial<TranscriptEntry> & { kind: "user_prompt" | "assistant_text"; text?: string }): TranscriptEntry {
  return {
    id: "e1",
    timestamp: "2026-08-12T00:00:00.000Z",
    ...overrides,
  } as unknown as TranscriptEntry
}

describe("buildMemoryText", () => {
  test("returns empty for no chats", () => {
    expect(buildMemoryText([])).toBe("")
  })

  test("picks user and assistant lines, newest first", () => {
    const text = buildMemoryText([
      {
        title: "修 bug",
        entries: [
          entry({ kind: "user_prompt", content: "帮我看看 ws 为什么挂了" }),
          entry({ kind: "assistant_text", text: "找到原因：端口被占用，已重启" }),
        ],
      },
    ])

    expect(text).toContain("[会话] 修 bug")
    expect(text).toContain("用户：帮我看看 ws 为什么挂了")
    expect(text).toContain("助手：找到原因：端口被占用，已重启")
  })

  test("skips hidden entries and caps the number of chats", () => {
    const chats = [1, 2, 3].map((n) => ({
      title: `chat-${n}`,
      entries: [
        entry({ kind: "user_prompt", content: `问题 ${n}`, hidden: true }),
        entry({ kind: "user_prompt", content: `实际内容 ${n}` }),
      ],
    }))

    const text = buildMemoryText(chats, 2)
    expect(text).toContain("chat-1")
    expect(text).toContain("chat-2")
    expect(text).not.toContain("chat-3")
    expect(text).not.toContain("问题 1")
  })

  test("truncates long lines", () => {
    const long = "字".repeat(1000)
    const text = buildMemoryText([{ title: "t", entries: [entry({ kind: "user_prompt", content: long })] }])
    expect(text.length).toBeLessThan(800)
    expect(text).toContain("…")
  })
})

describe("buildMemorySystemHint", () => {
  test("returns empty string for empty memory", () => {
    expect(buildMemorySystemHint("")).toBe("")
    expect(buildMemorySystemHint("   ")).toBe("")
  })

  test("wraps memory in a system-message block", () => {
    const hint = buildMemorySystemHint("[会话] 修 bug\n用户：…")
    expect(hint).toContain("<system-message>")
    expect(hint).toContain("历史对话记忆")
    expect(hint).toContain("[会话] 修 bug")
    expect(hint).toContain("</system-message>")
  })
})

describe("loadMemorySystemHint", () => {
  test("returns empty when the feature is disabled", async () => {
    resetMemoryCacheForTests()
    const hint = await loadMemorySystemHint({
      listProjects: () => [],
      listChatsByProject: () => [],
      getMessages: () => [],
    })
    expect(hint).toBe("")
  })
})
