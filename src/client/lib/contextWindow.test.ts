import { describe, expect, test } from "bun:test"
import type { TranscriptEntry } from "../../shared/types"
import {
  autoCompactThresholdForSnapshot,
  deriveChatDockMetrics,
  deriveLatestContextWindowSnapshot,
  deriveSessionRequestCount,
  deriveSessionTurnMetrics,
  deriveSessionUsageByProvider,
  deriveSessionUsageByType,
  distanceToCompactionTokens,
  formatContextWindowTokens,
  overrideContextWindowMaxTokens,
} from "./contextWindow"

function entry(partial: Omit<TranscriptEntry, "_id" | "createdAt">, createdAt = Date.now()): TranscriptEntry {
  return {
    _id: crypto.randomUUID(),
    createdAt,
    ...partial,
  } as TranscriptEntry
}

describe("deriveLatestContextWindowSnapshot", () => {
  test("overrides the context window to 1M for deepseek models", () => {
    const snapshot = deriveLatestContextWindowSnapshot([
      entry({ kind: "system_init", provider: "deepseek", model: "deepseek-v4-flash", tools: [], agents: [], slashCommands: [], mcpServers: [], id: "s1" }, 1),
      entry({ kind: "context_window_updated", usage: { usedTokens: 100_000, maxTokens: 200_000, compactsAutomatically: false } }, 2),
    ])

    expect(snapshot).not.toBeNull()
    expect(snapshot?.maxTokens).toBe(1_000_000)
    expect(snapshot?.usedPercentage).toBe(10)
    expect(snapshot?.remainingTokens).toBe(900_000)
  })

  test("keeps the SDK-reported window for non-deepseek models", () => {
    const snapshot = deriveLatestContextWindowSnapshot([
      entry({ kind: "system_init", provider: "claude", model: "claude-sonnet-4-6", tools: [], agents: [], slashCommands: [], mcpServers: [], id: "s1" }, 1),
      entry({ kind: "context_window_updated", usage: { usedTokens: 100_000, maxTokens: 258_400, compactsAutomatically: false } }, 2),
    ])

    expect(snapshot?.maxTokens).toBe(258_400)
  })

  test("deepseek 1M window: real auto-compact line is 930k (1M−20k−50k)", () => {
    const snapshot = deriveLatestContextWindowSnapshot([
      entry({ kind: "system_init", provider: "deepseek", model: "deepseek-v4-flash", tools: [], agents: [], slashCommands: [], mcpServers: [], id: "s1" }, 1),
      entry({ kind: "context_window_updated", usage: { usedTokens: 100_000, maxTokens: 1_000_000, compactsAutomatically: false } }, 2),
    ])

    // 真实窗口 1M：有效窗口 1M−20k=980k，缓冲（≥800k 档）50k → 触发线 930k。
    expect(autoCompactThresholdForSnapshot(snapshot)).toBe(930_000)
    expect(distanceToCompactionTokens(snapshot)).toBe(830_000)
    expect(distanceToCompactionTokens(null)).toBeNull()
  })

  test("200k window uses the 13k buffer tier", () => {
    const snapshot = deriveLatestContextWindowSnapshot([
      entry({ kind: "system_init", provider: "claude", model: "claude-sonnet-4-6", tools: [], agents: [], slashCommands: [], mcpServers: [], id: "s1" }, 1),
      entry({ kind: "context_window_updated", usage: { usedTokens: 100_000, maxTokens: 200_000, compactsAutomatically: false } }, 2),
    ])

    // 有效窗口 200k−20k=180k，缓冲 13k → 触发线 167k。
    expect(autoCompactThresholdForSnapshot(snapshot)).toBe(167_000)
    expect(distanceToCompactionTokens(snapshot)).toBe(67_000)
  })

  test("mid-size windows use the 30k buffer tier", () => {
    const snapshot = deriveLatestContextWindowSnapshot([
      entry({ kind: "system_init", provider: "claude", model: "claude-sonnet-4-6", tools: [], agents: [], slashCommands: [], mcpServers: [], id: "s1" }, 1),
      entry({ kind: "context_window_updated", usage: { usedTokens: 100_000, maxTokens: 500_000, compactsAutomatically: false } }, 2),
    ])

    // 有效窗口 500k−20k=480k（≥400k 档），缓冲 30k → 触发线 450k。
    expect(autoCompactThresholdForSnapshot(snapshot)).toBe(450_000)
    expect(distanceToCompactionTokens(snapshot)).toBe(350_000)
  })

  test("derives the latest valid snapshot", () => {
    const snapshot = deriveLatestContextWindowSnapshot([
      entry({ kind: "context_window_updated", usage: { usedTokens: 0, compactsAutomatically: false } }, 1),
      entry({ kind: "context_window_updated", usage: { usedTokens: 125, maxTokens: 500, compactsAutomatically: false } }, 2),
    ])

    expect(snapshot).not.toBeNull()
    expect(snapshot?.usedTokens).toBe(125)
    expect(snapshot?.maxTokens).toBe(500)
    expect(snapshot?.usedPercentage).toBe(25)
    expect(snapshot?.remainingTokens).toBe(375)
  })

  test("marks snapshots as compaction-capable when the chat contains compaction signals", () => {
    const snapshot = deriveLatestContextWindowSnapshot([
      entry({ kind: "compact_boundary" }, 1),
      entry({ kind: "context_window_updated", usage: { usedTokens: 321, compactsAutomatically: false } }, 2),
    ])

    expect(snapshot?.compactsAutomatically).toBe(true)
  })

  test("a harness switch resets the meter: only usage after the last handoff boundary counts", () => {
    // Usage (and compaction signals) from the old provider's session don't
    // describe the new session's context window.
    expect(deriveLatestContextWindowSnapshot([
      entry({ kind: "compact_boundary" }, 1),
      entry({ kind: "context_window_updated", usage: { usedTokens: 999, compactsAutomatically: false } }, 2),
      entry({ kind: "handoff_boundary", fromProvider: "claude", toProvider: "codex" }, 3),
    ])).toBeNull()

    const afterSwitch = deriveLatestContextWindowSnapshot([
      entry({ kind: "compact_boundary" }, 1),
      entry({ kind: "context_window_updated", usage: { usedTokens: 999, compactsAutomatically: false } }, 2),
      entry({ kind: "handoff_boundary", fromProvider: "claude", toProvider: "codex" }, 3),
      entry({ kind: "context_window_updated", usage: { usedTokens: 42, compactsAutomatically: false } }, 4),
    ])
    expect(afterSwitch?.usedTokens).toBe(42)
    expect(afterSwitch?.compactsAutomatically).toBe(false)
  })

  test("a session restore resets the meter like a handoff boundary", () => {
    // The restored session is a fresh native session, so usage before the
    // session_restored boundary describes the old (gone) one.
    expect(deriveLatestContextWindowSnapshot([
      entry({ kind: "context_window_updated", usage: { usedTokens: 999, compactsAutomatically: false } }, 1),
      entry({ kind: "session_restored", provider: "claude" }, 2),
    ])).toBeNull()

    const afterRestore = deriveLatestContextWindowSnapshot([
      entry({ kind: "context_window_updated", usage: { usedTokens: 999, compactsAutomatically: false } }, 1),
      entry({ kind: "session_restored", provider: "claude" }, 2),
      entry({ kind: "context_window_updated", usage: { usedTokens: 7, compactsAutomatically: false } }, 3),
    ])
    expect(afterRestore?.usedTokens).toBe(7)
  })
})

