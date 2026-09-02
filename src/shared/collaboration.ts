import type { AgentProvider, TranscriptEntry } from "./types"

export const COLLABORATION_MAX_AUTO_REVIEWS = 2

export const COLLABORATION_REVIEW_PROMPT = `你现在是验收员，不是实现者。

对照用户最近一条真正的任务要求，检查刚才的改动是否完成。

规则：
- 不要继续实现新功能，不要大范围改代码。
- 需要验证时可以跑测试或只读检查。
- 第一行必须是单独的 \`PASS\` 或 \`FAIL\`。
- 若 FAIL，下面最多列 8 条具体问题（文件路径 + 缺什么）。
- 若 PASS，用一两句说明验收依据。`

export function engineSupportsCollaboration(provider: AgentProvider): boolean {
  return provider !== "cursor"
}

export function parseCollaborationVerdict(entries: TranscriptEntry[]): { pass: boolean; summary: string } {
  const texts: string[] = []
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i]
    if (!entry || entry.hidden) continue
    if (entry.kind === "assistant_text") {
      if (typeof entry.text === "string" && entry.text.trim()) {
        texts.unshift(entry.text.trim())
        if (texts.join("\n").length > 4000) break
      }
      // Codex commonly emits the separator after PASS/FAIL as its own
      // whitespace-only delta. It is still part of the same assistant stream;
      // treating it as a boundary drops the verdict token that precedes it.
      continue
    }
    if (entry.kind === "thinking") continue
    if (texts.length > 0) break
    if (
      entry.kind === "result"
      || entry.kind === "status"
      || entry.kind === "context_window_updated"
      || entry.kind === "compact_boundary"
    ) {
      continue
    }
    break
  }
  const summary = texts.join("\n\n").trim()
  if (!summary) {
    // 验收回合没有产出任何文本（只输出了 thinking，或流被中断）：
    // 没有意见 = 没有发现必须改的问题，视为通过；占位文案不能当 FAIL
    // 意见发给实现者（否则「按意见再改」会把无意义内容当任务继续做）。
    return { pass: true, summary: "（验收没有写出结论，视为通过）" }
  }
  // 流式输出把同一段文本拆成多个 assistant_text 增量条目（每个一小段），
  // "PASS" 会被拆成 "P" + "ASS" 落在不同 entry，join 后是 "P\n\nASS"，
  // 逐行匹配就丢了。把块内换行压平（"P ASS"）再从开头判定结论：
  // "P ASS" 压平后是 "P ASS"，去掉空格就是 "PASS"。summary 保留原始
  // 换行用于展示。
  const compact = summary.replace(/\s+/g, "")
  const pass = /^PASS/i.test(compact)
  return { pass, summary }
}

export function buildCollaborationRetryPrompt(summary: string): string {
  return [
    "按下面的验收意见继续改。只修列出的问题，不要扩大范围。改完再自测。",
    "",
    summary.trim(),
  ].join("\n")
}
