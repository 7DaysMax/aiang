import { DEEPSEEK_CONTEXT_WINDOW_TOKENS } from "../../shared/models"
import type { AgentProvider, ContextWindowUsageSnapshot, TranscriptEntry } from "../../shared/types"

export interface ContextWindowSnapshot extends ContextWindowUsageSnapshot {
  remainingTokens: number | null
  usedPercentage: number | null
  remainingPercentage: number | null
  updatedAt: string
}

function withDerivedMetrics(
  usage: ContextWindowUsageSnapshot,
  updatedAt: string,
  compactsAutomatically: boolean,
): ContextWindowSnapshot {
  const maxTokens = typeof usage.maxTokens === "number" && Number.isFinite(usage.maxTokens)
    ? usage.maxTokens
    : null
  const usedPercentage = maxTokens && maxTokens > 0
    ? Math.min(100, (usage.usedTokens / maxTokens) * 100)
    : null
  const remainingTokens = maxTokens !== null
    ? Math.max(0, Math.round(maxTokens - usage.usedTokens))
    : null
  const remainingPercentage = usedPercentage !== null
    ? Math.max(0, 100 - usedPercentage)
    : null

  return {
    ...usage,
    compactsAutomatically: usage.compactsAutomatically || compactsAutomatically,
    maxTokens: maxTokens ?? undefined,
    remainingTokens,
    usedPercentage,
    remainingPercentage,
    updatedAt,
  }
}

export interface ChatDockMetrics {
  /** 当前（最近一次）回合缓存命中率，0-100；无数据时 null。 */
  currentCacheHitRate: number | null
  /** 会话内平均缓存命中率，0-100；无数据时 null。 */
  averageCacheHitRate: number | null
  /** 会话累计消耗 tokens（非缓存输入 + 输出）。 */
  sessionTokens: number
}

/**
 * A harness switch or same-provider session restore starts a fresh provider
 * session — usage entries from before the last such boundary describe the
 * old session's context window, so only the segment after it counts.
 */
export function latestContextWindowSegment(
  entries: ReadonlyArray<TranscriptEntry>,
): readonly TranscriptEntry[] {
  let segmentStart = 0
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const kind = entries[index]?.kind
    if (kind === "handoff_boundary" || kind === "session_restored") {
      segmentStart = index + 1
      break
    }
  }
  return segmentStart > 0 ? entries.slice(segmentStart) : entries
}

/**
 * result 快照会带上与最后一条 per-step 完全相同的 last* 增量字段（新版
 * 服务端已不再下发，但旧 transcript 里仍存在）。累加时跳过连续重复项，
 * 避免把最后一步的消耗记两次。
 */
function lastStepSignature(usage: ContextWindowUsageSnapshot): string | null {
  const input = usage.lastInputTokens ?? 0
  const cached = usage.lastCachedInputTokens ?? 0
  const output = usage.lastOutputTokens ?? 0
  const reasoning = usage.lastReasoningOutputTokens ?? 0
  if (input <= 0 && cached <= 0 && output <= 0 && reasoning <= 0) return null
  return `${input}:${cached}:${output}:${reasoning}`
}

/**
 * 底部栏指标：从 transcript 的 context_window_updated 条目累计出当前回合
 * 缓存命中率、会话平均缓存命中率和会话累计 tokens。每个步骤的
 * `lastInputTokens` 都重算整段上下文，但缓存命中的部分会在下一步被重新
 * 计入（cache read），所以累计“非缓存输入 + 输出”正好是会话实际新增消耗。
 */
export function deriveChatDockMetrics(entries: ReadonlyArray<TranscriptEntry>): ChatDockMetrics {
  const segment = latestContextWindowSegment(entries)
  let totalInput = 0
  let totalCached = 0
  let sessionTokens = 0
  let currentCacheHitRate: number | null = null
  let previousSignature: string | null = null

  for (const entry of segment) {
    if (entry.kind !== "context_window_updated") continue
    const usage = entry.usage
    const signature = lastStepSignature(usage)
    if (signature !== null && signature === previousSignature) continue
    if (signature !== null) previousSignature = signature
    const input = usage.lastInputTokens ?? 0
    const cached = usage.lastCachedInputTokens ?? 0
    const output = usage.lastOutputTokens ?? 0
    if (input > 0) {
      totalInput += input
      totalCached += cached
      currentCacheHitRate = Math.min(100, (cached / input) * 100)
    }
    sessionTokens += Math.max(0, input - cached) + Math.max(0, output)
  }

  return {
    currentCacheHitRate,
    averageCacheHitRate: totalInput > 0 ? Math.min(100, (totalCached / totalInput) * 100) : null,
    sessionTokens,
  }
}

