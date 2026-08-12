import {
  Activity,
  Brain,
  Clock,
  Coins,
  Cpu,
  Database,
  Gauge,
  Layers,
  Percent,
  RefreshCw,
  Send,
  Sigma,
  Wrench,
  X,
} from "lucide-react"
import { useMemo, useState } from "react"
import type { AgentProvider, TranscriptEntry } from "../../../shared/types"
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
  WARNING_THRESHOLD_BUFFER_TOKENS,
  type ContextWindowSnapshot,
  type TokenTypeUsage,
} from "../../lib/contextWindow"
import { cn } from "../../lib/utils"
import { useDeepSeekBalanceStore } from "../../stores/deepSeekBalanceStore"
import { Button } from "../ui/button"
import { ScrollArea } from "../ui/scroll-area"

const PROVIDER_LABELS: Record<string, string> = {
  deepseek: "DeepSeek",
  claude: "Claude",
  codex: "Codex",
  cursor: "Cursor",
  pi: "Pi",
  unknown: "未知来源",
}

const TYPE_LABELS: Record<keyof TokenTypeUsage, string> = {
  inputTokens: "输入（未命中）",
  cachedTokens: "缓存读取",
  outputTokens: "输出（含推理）",
  reasoningTokens: "推理（含于输出）",
}

const DONUT_COLORS: Record<"inputTokens" | "cachedTokens" | "outputTokens", string> = {
  inputTokens: "stroke-sky-500",
  cachedTokens: "stroke-violet-500",
  outputTokens: "stroke-emerald-500",
}

function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "—"
  if (ms < 60_000) return `${Math.max(1, Math.round(ms / 1000))}s`
  const minutes = Math.round(ms / 60_000)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  return `${hours}h ${minutes % 60}m`
}

function formatRate(value: number | null): string {
  return value === null || !Number.isFinite(value) ? "—" : `${Math.round(value)}%`
}

function formatCost(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—"
  if (value === 0) return "$0"
  return `$${value.toFixed(4)}`
}

function StatCard({ icon, label, value, hint }: { icon: React.ReactNode; label: string; value: string; hint?: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border bg-card/40 px-3 py-2" title={hint}>
      <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <span className="opacity-70 [&>svg]:h-3 [&>svg]:w-3">{icon}</span>
        {label}
      </span>
      <span className="text-sm font-semibold tabular-nums text-foreground">{value}</span>
    </div>
  )
}

function UsageBar({ label, value, total }: { label: string; value: number; total: number }) {
  const percentage = total > 0 ? Math.min(100, (value / total) * 100) : 0
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="truncate text-muted-foreground">{label}</span>
        <span className="shrink-0 tabular-nums text-foreground/90">{formatContextWindowTokens(value)}</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/60">
        <div
          className={cn("h-full rounded-full transition-[width] duration-500 ease-out", percentage >= 90 ? "bg-destructive" : "bg-primary/70")}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  )
}

/** 用量分布环形图：输入未命中 / 缓存读取 / 输出（含推理）。 */
function TokenDonut({ usage }: { usage: TokenTypeUsage }) {
  const total = usage.inputTokens + usage.cachedTokens + usage.outputTokens
  const radius = 44
  const strokeWidth = 14
  const circumference = 2 * Math.PI * radius

  const segments = [
    { key: "inputTokens", value: usage.inputTokens },
    { key: "cachedTokens", value: usage.cachedTokens },
    { key: "outputTokens", value: usage.outputTokens },
  ] as const

  let offset = 0
  const rendered = segments.map(({ key, value }) => {
    const dash = total > 0 ? (value / total) * circumference : 0
    const circle = (
      <circle
        key={key}
        cx={60}
        cy={60}
        r={radius}
        fill="none"
        strokeWidth={strokeWidth}
        className={cn(DONUT_COLORS[key], "transition-[stroke-dasharray] duration-500")}
        strokeDasharray={total > 0 ? `${Math.max(0, dash - 1.5)} ${circumference - Math.max(0, dash - 1.5)}` : `0 ${circumference}`}
        strokeDashoffset={-offset}
        strokeLinecap="butt"
        transform="rotate(-90 60 60)"
      />
    )
    offset += dash
    return circle
  })

  return (
    <div className="relative h-[120px] w-[120px] shrink-0">
      <svg viewBox="0 0 120 120" className="h-full w-full">
        <circle cx={60} cy={60} r={radius} fill="none" strokeWidth={strokeWidth} className="stroke-muted/50" />
        {rendered}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[10px] text-muted-foreground">总计</span>
        <span className="text-sm font-semibold tabular-nums">{formatContextWindowTokens(total)}</span>
      </div>
    </div>
  )
}