describe("formatContextWindowTokens", () => {
  test("formats raw and abbreviated token counts", () => {
    expect(formatContextWindowTokens(999)).toBe("999")
    expect(formatContextWindowTokens(1400)).toBe("1.4k")
    expect(formatContextWindowTokens(14_000)).toBe("14k")
    expect(formatContextWindowTokens(1_400_000)).toBe("1.4m")
  })
})

describe("overrideContextWindowMaxTokens", () => {
  test("recomputes denominator-dependent fields with a staged max token value", () => {
    const base = deriveLatestContextWindowSnapshot([
      entry({ kind: "context_window_updated", usage: { usedTokens: 50_000, maxTokens: 200_000, compactsAutomatically: false } }),
    ])

    const overridden = overrideContextWindowMaxTokens(base, 1_000_000)

    expect(overridden?.maxTokens).toBe(1_000_000)
    expect(overridden?.usedPercentage).toBe(5)
    expect(overridden?.remainingTokens).toBe(950_000)
  })
})

describe("deriveChatDockMetrics", () => {
  function usageEntry(
    partial: Partial<TranscriptEntry["usage"]> = {},
    createdAt = Date.now(),
  ): TranscriptEntry {
    return entry({
      kind: "context_window_updated",
      usage: { usedTokens: 0, compactsAutomatically: false, ...partial },
    }, createdAt)
  }

  test("computes current and average cache hit rates plus session tokens", () => {
    const metrics = deriveChatDockMetrics([
      usageEntry({ lastInputTokens: 100, lastCachedInputTokens: 70, lastOutputTokens: 20 }, 1),
      usageEntry({ lastInputTokens: 200, lastCachedInputTokens: 100, lastOutputTokens: 50 }, 2),
    ])

    // Latest turn: 100/200 = 50%; average: 170/300 = 56.67% -> 57%.
    expect(metrics.currentCacheHitRate).toBe(50)
    expect(metrics.averageCacheHitRate).toBeCloseTo(56.6667, 3)
    // Consumed: (100-70+20) + (200-100+50) = 50 + 150.
    expect(metrics.sessionTokens).toBe(200)
  })

  test("skips the result snapshot that duplicates the last step's last* fields", () => {
    // 旧版服务端在 result 快照里重复携带最后一条 per-step 的 last* 增量，
    // 累加时跳过连续重复项，避免最后一步被记两次。
    const metrics = deriveChatDockMetrics([
      usageEntry({ lastInputTokens: 100, lastCachedInputTokens: 70, lastOutputTokens: 20 }, 1),
      usageEntry({ lastInputTokens: 200, lastCachedInputTokens: 100, lastOutputTokens: 50 }, 2),
      usageEntry({ lastInputTokens: 200, lastCachedInputTokens: 100, lastOutputTokens: 50 }, 3),
    ])

    expect(metrics.currentCacheHitRate).toBe(50)
    // Consumed: (100-70+20) + (200-100+50) = 50 + 150, duplicate ignored.
    expect(metrics.sessionTokens).toBe(200)
  })

  test("returns null rates when there is no usage data", () => {
    const metrics = deriveChatDockMetrics([])
    expect(metrics.currentCacheHitRate).toBeNull()
    expect(metrics.averageCacheHitRate).toBeNull()
    expect(metrics.sessionTokens).toBe(0)
  })

  test("ignores usage before the last handoff boundary", () => {
    const metrics = deriveChatDockMetrics([
      usageEntry({ lastInputTokens: 500, lastCachedInputTokens: 400, lastOutputTokens: 100 }, 1),
      entry({ kind: "handoff_boundary", fromProvider: "claude", toProvider: "deepseek" }, 2),
      usageEntry({ lastInputTokens: 100, lastCachedInputTokens: 0, lastOutputTokens: 10 }, 3),
    ])

    expect(metrics.currentCacheHitRate).toBe(0)
    expect(metrics.averageCacheHitRate).toBe(0)
    expect(metrics.sessionTokens).toBe(110)
  })
})