export function deriveLatestContextWindowSnapshot(
  entries: ReadonlyArray<TranscriptEntry>,
): ContextWindowSnapshot | null {
  const segment = latestContextWindowSegment(entries)

  const compactsAutomatically = segment.some((entry) =>
    entry.kind === "compact_boundary"
    || entry.kind === "compact_summary"
    || entry.kind === "context_cleared"
  )

  // DeepSeek V4 固定 1M：ccb / Codex 通道可能上报 200k / 258.4k 的旧元数据
  // （包括已经落盘的旧 transcript），按最近一次 system_init 的模型覆盖。
  let maxTokensOverride: number | null = null
  for (const entry of segment) {
    if (entry.kind !== "system_init") continue
    maxTokensOverride = entry.model.startsWith("deepseek-") ? DEEPSEEK_CONTEXT_WINDOW_TOKENS : null
  }

  let snapshot: ContextWindowSnapshot | null = null
  for (let index = segment.length - 1; index >= 0; index -= 1) {
    const entry = segment[index]
    if (!entry) continue

    if (entry.kind !== "context_window_updated" || entry.usage.usedTokens <= 0) {
      continue
    }

    snapshot = withDerivedMetrics(entry.usage, new Date(entry.createdAt).toISOString(), compactsAutomatically)
    break
  }

  if (snapshot && maxTokensOverride !== null) {
    return overrideContextWindowMaxTokens(snapshot, maxTokensOverride)
  }
  return snapshot
}

export function overrideContextWindowMaxTokens(
  snapshot: ContextWindowSnapshot | null,
  maxTokens: number | null,
): ContextWindowSnapshot | null {
  if (!snapshot || maxTokens === null || !Number.isFinite(maxTokens) || maxTokens <= 0) {
    return snapshot
  }

  return withDerivedMetrics(
    {
      ...snapshot,
      maxTokens,
    },
    snapshot.updatedAt,
    snapshot.compactsAutomatically,
  )
}

/**
 * 真实自动压缩逻辑来自 claude-code-best 源码 services/compact/autoCompact.ts：
 *   effectiveContextWindow = contextWindow - min(maxOutputTokens, 20_000)
 *   autoCompactThreshold    = effectiveContextWindow - getAutocompactBufferTokens()
 *   getAutocompactBufferTokens 按有效窗口分级：≥800k → 50k；≥400k → 30k；否则 13k
 * DeepSeek V4 真实上下文是 1M（chinaLlmProviders.ts 注册 contextWindow: '1M'，
 * 最大输出 32k ≥ 20k 取下限）：
 *   effective = 1_000_000 - 20_000 = 980_000 → 阈值 = 980_000 - 50_000 = 930_000
 */
export const AUTOCOMPACT_BUFFER_TOKENS = 13_000
export const AUTOCOMPACT_BUFFER_LARGE = 30_000
export const AUTOCOMPACT_BUFFER_1M = 50_000
export const MAX_OUTPUT_TOKENS_FOR_SUMMARY = 20_000
export const WARNING_THRESHOLD_BUFFER_TOKENS = 20_000

export function getAutocompactBufferTokens(effectiveWindow: number): number {
  if (effectiveWindow >= 800_000) return AUTOCOMPACT_BUFFER_1M
  if (effectiveWindow >= 400_000) return AUTOCOMPACT_BUFFER_LARGE
  return AUTOCOMPACT_BUFFER_TOKENS
}

/** 按真实上下文窗口计算的自动压缩触发线（token 数）。 */
export function autoCompactThresholdForSnapshot(snapshot: ContextWindowSnapshot | null): number | null {
  if (!snapshot || !Number.isFinite(snapshot.usedTokens)) return null
  const maxTokens = snapshot.maxTokens
  if (typeof maxTokens !== "number" || !Number.isFinite(maxTokens) || maxTokens <= 0) return null
  // 快照的 maxTokens 就是真实窗口（deepseek 已覆盖成 1M），直接按它算。
  const effectiveWindow = maxTokens - MAX_OUTPUT_TOKENS_FOR_SUMMARY
  if (effectiveWindow <= 0) return null
  return effectiveWindow - getAutocompactBufferTokens(effectiveWindow)
}

/** 距离自动压缩还差多少 tokens（到真实触发线为止）；无快照或阈值不可用时为 null。 */
export function distanceToCompactionTokens(snapshot: ContextWindowSnapshot | null): number | null {
  const threshold = autoCompactThresholdForSnapshot(snapshot)
  if (threshold === null) return null
  return Math.max(0, Math.round(threshold - (snapshot?.usedTokens ?? 0)))
}

