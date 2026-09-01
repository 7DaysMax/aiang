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
    if (entry.kind === "assistant_text" && typeof entry.text === "string" && entry.text.trim()) {
      texts.unshift(entry.text.trim())
      if (texts.join("\n").length > 4000) break
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
  const lines = summary.split(/\r?\n/)
  const verdictLine = lines.find((line) => /^\s*(PASS|FAIL)\b/i.test(line))
    ?? lines.find((line) => line.trim())
    ?? ""
  const pass = /^\s*PASS\b/i.test(verdictLine)
  return { pass, summary: summary || verdictLine || "（验收没有写出结论）" }
}

export function buildCollaborationRetryPrompt(summary: string): string {
  return [
    "按下面的验收意见继续改。只修列出的问题，不要扩大范围。改完再自测。",
    "",
    summary.trim(),
  ].join("\n")
}
