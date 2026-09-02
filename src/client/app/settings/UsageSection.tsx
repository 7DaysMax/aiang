import { useCallback, useEffect, useState } from "react"
import { ChevronRight } from "lucide-react"
import type { AgentProvider, ProviderUsageSnapshot, UsageLimitWindow, UsageLimitsSnapshot } from "../../../shared/types"
import { deriveModelLabel, PROVIDERS } from "../../../shared/types"
import { PROVIDER_ICONS } from "../../components/chat-ui/ChatPreferenceControls"
import { Tooltip, TooltipContent, TooltipTrigger } from "../../components/ui/tooltip"
import { formatRelativeTime } from "../../lib/formatters"
import { cn } from "../../lib/utils"
import { useChatPreferencesStore } from "../../stores/chatPreferencesStore"
import type { KannaState } from "../useKannaState"

const MINUTE_MS = 60_000

/** “40 分钟后” / “3 小时后” / “2 天后”——formatRelativeTime 的未来时态版本。 */
function formatUntil(isoTimestamp: string): string | null {
  const timestamp = Date.parse(isoTimestamp)
  if (!Number.isFinite(timestamp)) return null
  const delta = timestamp - Date.now()
  if (delta <= 0) return "现在"
  const totalMinutes = Math.max(1, Math.ceil(delta / MINUTE_MS))
  if (totalMinutes < 60) return `${totalMinutes}分钟后`
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours < 24) return `${hours}小时${minutes ? `${minutes}分钟` : ""}后`
  const days = Math.floor(hours / 24)
  const remainingHours = hours % 24
  return `${days}天${remainingHours ? `${remainingHours}小时` : ""}后`
}

function formatResetTime(isoTimestamp: string): string | null {
  const timestamp = Date.parse(isoTimestamp)
  if (!Number.isFinite(timestamp)) return null
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(timestamp)
}

const USAGE_TEXT_ZH: Record<string, string> = {
  "Could not read Claude usage.": "无法读取 Claude 用量，请检查登录状态后重试。",
  "Plan limits are not available for this session (API key or non-subscription auth).":
    "当前登录方式不提供订阅限额，请使用订阅账户登录。",
  "No plan limit windows reported.": "Claude 暂未返回可用的订阅限额。",
  "Could not read Codex usage.": "无法读取 Codex 用量，请检查登录状态后重试。",
  "No rate-limit windows reported (sign in to Codex with a ChatGPT plan).":
    "Codex 暂未返回用量限额，请使用 ChatGPT 订阅账户登录。",
  "No rate-limit windows reported.": "Codex 暂未返回可用的用量限额。",
  "Pi runs through the Model Registry (pay-per-token). No subscription limits to show.":
    "Pi 通过模型注册表按 Token 计费，没有可展示的订阅限额。",
  "Usage limits for Cursor are not available yet.": "Cursor 暂不支持读取用量限额。",
  "Could not read DeepSeek balance.": "无法读取 DeepSeek 账户余额，请稍后重试。",
  "No usage recorded yet.": "暂时还没有用量记录。",
  "Usage limits are not available.": "暂时无法读取用量限额。",
  "Extra usage": "额外用量",
  Credits: "额度",
  Unlimited: "不限量",
  "Rolling window": "滚动周期",
}

function localizeUsageText(value: string): string {
  return USAGE_TEXT_ZH[value] ?? value
}

function localizeWindowSuffix(value: string): string {
  if (value === "General quota") return "通用额度"
  const modelQuota = value.match(/^Model quota · (.+)$/)
  if (modelQuota) {
    // The surrounding card already says Codex; removing that repeated family
    // word keeps the quota name readable at phone widths without changing it.
    const model = modelQuota[1].replace(/^(GPT [\d.]+) Codex /, "$1 ")
    return `${model} 专属额度`
  }
  if (value === "OAuth apps") return "OAuth 应用"
  return value
}

function localizeWindowLabelParts(value: string): { period: string; scope: string | null } {
  if (value === "Current session (5-hour)") return { period: "当前会话（5 小时）", scope: null }

  const weekly = value.match(/^Weekly(?: · (.+))?$/)
  if (weekly) return { period: "每周", scope: weekly[1] ? localizeWindowSuffix(weekly[1]) : null }

  const duration = value.match(/^(\d+)-(minute|hour|day)(?: · (.+))?$/)
  if (duration) {
    const unit = duration[2] === "minute" ? "分钟" : duration[2] === "hour" ? "小时" : "天"
    return {
      period: `${duration[1]} ${unit}`,
      scope: duration[3] ? localizeWindowSuffix(duration[3]) : null,
    }
  }

  return { period: localizeUsageText(value), scope: null }
}