export function formatContextWindowTokens(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "0"
  }
  if (value < 1_000) {
    return `${Math.round(value)}`
  }
  if (value < 10_000) {
    return `${(value / 1_000).toFixed(1).replace(/\.0$/, "")}k`
  }
  if (value < 1_000_000) {
    return `${Math.round(value / 1_000)}k`
  }
  return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, "")}m`
}

// ---------------------------------------------------------------------------
// 右侧「分析」面板：会话用量按来源（provider）/ 按类型（token 类别）聚合。
// 与底部栏指标同一套增量语义：last* 字段是每一步实际新增消耗。
// ---------------------------------------------------------------------------

export interface TokenTypeUsage {
  /** 非缓存输入 tokens。 */
  inputTokens: number
  /** 缓存读取 tokens。 */
  cachedTokens: number
  /** 输出 tokens（含推理，API 口径：output_tokens 是计费总数）。 */
  outputTokens: number
  /** 推理 tokens（输出的一部分，用于展示，不重复计入总和）。 */
  reasoningTokens: number
}

export type ProviderUsage = TokenTypeUsage & { provider: AgentProvider | "unknown" }

function emptyTokenUsage(): TokenTypeUsage {
  return { inputTokens: 0, cachedTokens: 0, outputTokens: 0, reasoningTokens: 0 }
}

function addTokenUsage(target: TokenTypeUsage, usage: ContextWindowUsageSnapshot) {
  const input = usage.lastInputTokens ?? 0
  const cached = usage.lastCachedInputTokens ?? 0
  target.inputTokens += Math.max(0, input - cached)
  target.cachedTokens += Math.max(0, cached)
  target.outputTokens += Math.max(0, usage.lastOutputTokens ?? 0)
  target.reasoningTokens += Math.max(0, usage.lastReasoningOutputTokens ?? 0)
}

/** transcript 里每个条目的 provider 归属（handoff/session_restored/system_init 切换）。 */
function providerForEntry(entry: TranscriptEntry, current: AgentProvider | "unknown"): AgentProvider | "unknown" {
  if (entry.kind === "handoff_boundary") return entry.toProvider
  if (entry.kind === "session_restored") return entry.provider
  if (entry.kind === "system_init") return entry.provider
  return current
}

/** 按来源聚合：deepseek / claude / codex 各自的会话 token 消耗。 */
export function deriveSessionUsageByProvider(
  entries: ReadonlyArray<TranscriptEntry>,
): ProviderUsage[] {
  const totals = new Map<AgentProvider | "unknown", TokenTypeUsage>()
  let current: AgentProvider | "unknown" = "unknown"
  let previousSignature: string | null = null

  // 用量分析统计整个会话（handoff 切换 provider 归属），不像上下文窗口
  // 那样只取最新一段。
  for (const entry of entries) {
    current = providerForEntry(entry, current)
    if (entry.kind !== "context_window_updated") continue
    const signature = lastStepSignature(entry.usage)
    if (signature !== null && signature === previousSignature) continue
    if (signature !== null) previousSignature = signature
    const bucket = totals.get(current) ?? emptyTokenUsage()
    addTokenUsage(bucket, entry.usage)
    totals.set(current, bucket)
  }

  return Array.from(totals.entries()).map(([provider, usage]) => ({ provider, ...usage }))
}

/** 按类型聚合：会话总的输入 / 缓存 / 输出 / 推理 tokens。 */
export function deriveSessionUsageByType(
  entries: ReadonlyArray<TranscriptEntry>,
): TokenTypeUsage {
  const totals = emptyTokenUsage()
  for (const provider of deriveSessionUsageByProvider(entries)) {
    totals.inputTokens += provider.inputTokens
    totals.cachedTokens += provider.cachedTokens
    totals.outputTokens += provider.outputTokens
    totals.reasoningTokens += provider.reasoningTokens
  }
  return totals
}

export interface SessionTurnMetrics {
  /** 用户回合数（user_prompt / user_text 条目）。 */
  turns: number
  /** 工具调用次数。 */
  toolUses: number
  /** 成功结果数。 */
  results: number
  /** 累计耗时（毫秒）。 */
  durationMs: number
  /**
   * 会话成本（USD，可能为 null）。ccb / Claude 引擎的 result 上报的是
   * `total_cost_usd`——整个会话的累计值（中断回合可能重复发同一累计值），
   * 所以取最近一次，而不是累加。
   */
  costUsd: number | null
}

/** 会话结构指标：回合数、工具调用、结果、耗时、成本。 */
export function deriveSessionTurnMetrics(entries: ReadonlyArray<TranscriptEntry>): SessionTurnMetrics {
  let turns = 0
  let toolUses = 0
  let results = 0
  let durationMs = 0
  let costUsd: number | null = null
  for (const entry of entries) {
    if (entry.kind === "user_prompt") {
      turns += 1
    } else if (entry.kind === "tool_call") {
      toolUses += 1
    } else if (entry.kind === "result") {
      results += 1
      durationMs += entry.durationMs ?? 0
      if (typeof entry.costUsd === "number" && Number.isFinite(entry.costUsd)) {
        costUsd = entry.costUsd
      }
    }
  }
  return { turns, toolUses, results, durationMs, costUsd }
}

/** 模型请求数：非重复的 per-step 用量条目（每个 assistant 步骤一次 API 请求）。 */
export function deriveSessionRequestCount(entries: ReadonlyArray<TranscriptEntry>): number {
  let previousSignature: string | null = null
  let count = 0
  for (const entry of entries) {
    if (entry.kind !== "context_window_updated") continue
    const signature = lastStepSignature(entry.usage)
    if (signature === null) continue
    if (signature === previousSignature) continue
    previousSignature = signature
    count += 1
  }
  return count
}