describe("deriveSessionUsageByProvider", () => {
  function usageEntry(
    provider: "deepseek" | "claude" | "codex",
    partial: Partial<TranscriptEntry["usage"]>,
    createdAt = Date.now(),
  ): TranscriptEntry[] {
    return [
      entry({ kind: "handoff_boundary", fromProvider: "claude", toProvider: provider }, createdAt - 1),
      entry({
        kind: "context_window_updated",
        usage: { usedTokens: 0, compactsAutomatically: false, ...partial },
      }, createdAt),
    ]
  }

  test("accumulates per-provider consumed tokens", () => {
    const byProvider = deriveSessionUsageByProvider([
      ...usageEntry("deepseek", { lastInputTokens: 200, lastCachedInputTokens: 120, lastOutputTokens: 40, lastReasoningOutputTokens: 10 }, 1),
      ...usageEntry("claude", { lastInputTokens: 100, lastCachedInputTokens: 50, lastOutputTokens: 30 }, 2),
      ...usageEntry("deepseek", { lastInputTokens: 300, lastCachedInputTokens: 200, lastOutputTokens: 60, lastReasoningOutputTokens: 5 }, 3),
    ])

    const deepseek = byProvider.find((item) => item.provider === "deepseek")
    const claude = byProvider.find((item) => item.provider === "claude")
    expect(deepseek?.inputTokens).toBe(180)
    expect(deepseek?.cachedTokens).toBe(320)
    expect(deepseek?.outputTokens).toBe(100)
    expect(deepseek?.reasoningTokens).toBe(15)
    expect(claude?.inputTokens).toBe(50)
    expect(claude?.cachedTokens).toBe(50)
    expect(claude?.outputTokens).toBe(30)
    expect(byProvider).toHaveLength(2)
  })

  test("attributes usage to the provider announced by system_init", () => {
    const byProvider = deriveSessionUsageByProvider([
      entry({ kind: "system_init", provider: "deepseek", model: "deepseek-v4-flash", tools: [], agents: [], slashCommands: [], mcpServers: [], id: "s1" }, 1),
      entry({
        kind: "context_window_updated",
        usage: { usedTokens: 0, compactsAutomatically: false, lastInputTokens: 100, lastCachedInputTokens: 40, lastOutputTokens: 10 },
      }, 2),
      entry({ kind: "system_init", provider: "codex", model: "deepseek-v4-flash", tools: [], agents: [], slashCommands: [], mcpServers: [], id: "s2" }, 3),
      entry({
        kind: "context_window_updated",
        usage: { usedTokens: 0, compactsAutomatically: false, lastInputTokens: 200, lastCachedInputTokens: 150, lastOutputTokens: 20 },
      }, 4),
    ])

    expect(byProvider).toEqual([
      { provider: "deepseek", inputTokens: 60, cachedTokens: 40, outputTokens: 10, reasoningTokens: 0 },
      { provider: "codex", inputTokens: 50, cachedTokens: 150, outputTokens: 20, reasoningTokens: 0 },
    ])
  })

  test("ignores duplicate result snapshots when accumulating per provider", () => {
    const byProvider = deriveSessionUsageByProvider([
      ...usageEntry("deepseek", { lastInputTokens: 200, lastCachedInputTokens: 120, lastOutputTokens: 40 }, 1),
      ...usageEntry("deepseek", { lastInputTokens: 200, lastCachedInputTokens: 120, lastOutputTokens: 40 }, 2),
    ])

    const deepseek = byProvider.find((item) => item.provider === "deepseek")
    expect(deepseek?.outputTokens).toBe(40)
    expect(deepseek?.inputTokens).toBe(80)
    expect(byProvider).toHaveLength(1)
  })

  test("usage before a handoff boundary is attributed to unknown, then to the new provider", () => {
    const byProvider = deriveSessionUsageByProvider([
      entry({
        kind: "context_window_updated",
        usage: { usedTokens: 0, compactsAutomatically: false, lastInputTokens: 999, lastOutputTokens: 999 },
      }, 1),
      entry({ kind: "handoff_boundary", fromProvider: "claude", toProvider: "deepseek" }, 2),
      entry({
        kind: "context_window_updated",
        usage: { usedTokens: 0, compactsAutomatically: false, lastInputTokens: 100, lastOutputTokens: 10 },
      }, 3),
    ])

    expect(byProvider).toEqual([
      { provider: "unknown", inputTokens: 999, cachedTokens: 0, outputTokens: 999, reasoningTokens: 0 },
      { provider: "deepseek", inputTokens: 100, cachedTokens: 0, outputTokens: 10, reasoningTokens: 0 },
    ])
  })
})