function localizeWindowLabel(value: string): string {
  const { period, scope } = localizeWindowLabelParts(value)
  return scope ? `${period} · ${scope}` : period
}

function formatPercent(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—"
  if (value > 0 && value < 1) return "<1%"
  return `${Math.round(value)}%`
}

function remainingPercent(usedPercent: number | null): number | null {
  return usedPercent === null || !Number.isFinite(usedPercent)
    ? null
    : Math.max(0, Math.min(100, 100 - usedPercent))
}

/** The currency symbol for a code ("$"), or "" for codes Intl doesn't know. */
function currencySymbol(currency: string | null): string {
  try {
    const parts = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency ?? "USD",
      maximumFractionDigits: 0,
    }).formatToParts(0)
    return parts.find((part) => part.type === "currency")?.value ?? ""
  } catch {
    return ""
  }
}

/**
 * Rounded and abbreviated above a thousand: 130.42 → "130", 2000 → "2k",
 * 7051.8 → "7.1k", 1_200_000 → "1.2m". Fractions are noise at this altitude.
 */
function formatCompact(value: number): string {
  const sign = value < 0 ? "-" : ""
  const abs = Math.abs(value)
  const unit = (scaled: number, suffix: string) =>
    `${sign}${scaled.toLocaleString("en-US", { maximumFractionDigits: 1 })}${suffix}`
  if (abs >= 1_000_000) return unit(abs / 1_000_000, "m")
  if (abs >= 1_000) return unit(abs / 1_000, "k")
  return `${sign}${Math.round(abs)}`
}

/** Whole-dollar money, abbreviated above a thousand: "$130", "$1.3k", "$2k", "$1.2m". */
function formatMoney(amount: number, currency: string | null): string {
  const compact = formatCompact(amount)
  const symbol = currencySymbol(currency)
  // Keep the symbol ahead of the sign: -$5, not $-5.
  return compact.startsWith("-") ? `-${symbol}${compact.slice(1)}` : `${symbol}${compact}`
}

/** Exact money for balances, keeping cents: 4.55 → "¥4.55". */
function formatBalanceMoney(amount: number, currency: string | null): string {
  const symbol = currencySymbol(currency)
  const value = amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return `${symbol}${value}`
}

function creditsSummary(credits: NonNullable<ProviderUsageSnapshot["credits"]>): string | null {
  const parts: string[] = []
  if (credits.balance != null) {
    const trimmed = credits.balance.trim()
    const numeric = /^\d+(\.\d+)?$/.test(trimmed) ? Number(trimmed) : null
    parts.push(numeric !== null ? formatBalanceMoney(numeric, credits.currency) : trimmed)
  }
  if (credits.usedAmount != null) {
    const used = formatMoney(credits.usedAmount, credits.currency)
    parts.push(credits.limitAmount != null ? `已使用 ${used} / ${formatMoney(credits.limitAmount, credits.currency)}` : `已使用 ${used}`)
  }
  if (credits.usedPercent != null) parts.push(`已使用 ${formatPercent(credits.usedPercent)}`)
  if (credits.detail) {
    // Codex reports its prepaid balance as a bare numeric string ("1000");
    // render it as a remaining count. Non-numeric details ("Unlimited") pass through.
    const numeric = /^\d+(\.\d+)?$/.test(credits.detail.trim()) ? Number(credits.detail) : null
    parts.push(numeric !== null ? `剩余 ${formatCompact(numeric)} 点额度` : localizeUsageText(credits.detail))
  }
  return parts.length > 0 ? parts.join(" · ") : null
}

function providerLabel(providerId: string): string {
  return PROVIDERS.find((entry) => entry.id === providerId)?.label ?? providerId
}

/**
 * Classify a plan string (Claude `subscription_type` / Codex `planType`) into a
 * personal vs org-managed account scope, so the card can show whether the
 * signed-in account is a personal or work/enterprise plan.
 * Personal tiers: free/go/plus/pro/prolite/max. Everything org-billed
 * (team/business/enterprise/edu) reads as "Enterprise".
 */
function accountScopeLabel(plan: string | null): string | null {
  if (!plan) return null
  const value = plan.toLowerCase()
  if (/team|business|enterprise|edu/.test(value)) return "企业"
  if (/free|go|plus|pro|prolite|max/.test(value)) return "个人"
  return null
}