export function InsightsPanel({
  entries,
  contextWindowSnapshot,
  onClose,
}: {
  entries: readonly TranscriptEntry[]
  contextWindowSnapshot: ContextWindowSnapshot | null
  onClose: () => void
}) {
  const [usageView, setUsageView] = useState<"source" | "type">("source")

  const snapshot = useMemo(
    () => contextWindowSnapshot ?? deriveLatestContextWindowSnapshot(entries),
    [contextWindowSnapshot, entries],
  )
  const dockMetrics = useMemo(() => deriveChatDockMetrics(entries), [entries])
  const turnMetrics = useMemo(() => deriveSessionTurnMetrics(entries), [entries])
  const requestCount = useMemo(() => deriveSessionRequestCount(entries), [entries])
  const byProvider = useMemo(() => deriveSessionUsageByProvider(entries), [entries])
  const byType = useMemo(() => deriveSessionUsageByType(entries), [entries])
  const compactionDistance = useMemo(() => distanceToCompactionTokens(snapshot), [snapshot])
  const compactionThreshold = useMemo(() => autoCompactThresholdForSnapshot(snapshot), [snapshot])

  // 主模型：最近一次 system_init 的 provider + model。
  const mainModel = useMemo(() => {
    let provider: AgentProvider | "unknown" = "unknown"
    let model: string | null = null
    for (const entry of entries) {
      if (entry.kind !== "system_init") continue
      provider = entry.provider
      model = entry.model
    }
    return { provider, model }
  }, [entries])

  const balance = useDeepSeekBalanceStore((store) => store.balance)
  const balanceFailed = useDeepSeekBalanceStore((store) => store.failed)
  const refreshBalance = useDeepSeekBalanceStore((store) => store.refresh)

  const balanceLabel = balance?.available
    ? `${balance.currency === "CNY" ? "¥" : balance.currency ? `${balance.currency} ` : ""}${balance.totalBalance ?? "—"}`
    : "—"

  // 推理 tokens 含于输出（API 口径 output_tokens 已包含推理），不重复计入总和。
  const typeTotal = byType.inputTokens + byType.cachedTokens + byType.outputTokens
  const providerTotal = byProvider.reduce((sum, item) => sum + item.inputTokens + item.cachedTokens + item.outputTokens, 0)
  const usedPercentage = snapshot?.usedPercentage ?? null
  const normalizedPercentage = Math.max(0, Math.min(100, usedPercentage ?? 0))
  // 引擎真实告警线：接近压缩（threshold - 20k）和即将压缩（threshold）。
  const usedTokens = snapshot?.usedTokens ?? 0
  const nearCompaction = compactionThreshold !== null && usedTokens >= compactionThreshold
  const closeToCompaction = compactionThreshold !== null
    && !nearCompaction
    && usedTokens >= compactionThreshold - WARNING_THRESHOLD_BUFFER_TOKENS

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <h2 className="text-sm font-semibold">概览</h2>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => void refreshBalance()} aria-label="刷新余额">
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="sm" className="h-7 px-2" onClick={onClose} aria-label="关闭概览">
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-4 p-4">
          {/* 上下文窗口 */}
          <section className="rounded-xl border border-border bg-card/40 p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                <Activity className="h-3.5 w-3.5 text-muted-foreground" />
                上下文窗口
              </span>
              {snapshot?.compactsAutomatically ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-sky-500/20 bg-sky-500/10 px-2 py-0.5 text-[11px] text-sky-500">
                  <Wrench className="h-3 w-3" /> 自动压缩
                </span>
              ) : null}
            </div>

            {snapshot ? (
              <>
                <div className="mb-2 flex items-baseline justify-between gap-2">
                  <span className="text-2xl font-semibold tabular-nums text-foreground">
                    {formatContextWindowTokens(snapshot.usedTokens)}
                    <span className="text-sm font-normal text-muted-foreground"> / {formatContextWindowTokens(snapshot.maxTokens)} tokens</span>
                  </span>
                  <span className={cn("text-sm font-medium tabular-nums", nearCompaction ? "text-destructive" : "text-emerald-600 dark:text-emerald-400")}>
                    {usedPercentage !== null ? `${usedPercentage.toFixed(1).replace(/\.0$/, "")}%` : "—"}
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted/60">
                  <div
                    className={cn(
                      "h-full rounded-full transition-[width] duration-500 ease-out",
                      nearCompaction
                        ? "bg-destructive"
                        : closeToCompaction
                          ? "bg-amber-500"
                          : "bg-emerald-500",
                    )}
                    style={{ width: `${normalizedPercentage}%` }}
                  />
                </div>
                <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                  <span className={cn("inline-flex items-center gap-1.5 font-medium", nearCompaction ? "text-destructive" : closeToCompaction ? "text-amber-500" : "text-foreground/90")}>
                    <Wrench className="h-3 w-3 opacity-70" />
                    距压缩 {compactionDistance !== null ? formatContextWindowTokens(compactionDistance) : "—"}
                    {compactionThreshold !== null ? (
                      <span className="rounded border border-border px-1 py-px text-[10px] text-muted-foreground" title="真实窗口 1M：有效窗口 980k − 50k 缓冲 = 930k">
                        引擎阈值 {formatContextWindowTokens(compactionThreshold)}
                      </span>
                    ) : null}
                  </span>
                  <span className="tabular-nums">更新于 {snapshot.updatedAt ? new Date(snapshot.updatedAt).toLocaleTimeString("zh-CN") : "—"}</span>
                </div>
                <div className="mt-1 text-[11px] text-muted-foreground">
                  剩余 {snapshot.remainingTokens !== null ? formatContextWindowTokens(snapshot.remainingTokens) : "—"} tokens
                </div>
              </>
            ) : (
              <p className="text-xs text-muted-foreground">还没有上下文用量数据——发送第一条消息后自动出现。</p>
            )}
          </section>

          {/* 会话指标 */}
          <section className="rounded-xl border border-border bg-card/40 p-4">
            <span className="mb-3 flex items-center gap-1.5 text-xs font-medium text-foreground">
              <Activity className="h-3.5 w-3.5 text-muted-foreground" />
              会话指标
            </span>
            <div className="grid grid-cols-2 gap-2">
              <StatCard
                icon={<Percent />}
                label="平均命中"
                value={formatRate(dockMetrics.averageCacheHitRate)}
                hint="会话内平均缓存命中率"
              />
              <StatCard
                icon={<Coins />}
                label="会话费用"
                value={formatCost(turnMetrics.costUsd)}
                hint="引擎上报的会话累计成本（total_cost_usd）"
              />
              <StatCard
                icon={<Clock />}
                label="运行时间"
                value={formatDuration(turnMetrics.durationMs)}
                hint="所有结果条目的累计耗时"
              />
              <StatCard
                icon={<Send />}
                label="请求数"
                value={String(requestCount)}
                hint="模型 API 请求次数（每个 assistant 步骤计一次）"
              />
              <StatCard
                icon={<Sigma />}
                label="累计 tokens"
                value={formatContextWindowTokens(dockMetrics.sessionTokens)}
                hint="会话累计消耗（非缓存输入 + 输出）"
              />
              <StatCard
                icon={<Gauge />}
                label="本次命中"
                value={formatRate(dockMetrics.currentCacheHitRate)}
                hint="当前回合缓存读取 tokens / 输入 tokens"
              />
              <StatCard icon={<Layers />} label="回合数" value={String(turnMetrics.turns)} />
              <StatCard icon={<Wrench />} label="工具调用" value={String(turnMetrics.toolUses)} />
            </div>

            <div className="mt-3 flex items-center justify-between gap-2 border-t border-border pt-3">
              <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <Coins className="h-3 w-3 opacity-70" />
                DP 余额
              </span>
              <span className={cn("text-xs font-medium tabular-nums", balanceFailed ? "text-destructive" : "text-foreground/90")}>
                {balanceLabel}
              </span>
            </div>
          </section>

          {/* 用量分析 */}
          <section className="rounded-xl border border-border bg-card/40 p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                <Sigma className="h-3.5 w-3.5 text-muted-foreground" />
                用量分析
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[11px] text-muted-foreground">
                <Cpu className="h-3 w-3 opacity-70" />
                {PROVIDER_LABELS[mainModel.provider] ?? mainModel.provider}
                {mainModel.model ? ` · ${mainModel.model}` : ""}
              </span>
            </div>

            {typeTotal > 0 ? (
              <>
                <div className="flex items-center gap-4">
                  <TokenDonut usage={byType} />
                  <div className="flex min-w-0 flex-1 flex-col gap-2">
                    {(["inputTokens", "cachedTokens", "outputTokens"] as Array<"inputTokens" | "cachedTokens" | "outputTokens">).map((key) => {
                      const value = byType[key]
                      const percentage = typeTotal > 0 ? Math.round((value / typeTotal) * 100) : 0
                      return (
                        <div key={key} className="flex items-center justify-between gap-2 text-xs">
                          <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
                            <span className={cn("h-2 w-2 shrink-0 rounded-full", DONUT_COLORS[key].replace("stroke-", "bg-"))} />
                            <span className="truncate">{TYPE_LABELS[key]}</span>
                          </span>
                          <span className="shrink-0 tabular-nums text-foreground/90">
                            {formatContextWindowTokens(value)} · {percentage}%
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2">
                  <StatCard icon={<Sigma />} label="总计" value={formatContextWindowTokens(typeTotal)} hint="未命中输入 + 缓存读取 + 输出" />
                  <StatCard icon={<Database />} label="缓存" value={formatContextWindowTokens(byType.cachedTokens)} hint="缓存读取 tokens" />
                  <StatCard icon={<Percent />} label="未命中" value={formatContextWindowTokens(byType.inputTokens)} hint="非缓存输入 tokens（未命中）" />
                  <StatCard icon={<Brain />} label="输出" value={formatContextWindowTokens(byType.outputTokens)} hint="输出 tokens（含推理）" />
                  <StatCard icon={<Gauge />} label="推理" value={formatContextWindowTokens(byType.reasoningTokens)} hint="推理 tokens（含于输出）" />
                  <StatCard
                    icon={<Coins />}
                    label="费用"
                    value={formatCost(turnMetrics.costUsd)}
                    hint="引擎上报的会话累计成本（total_cost_usd）"
                  />
                </div>
              </>
            ) : (
              <p className="text-xs text-muted-foreground">暂无用量数据。</p>
            )}

            <div className="mt-4 flex items-center justify-between gap-2 border-t border-border pt-3">
              <div className="flex items-center gap-0.5 rounded-lg bg-muted/60 p-0.5">
                <button
                  type="button"
                  onClick={() => setUsageView("source")}
                  className={cn(
                    "rounded-md px-2 py-1 text-[11px] font-medium transition-colors",
                    usageView === "source" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  按来源
                </button>
                <button
                  type="button"
                  onClick={() => setUsageView("type")}
                  className={cn(
                    "rounded-md px-2 py-1 text-[11px] font-medium transition-colors",
                    usageView === "type" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  按类型
                </button>
              </div>
            </div>

            {usageView === "source" ? (
              byProvider.length > 0 ? (
                <div className="mt-3 flex flex-col gap-3">
                  {byProvider.map((item) => (
                    <UsageBar
                      key={item.provider}
                      label={PROVIDER_LABELS[item.provider] ?? item.provider}
                      value={item.inputTokens + item.cachedTokens + item.outputTokens}
                      total={providerTotal}
                    />
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-xs text-muted-foreground">暂无用量数据。</p>
              )
            ) : (
              <div className="mt-3 flex flex-col gap-3">
                {(["inputTokens", "cachedTokens", "outputTokens"] as Array<keyof TokenTypeUsage>).map((key) => (
                  <UsageBar key={key} label={TYPE_LABELS[key]} value={byType[key]} total={typeTotal} />
                ))}
                {/* 推理是输出的子集：占比按输出计算，避免重复计费。 */}
                <UsageBar
                  label={TYPE_LABELS.reasoningTokens}
                  value={byType.reasoningTokens}
                  total={byType.outputTokens}
                />
              </div>
            )}
          </section>
        </div>
      </ScrollArea>
    </div>
  )
}