describe("deriveSessionUsageByType", () => {
  test("aggregates token types across providers", () => {
    const totals = deriveSessionUsageByType([
      entry({ kind: "handoff_boundary", fromProvider: "claude", toProvider: "deepseek" }, 1),
      entry({
        kind: "context_window_updated",
        usage: { usedTokens: 0, compactsAutomatically: false, lastInputTokens: 200, lastCachedInputTokens: 120, lastOutputTokens: 40, lastReasoningOutputTokens: 10 },
      }, 2),
      entry({ kind: "handoff_boundary", fromProvider: "deepseek", toProvider: "claude" }, 3),
      entry({
        kind: "context_window_updated",
        usage: { usedTokens: 0, compactsAutomatically: false, lastInputTokens: 100, lastCachedInputTokens: 50, lastOutputTokens: 30 },
      }, 4),
    ])

    expect(totals.inputTokens).toBe(130)
    expect(totals.cachedTokens).toBe(170)
    expect(totals.outputTokens).toBe(70)
    expect(totals.reasoningTokens).toBe(10)
  })
})

describe("deriveSessionTurnMetrics", () => {
  test("counts turns, tool calls, results, duration and cost", () => {
    const metrics = deriveSessionTurnMetrics([
      entry({ kind: "user_prompt", content: "hi" }, 1),
      entry({ kind: "tool_call" } as never, 2),
      entry({ kind: "result", success: true, result: "ok", durationMs: 1500, costUsd: 0.012 }, 3),
      entry({ kind: "user_prompt", content: "again" }, 4),
      entry({ kind: "result", success: true, result: "ok2", durationMs: 2500 }, 5),
    ])

    expect(metrics.turns).toBe(2)
    expect(metrics.toolUses).toBe(1)
    expect(metrics.results).toBe(2)
    expect(metrics.durationMs).toBe(4000)
    expect(metrics.costUsd).toBeCloseTo(0.012, 6)
  })

  test("treats result cost as the session-cumulative total (last wins)", () => {
    const metrics = deriveSessionTurnMetrics([
      entry({ kind: "result", success: true, result: "ok", durationMs: 100, costUsd: 1.25 }, 1),
      entry({ kind: "result", success: true, result: "ok2", durationMs: 200, costUsd: 1.25 }, 2),
      entry({ kind: "result", success: true, result: "ok3", durationMs: 300, costUsd: 2.5 }, 3),
    ])

    // 中断/错误回合会重复上报同一累计值，累加会把同一笔钱算两次。
    expect(metrics.costUsd).toBe(2.5)
    expect(metrics.durationMs).toBe(600)
  })

  test("counts non-duplicate model requests", () => {
    const count = deriveSessionRequestCount([
      entry({
        kind: "context_window_updated",
        usage: { usedTokens: 0, compactsAutomatically: false, lastInputTokens: 100, lastCachedInputTokens: 60, lastOutputTokens: 20 },
      }, 1),
      entry({
        kind: "context_window_updated",
        usage: { usedTokens: 0, compactsAutomatically: false, lastInputTokens: 200, lastCachedInputTokens: 150, lastOutputTokens: 30 },
      }, 2),
      // result 快照重复最后一步，不算新请求。
      entry({
        kind: "context_window_updated",
        usage: { usedTokens: 0, compactsAutomatically: false, lastInputTokens: 200, lastCachedInputTokens: 150, lastOutputTokens: 30 },
      }, 3),
      // 无 last* 的条目（如纯 context 刷新）也不算。
      entry({ kind: "context_window_updated", usage: { usedTokens: 200, compactsAutomatically: false } }, 4),
    ])

    expect(count).toBe(2)
  })

  test("returns zeroed metrics for an empty transcript", () => {
    expect(deriveSessionTurnMetrics([])).toEqual({
      turns: 0,
      toolUses: 0,
      results: 0,
      durationMs: 0,
      costUsd: null,
    })
  })
})