function formatPlanLabel(plan: string | null): string | null {
  if (!plan) return null
  const labels: Record<string, string> = {
    free: "Free",
    go: "Go",
    plus: "Plus",
    pro: "Pro",
    prolite: "Pro Lite",
    max: "Max",
    team: "Team",
    business: "Business",
    enterprise: "Enterprise",
    edu: "Edu",
  }
  return labels[plan.toLowerCase()] ?? plan
}

function barColorClass(usedPercent: number | null): string {
  if (usedPercent === null) return "bg-muted-foreground/40"
  if (usedPercent >= 90) return "bg-red-500"
  if (usedPercent >= 75) return "bg-amber-500"
  return "bg-emerald-500"
}

function UsageBar({ usedPercent }: { usedPercent: number | null }) {
  const width = usedPercent === null ? 0 : Math.max(usedPercent > 0 ? 1.5 : 0, Math.min(100, usedPercent))
  return (
    <div
      className="h-2 w-full overflow-hidden rounded-full bg-muted"
      role="progressbar"
      aria-label={usedPercent === null ? "用量未知" : `已使用 ${formatPercent(usedPercent)}`}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={usedPercent ?? undefined}
    >
      <div
        className={cn("h-full rounded-full transition-[width] duration-500 ease-out", barColorClass(usedPercent))}
        style={{ width: `${width}%` }}
      />
    </div>
  )
}

/** Shared grid so every window row lines up like a table (settings + empty state). */
const WINDOW_ROW_GRID = cn(
  "grid grid-cols-[minmax(0,1.65fr)_minmax(3rem,1fr)_4.75rem] items-center gap-3",
  "md:grid-cols-[minmax(0,1fr)_5.75rem_minmax(4rem,1.4fr)_4.75rem]",
)

/**
 * Same grid for a collapsed card's header, minus the reset column on narrow
 * screens — the provider name plus a meter is all that fits on a phone, and the
 * reset time is one tap away in the expanded rows.
 */
const COLLAPSED_HEADER_GRID = cn(
  "grid grid-cols-[minmax(0,1fr)_minmax(4rem,1.4fr)_4.75rem] items-center gap-3",
  "md:grid-cols-[minmax(0,1fr)_5.75rem_minmax(4rem,1.4fr)_4.75rem]",
)

function WindowRow({ window }: { window: UsageLimitWindow }) {
  const resets = window.resetsAt ? formatUntil(window.resetsAt) : null
  const resetTime = window.resetsAt ? formatResetTime(window.resetsAt) : null
  const remaining = remainingPercent(window.usedPercent)
  const label = localizeWindowLabelParts(window.label)
  return (
    <div className={WINDOW_ROW_GRID}>
      <div className="min-w-0">
        <div className="truncate text-sm text-foreground">{label.period}</div>
        {label.scope ? (
          <div className="text-[11px] leading-4 text-muted-foreground md:truncate" title={label.scope}>{label.scope}</div>
        ) : null}
        {resets ? <div className="truncate text-[10px] text-muted-foreground md:hidden">{resets}重置</div> : null}
      </div>
      {resets ? (
        <Tooltip delayDuration={0}>
          <TooltipTrigger asChild>
            <span className="hidden truncate text-xs text-muted-foreground md:block">{resets}重置</span>
          </TooltipTrigger>
          <TooltipContent side="top" align="center">重置时间：{resetTime}</TooltipContent>
        </Tooltip>
      ) : <div className="hidden md:block" />}
      <UsageBar usedPercent={window.usedPercent} />
      <div className="flex flex-col items-end text-right tabular-nums">
        <span className="text-xs font-medium text-foreground">已用 {formatPercent(window.usedPercent)}</span>
        <span className="text-[10px] text-muted-foreground">剩余 {formatPercent(remaining)}</span>
      </div>
    </div>
  )
}

