import type { ReactNode } from "react"
import { Coins, Gauge, Percent, Sigma } from "lucide-react"
import type { DeepSeekBalanceSnapshot, DeepSeekStatusSnapshot } from "../../../shared/types"
import type { ChatDockMetrics } from "../../lib/contextWindow"
import { formatContextWindowTokens } from "../../lib/contextWindow"
import { cn } from "../../lib/utils"
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip"

export interface DockMetricsVisibility {
  balance: boolean
  cacheHitRate: boolean
  averageCacheHitRate: boolean
  sessionTokens: boolean
  serviceStatus: boolean
}

function formatRate(value: number | null): string | null {
  if (value === null || !Number.isFinite(value)) return null
  return `${Math.round(value)}%`
}

function MetricChip({
  icon,
  label,
  value,
  muted,
  title,
  onClick,
}: {
  icon: ReactNode
  label: string
  value: string
  muted?: boolean
  title?: string
  onClick?: () => void
}) {
  return (
    <Tooltip delayDuration={0}>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          className={cn(
            "group inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs leading-relaxed transition-colors",
            onClick ? "hover:bg-muted/60" : "cursor-default",
            muted ? "text-muted-foreground/60" : "text-muted-foreground",
          )}
        >
          <span className="[&>svg]:h-3 [&>svg]:w-3 shrink-0 opacity-70">{icon}</span>
          <span className="whitespace-nowrap">{label}</span>
          <span className={cn("whitespace-nowrap font-medium tabular-nums", !muted && "text-foreground/90")}>
            {value}
          </span>
        </button>
      </TooltipTrigger>
      {title ? <TooltipContent side="top" className="max-w-xs text-xs">{title}</TooltipContent> : null}
    </Tooltip>
  )
}

const STATUS_CHIP_LABELS: Record<string, string> = {
  operational: "服务正常",
  degraded: "服务降级",
  partial_outage: "部分中断",
  full_outage: "完全中断",
  maintenance: "维护中",
}

const STATUS_CHIP_COLORS: Record<string, string> = {
  operational: "bg-emerald-500",
  degraded: "bg-amber-500",
  partial_outage: "bg-orange-500",
  full_outage: "bg-red-500",
  maintenance: "bg-sky-500",
}

export function DockMetricsBar({
  metrics,
  balance,
  balanceFailed,
  visible,
  onRefreshBalance,
  serviceStatus,
  serviceStatusFailed,
  onRefreshServiceStatus,
}: {
  metrics: ChatDockMetrics
  balance: DeepSeekBalanceSnapshot | null
  balanceFailed: boolean
  visible: DockMetricsVisibility
  onRefreshBalance?: () => void
  serviceStatus?: DeepSeekStatusSnapshot | null
  serviceStatusFailed?: boolean
  onRefreshServiceStatus?: () => void
}) {
  const balanceLabel = balance?.available
    ? `${balance.currency === "CNY" ? "¥" : balance.currency ? `${balance.currency} ` : ""}${balance.totalBalance ?? "—"}`
    : "—"
  const currentRate = formatRate(metrics.currentCacheHitRate)
  const averageRate = formatRate(metrics.averageCacheHitRate)

  return (
    <div className="flex flex-row flex-wrap items-center justify-center gap-x-1 gap-y-0.5 px-3 pb-1 pt-0.5">
      {visible.balance ? (
        <MetricChip
          icon={<Coins />}
          label="DP 余额"
          value={balanceLabel}
          muted={!balance?.available || balanceFailed}
          title={
            balanceFailed
              ? "余额拉取失败，点击重试"
              : balance?.available
                ? `DeepSeek 账户余额（${balance.fetchedAt ? new Date(balance.fetchedAt).toLocaleTimeString() : ""} 更新）`
                : "未配置 DeepSeek API Key，或余额端点不可达"
          }
          onClick={onRefreshBalance}
        />
      ) : null}
      {visible.cacheHitRate ? (
        <MetricChip
          icon={<Gauge />}
          label="本次命中"
          value={currentRate ?? "—"}
          muted={currentRate === null}
          title="当前回合的缓存命中率（缓存读取 tokens / 输入 tokens）"
        />
      ) : null}
      {visible.averageCacheHitRate ? (
        <MetricChip
          icon={<Percent />}
          label="平均命中"
          value={averageRate ?? "—"}
          muted={averageRate === null}
          title="会话内平均缓存命中率"
        />
      ) : null}
      {visible.sessionTokens ? (
        <MetricChip
          icon={<Sigma />}
          label="会话 tokens"
          value={formatContextWindowTokens(metrics.sessionTokens)}
          title="会话累计消耗 tokens（非缓存输入 + 输出）"
        />
      ) : null}
      {visible.serviceStatus ? (
        <MetricChip
          icon={
            <span className="relative inline-flex h-2 w-2">
              <span
                className={cn(
                  "inline-block h-2 w-2 rounded-full",
                  serviceStatus?.ok ? STATUS_CHIP_COLORS[serviceStatus.overallStatus] : "bg-muted-foreground/40",
                )}
              />
            </span>
          }
          label="DP 状态"
          value={serviceStatus?.ok ? (STATUS_CHIP_LABELS[serviceStatus.overallStatus] ?? "未知") : "—"}
          muted={!serviceStatus?.ok || serviceStatusFailed}
          title={
            serviceStatusFailed || !serviceStatus?.ok
              ? "状态页拉取失败，点击重试"
              : `DeepSeek 官方状态：${STATUS_CHIP_LABELS[serviceStatus.overallStatus] ?? serviceStatus.overallStatus}，${serviceStatus.activeChanges > 0 ? `${serviceStatus.activeChanges} 个进行中事件` : "全部系统运行正常"}`
          }
          onClick={onRefreshServiceStatus}
        />
      ) : null}
    </div>
  )
}