export function ProviderCard({
  snapshot,
  activeModel,
  collapsible = false,
  refreshing = false,
  onRefresh,
}: {
  snapshot: ProviderUsageSnapshot
  /** The model selected in provider settings; separate from model-specific quota buckets. */
  activeModel?: string | null
  /** When true, the card starts collapsed and the header toggles it open/closed. */
  collapsible?: boolean
  /** Show "Refreshing…" in the header's timestamp slot while a read is in flight. */
  refreshing?: boolean
  /**
   * Force a refresh of all providers. When set (and the card isn't collapsible,
   * whose header is already a toggle button), the "Updated …" timestamp becomes
   * the clickable refresh affordance — no separate button.
   */
  onRefresh?: () => void
}) {
  const Icon = PROVIDER_ICONS[snapshot.provider]
  const hasContent = snapshot.windows.length > 0 || snapshot.credits || Boolean(activeModel)
  const [expanded, setExpanded] = useState(false)
  const showBody = !collapsible || expanded

  const timestampText = refreshing
    ? "刷新中…"
    : snapshot.updatedAt
      ? `${formatRelativeTime(snapshot.updatedAt) || "刚刚"}${snapshot.status === "ok" ? "更新" : "检查"}`
      : onRefresh
        ? "刷新"
        : null

  // The timestamp doubles as the refresh control on non-collapsible cards
  // (collapsible headers are already a toggle button — no nesting buttons).
  const timestampNode = timestampText === null
    ? null
    : onRefresh && !collapsible ? (
      <Tooltip delayDuration={0}>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => {
              if (!refreshing) onRefresh()
            }}
            className="shrink-0 cursor-pointer text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            {timestampText}
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" align="center">刷新用量</TooltipContent>
      </Tooltip>
    ) : (
      <span className="shrink-0 text-xs text-muted-foreground">{timestampText}</span>
    )

  // Scope and plan share one pill ("Personal Pro"); `capitalize` title-cases the
  // raw plan string ("max" → "Max").
  const planBadgeText = [accountScopeLabel(snapshot.plan), formatPlanLabel(snapshot.plan)].filter(Boolean).join(" ")

  const identity = (
    <div className="flex min-w-0 items-center gap-2.5">
      {collapsible ? (
        // Harness icon by default; on card hover it cross-fades (scale/fade/
        // blur, like the sidebar logo) to a chevron indicating expand state.
        <span className="relative flex h-4 w-4 shrink-0 items-center justify-center">
          <Icon className="absolute inset-0 h-4 w-4 text-foreground transition-all duration-150 ease-out opacity-100 scale-100 blur-none group-hover/usage-card:opacity-0 group-hover/usage-card:scale-50 group-hover/usage-card:blur-[1px]" />
          <ChevronRight
            className={cn(
              "absolute inset-0 h-4 w-4 text-muted-foreground transition-all duration-150 ease-out opacity-0 scale-50 blur-[1px] group-hover/usage-card:opacity-100 group-hover/usage-card:scale-100 group-hover/usage-card:blur-none",
              expanded ? "rotate-90" : undefined,
            )}
          />
        </span>
      ) : (
        <Icon className="h-4 w-4 shrink-0 text-foreground" />
      )}
      <span className="truncate text-sm font-semibold text-foreground">
        {providerLabel(snapshot.provider)}
      </span>
      {planBadgeText ? (
        <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
          {planBadgeText}
        </span>
      ) : null}
    </div>
  )

  // Collapsed cards fold the first window's meter into the header, laid out on
  // the same grid the expanded rows use so every bar lines up card to card. The
  // row title and the freshness stamp (which the header no longer prints) live
  // in the bar's tooltip instead.
  const summaryWindow = snapshot.windows[0] ?? null
  const summaryResets = summaryWindow?.resetsAt ? formatUntil(summaryWindow.resetsAt) : null

  const header = showBody ? (
    <div className="flex items-center justify-between gap-3">
      {identity}
      {timestampNode}
    </div>
  ) : (
    <div className={COLLAPSED_HEADER_GRID}>
      {identity}
      <div className="hidden truncate text-xs text-muted-foreground md:block">
        {summaryResets ? `${summaryResets}重置` : ""}
      </div>
      {summaryWindow ? (
        <Tooltip delayDuration={0}>
          <TooltipTrigger asChild>
            {/* Padding widens the 8px bar's hover target without adding height:
                the identity column already sets the row's height. */}
            <div className="min-w-0 py-1.5">
              <UsageBar usedPercent={summaryWindow.usedPercent} />
            </div>
          </TooltipTrigger>
          <TooltipContent side="top" align="center">
            <div>{localizeWindowLabel(summaryWindow.label)}</div>
            {timestampText ? <div className="text-muted-foreground">{timestampText}</div> : null}
          </TooltipContent>
        </Tooltip>
      ) : (
        <div />
      )}
      <div className="text-right text-sm font-medium tabular-nums text-foreground">
        {summaryWindow ? `剩余 ${formatPercent(remainingPercent(summaryWindow.usedPercent))}` : ""}
      </div>
    </div>
  )

  const body = showBody ? (
    hasContent ? (
      <div className="mt-4 space-y-2.5">
        {activeModel ? (
          <div className="flex items-baseline justify-between gap-3 border-b border-border pb-3">
            <span className="text-xs text-muted-foreground">当前模型</span>
            <span className="truncate text-sm font-medium text-foreground" title={activeModel}>
              {deriveModelLabel(activeModel)}
            </span>
          </div>
        ) : null}
        {snapshot.windows.map((window) => (
          <WindowRow key={window.id} window={window} />
        ))}
        {snapshot.credits ? (
          <div className="flex items-baseline justify-between gap-3 border-t border-border pt-3 text-sm">
            <span className="text-foreground">{localizeUsageText(snapshot.credits.label)}</span>
            <span className="text-muted-foreground">{creditsSummary(snapshot.credits)}</span>
          </div>
        ) : null}
        {snapshot.detail ? (
          <div className="text-xs text-muted-foreground">{localizeUsageText(snapshot.detail)}</div>
        ) : null}
      </div>
    ) : (
      <div className="mt-3 text-sm text-muted-foreground">
        {snapshot.detail
          ? localizeUsageText(snapshot.detail)
          : snapshot.status === "unknown"
            ? "暂时还没有用量记录。"
            : "暂时无法读取用量限额。"}
      </div>
    )
  ) : null

  const cardClass = "group/usage-card block w-full rounded-2xl border border-border bg-card/40 px-3.5 py-3 text-left"

  // Collapsible cards toggle on click anywhere on the card; non-collapsible
  // cards stay a plain container (they carry their own interactive controls).
  if (collapsible) {
    return (
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        aria-expanded={expanded}
        className={cn(cardClass, "cursor-pointer")}
      >
        {header}
        {body}
      </button>
    )
  }

  return (
    <div className={cardClass}>
      {header}
      {body}
    </div>
  )
}

/** How often an open usage view re-checks; server-side TTL coalesces the reads. */
const USAGE_POLL_MS = 60_000

export function UsageSection({ state }: { state: Pick<KannaState, "socket"> }) {
  const socket = state.socket
  const codexModel = useChatPreferencesStore((store) => store.providerDefaults.codex.model)
  const [snapshot, setSnapshot] = useState<UsageLimitsSnapshot | null>(null)
  const [refreshingProvider, setRefreshingProvider] = useState<AgentProvider | "all" | null>("all")

  // Live subscription: the immediate push shows cached/stale data right away,
  // and turn-pushed updates land here while the view is open.
  useEffect(() => {
    return socket.subscribe<UsageLimitsSnapshot>({ type: "usage-limits" }, setSnapshot)
  }, [socket])

  const runRefresh = useCallback(
    async (force: boolean, provider?: AgentProvider) => {
      setRefreshingProvider(provider ?? "all")
      try {
        const result = await socket.command<UsageLimitsSnapshot>({ type: "usage.refresh", force, provider })
        if (result && Array.isArray(result.providers)) setSnapshot(result)
      } catch {
        // Errors surface as "unavailable" provider states in the snapshot.
      } finally {
        setRefreshingProvider(null)
      }
    },
    [socket],
  )

  // Keep the view current on its own: refresh on open and every minute while
  // visible. Both are TTL-respecting (force=false), so the server coalesces to
  // at most one real read per minute regardless of how many views poll.
  useEffect(() => {
    void runRefresh(false)
    const interval = setInterval(() => {
      if (typeof document === "undefined" || document.visibilityState === "visible") {
        void runRefresh(false)
      }
    }, USAGE_POLL_MS)
    return () => clearInterval(interval)
  }, [runRefresh])

  return (
    <div className="space-y-4">
      {snapshot ? (
        // Always render whatever we have (cached/stale) — the poll swaps in
        // fresh numbers when they land; the header "Updated …" is the control.
        snapshot.providers.map((provider) => (
          <ProviderCard
            key={provider.provider}
            snapshot={provider}
            activeModel={provider.provider === "codex" ? codexModel : undefined}
            refreshing={refreshingProvider === "all" || refreshingProvider === provider.provider}
            onRefresh={provider.provider === "deepseek" || provider.provider === "claude" || provider.provider === "codex"
              ? () => {
                if (refreshingProvider === null) void runRefresh(true, provider.provider)
              }
              : undefined}
          />
        ))
      ) : (
        <div className="rounded-2xl border border-border bg-card/40 px-5 py-6 text-sm text-muted-foreground">
          正在加载用量…
        </div>
      )}
    </div>
  )
}
