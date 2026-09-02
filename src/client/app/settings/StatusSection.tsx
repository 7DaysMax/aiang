import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Activity, ArrowUpRight, ChevronRight, CircleAlert, Loader2, RefreshCw, Wrench } from "lucide-react"
import type { AgentProvider, DeepSeekStatusIncident, DeepSeekStatusLevel } from "../../../shared/types"
import { PROVIDER_ICONS } from "../../components/provider-icons"
import { Button } from "../../components/ui/button"
import { SegmentedControl, type SegmentedOption } from "../../components/ui/segmented-control"
import { cn } from "../../lib/utils"
import { useDeepSeekStatusStore } from "../../stores/deepSeekStatusStore"
import { useProviderAuthStore } from "../../stores/providerAuthStore"
import type { KannaState } from "../useKannaState"
import {
  deriveLocalEngineAccess,
  loadOfficialProviderStatuses,
  OFFICIAL_STATUS_SOURCES,
  type LocalAccessTone,
  type OfficialProviderStatus,
  type OfficialStatusEvent,
} from "./status-data"

export const STATUS_LABELS: Record<DeepSeekStatusLevel, string> = {
  operational: "运行正常",
  degraded: "性能下降",
  partial_outage: "部分中断",
  full_outage: "完全中断",
  maintenance: "维护中",
}

const INCIDENT_STATUS_LABELS: Record<string, string> = {
  investigating: "调查中",
  identified: "已定位",
  monitoring: "监控中",
  resolved: "已解决",
  scheduled: "已计划",
  in_progress: "进行中",
  completed: "已完成",
  cancelled: "已取消",
}

export const STATUS_COLORS: Record<DeepSeekStatusLevel, string> = {
  operational: "bg-emerald-500",
  degraded: "bg-amber-500",
  partial_outage: "bg-orange-500",
  full_outage: "bg-red-500",
  maintenance: "bg-sky-500",
}

const STATUS_TEXT_COLORS: Record<DeepSeekStatusLevel, string> = {
  operational: "text-emerald-500",
  degraded: "text-amber-500",
  partial_outage: "text-orange-500",
  full_outage: "text-red-500",
  maintenance: "text-sky-500",
}

const ACCESS_TONE_CLASSES: Record<LocalAccessTone, string> = {
  ready: "border-emerald-500/25 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  attention: "border-amber-500/25 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  unavailable: "border-border bg-muted/40 text-muted-foreground",
  checking: "border-sky-500/25 bg-sky-500/10 text-sky-600 dark:text-sky-400",
}

const MAX_VISIBLE_EVENTS = 5

function formatDateTime(seconds: number): string {
  const date = new Date(seconds * 1000)
  if (!Number.isFinite(date.getTime())) return "—"
  return date.toLocaleString("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function formatFetchedAt(ms: number): string {
  const date = new Date(ms)
  if (!Number.isFinite(date.getTime())) return "—"
  return date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
}

function formatEventAt(ms: number): string {
  const date = new Date(ms)
  if (!Number.isFinite(date.getTime())) return "—"
  return date.toLocaleString("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function StatusBadge({ status, label }: { status: DeepSeekStatusLevel; label: string }) {
  return (
    <span className={cn(
      "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
      STATUS_TEXT_COLORS[status],
    )}>
      <span className={cn("h-1.5 w-1.5 rounded-full", STATUS_COLORS[status])} />
      {label}
    </span>
  )
}

export function incidentTypePresentation(type: "incident" | "maintenance", active: boolean) {
  if (!active) {
    return {
      label: type === "maintenance" ? "维护记录" : "历史故障",
      tone: "muted" as const,
    }
  }
  return type === "maintenance"
    ? { label: "维护中", tone: "maintenance" as const }
    : { label: "当前故障", tone: "danger" as const }
}

function IncidentTypeTag({ type, active }: { type: "incident" | "maintenance"; active: boolean }) {
  const presentation = incidentTypePresentation(type, active)
  const Icon = type === "maintenance" ? Wrench : CircleAlert
  return (
    <span className={cn(
      "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium",
      presentation.tone === "danger" && "bg-destructive/10 text-destructive",
      presentation.tone === "maintenance" && "bg-primary/10 text-primary",
      presentation.tone === "muted" && "bg-muted text-muted-foreground",
    )}>
      <Icon className="size-3" /> {presentation.label}
    </span>
  )
}

function IncidentCard({ incident }: { incident: DeepSeekStatusIncident }) {
  const [expanded, setExpanded] = useState(false)
  const statusLabel = INCIDENT_STATUS_LABELS[incident.status] ?? incident.status
  const resolved = incident.status === "resolved" || incident.status === "completed" || incident.status === "cancelled"
  const startLabel = formatDateTime(incident.startAtSeconds)
  const endLabel = incident.closeAtSeconds ? formatDateTime(incident.closeAtSeconds) : "进行中"

  return (
    <div className="rounded-xl border border-border bg-card/40">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="flex w-full cursor-pointer flex-col gap-2 px-4 py-3 text-left hover:bg-muted/30"
      >
        <div className="flex w-full flex-wrap items-center gap-2">
          <IncidentTypeTag type={incident.type} active={!resolved} />
          <span className={cn("text-xs font-medium", resolved ? "text-muted-foreground" : STATUS_TEXT_COLORS.degraded)}>
            {statusLabel}
          </span>
          <span className="ml-auto text-xs tabular-nums text-muted-foreground">
            {startLabel} → {endLabel}
          </span>
        </div>
        <div className="text-sm font-medium leading-snug text-foreground">{incident.title}</div>
        <div className="text-xs text-muted-foreground">
          {incident.affectedComponents.map((component) => component.name).join("、") || "未标明影响组件"}
        </div>
      </button>

      {expanded ? (
        <div className="border-t border-border px-4 py-3">
          {incident.description ? (
            <p className="whitespace-pre-line text-xs leading-relaxed text-muted-foreground">{incident.description}</p>
          ) : null}
          {incident.updates.length > 0 ? (
            <div className="mt-3 flex flex-col gap-3">
              {incident.updates.map((update) => (
                <div key={update.id} className="flex gap-3">
                  <span className={cn(
                    "mt-1 h-2 w-2 shrink-0 rounded-full",
                    STATUS_COLORS[update.status as DeepSeekStatusLevel] ?? "bg-muted-foreground/40",
                  )} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="font-medium text-foreground">
                        {INCIDENT_STATUS_LABELS[update.status] ?? update.status}
                      </span>
                      <span className="tabular-nums text-muted-foreground">{formatDateTime(update.atSeconds)}</span>
                    </div>
                    {update.description ? (
                      <p className="mt-0.5 whitespace-pre-line text-xs leading-relaxed text-muted-foreground">
                        {update.description}
                      </p>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

interface OfficialStatusRowModel {
  provider: "deepseek" | OfficialProviderStatus["provider"]
  label: string
  statusPageUrl: string
  status: DeepSeekStatusLevel | null
  updatedAt: number | null
  components: Array<{
    id: string
    name: string
    status: DeepSeekStatusLevel
    description: string | null
    uptime?: number | null
  }>
  events: OfficialStatusEvent[]
  deepSeekIncidents?: DeepSeekStatusIncident[]
  detailWarning: string | null
  error: string | null
}

function ProviderMark({ provider }: { provider: AgentProvider }) {
  const Icon = PROVIDER_ICONS[provider]
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-background shadow-sm">
      <Icon className="h-5 w-5 text-foreground" />
    </span>
  )
}

function OfficialStatusRow({
  row,
  loading,
  onSelect,
}: {
  row: OfficialStatusRowModel
  loading: boolean
  onSelect: () => void
}) {
  const currentEvent = row.events.find((event) => event.active)
  const detail = row.error
    ? "无法连接官方状态页，点击刷新重试"
    : currentEvent
      ? `当前事件：${currentEvent.title}`
      : row.components.length > 0
        ? row.components.map((component) => `${component.name} ${STATUS_LABELS[component.status]}`).join(" · ")
        : "正在读取官方状态"

  return (
    <div className="flex items-start gap-3 px-4 py-3.5">
      <ProviderMark provider={row.provider} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-foreground">{row.label}</span>
          {row.status ? (
            <StatusBadge status={row.status} label={STATUS_LABELS[row.status]} />
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
              {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <CircleAlert className="h-3 w-3" />}
              {loading ? "检测中" : "获取失败"}
            </span>
          )}
        </div>
        <p className={cn("mt-1 line-clamp-2 text-xs leading-5", row.error ? "text-destructive" : "text-muted-foreground")}>
          {detail}
        </p>
        {row.updatedAt ? (
          <p className="mt-0.5 text-[11px] tabular-nums text-muted-foreground/75">更新于 {formatFetchedAt(row.updatedAt)}</p>
        ) : null}
      </div>
      <Button variant="ghost" size="sm" onClick={onSelect} aria-label={`查看 ${row.label} 详情`}>
        详情
        <ChevronRight data-icon="inline-end" />
      </Button>
    </div>
  )
}

function StatuspageEventRow({ event }: { event: OfficialStatusEvent }) {
  return (
    <div className="flex flex-col gap-1.5 py-3 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center gap-2">
        <IncidentTypeTag type={event.type} active={event.active} />
        <span className="text-xs font-medium text-muted-foreground">
          {INCIDENT_STATUS_LABELS[event.status] ?? event.status}
        </span>
        {event.updatedAt ? (
          <span className="ml-auto text-xs tabular-nums text-muted-foreground">{formatEventAt(event.updatedAt)}</span>
        ) : null}
      </div>
      <div className="text-sm font-medium leading-snug text-foreground">{event.title}</div>
      <div className="text-xs text-muted-foreground">
        {event.affectedComponents.join("、") || "未标明影响组件"}
      </div>
    </div>
  )
}

function OfficialProviderDetail({ row, loading }: { row: OfficialStatusRowModel; loading: boolean }) {
  const eventCount = row.deepSeekIncidents?.length ?? row.events.length
  const visibleDeepSeekIncidents = row.deepSeekIncidents?.slice(0, MAX_VISIBLE_EVENTS)
  const visibleEvents = row.events.slice(0, MAX_VISIBLE_EVENTS)

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card/40">
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3.5">
        <ProviderMark provider={row.provider} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-foreground">{row.label} 详情</span>
            {row.status ? <StatusBadge status={row.status} label={STATUS_LABELS[row.status]} /> : null}
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {row.updatedAt ? `数据更新于 ${formatFetchedAt(row.updatedAt)}` : "等待官方状态数据"}
          </div>
        </div>
        <a
          href={row.statusPageUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          官方页面
          <ArrowUpRight className="h-3.5 w-3.5" />
        </a>
      </div>

      {loading ? (
        <div className="flex min-h-32 items-center justify-center gap-2 px-4 py-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          正在获取 {row.label} 详情…
        </div>
      ) : row.error ? (
        <div className="flex min-h-32 items-center justify-center gap-2 px-4 py-6 text-sm text-destructive">
          <CircleAlert className="h-4 w-4" />
          {row.label} 详情暂时不可用，可点击“全部刷新”重试。
        </div>
      ) : (
        <>
          {row.detailWarning ? (
            <div className="flex items-start gap-2 border-b border-border bg-muted/30 px-4 py-2.5 text-xs text-muted-foreground">
              <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {row.detailWarning}
            </div>
          ) : null}
          <div className="grid md:grid-cols-2">
          <div className="border-b border-border p-4 md:border-b-0 md:border-r">
            <div className="mb-3 flex items-center gap-2">
              <Activity className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium text-foreground">服务组件</span>
              <span className="ml-auto text-xs tabular-nums text-muted-foreground">共 {row.components.length} 项</span>
            </div>
            {row.components.length > 0 ? (
              <div className="divide-y divide-border">
                {row.components.map((component) => (
                  <div key={component.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                    <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", STATUS_COLORS[component.status])} />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm text-foreground">{component.name}</div>
                      {component.description ? (
                        <div className="mt-0.5 line-clamp-2 text-xs leading-5 text-muted-foreground">{component.description}</div>
                      ) : null}
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-xs text-muted-foreground">{STATUS_LABELS[component.status]}</div>
                      {component.uptime !== undefined && component.uptime !== null ? (
                        <div className="mt-0.5 text-[11px] tabular-nums text-muted-foreground/75">{component.uptime}%</div>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-6 text-center text-sm text-muted-foreground">暂无组件数据</div>
            )}
          </div>

          <div className="p-4">
            <div className="mb-3 flex items-center gap-2">
              <CircleAlert className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium text-foreground">事件与维护记录</span>
              <span className="ml-auto text-xs tabular-nums text-muted-foreground">
                {eventCount > MAX_VISIBLE_EVENTS ? `最近 ${MAX_VISIBLE_EVENTS} / 共 ${eventCount} 条` : `共 ${eventCount} 条`}
              </span>
            </div>
            {visibleDeepSeekIncidents && visibleDeepSeekIncidents.length > 0 ? (
              <div className="flex flex-col gap-3">
                {visibleDeepSeekIncidents.map((incident) => (
                  <IncidentCard key={incident.changeId} incident={incident} />
                ))}
              </div>
            ) : visibleEvents.length > 0 ? (
              <div className="divide-y divide-border">
                {visibleEvents.map((event) => <StatuspageEventRow key={event.id} event={event} />)}
              </div>
            ) : (
              <div className="flex min-h-24 items-center justify-center rounded-lg bg-muted/25 px-4 py-6 text-center text-sm text-muted-foreground">
                当前没有影响 {row.label} 的事件或计划维护。
              </div>
            )}
            {eventCount > MAX_VISIBLE_EVENTS ? (
              <p className="mt-3 text-xs leading-5 text-muted-foreground">
                此处只显示最近 {MAX_VISIBLE_EVENTS} 条，完整记录可在官方页面查看。
              </p>
            ) : null}
          </div>
          </div>
        </>
      )}
    </div>
  )
}

export function StatusSection({ state }: { state: Pick<KannaState, "socket" | "appSettings" | "llmProvider"> }) {
  const status = useDeepSeekStatusStore((store) => store.status)
  const failed = useDeepSeekStatusStore((store) => store.failed)
  const deepSeekLoading = useDeepSeekStatusStore((store) => store.loading)
  const refreshDeepSeek = useDeepSeekStatusStore((store) => store.refresh)
  const providerAuth = useProviderAuthStore((store) => store.snapshot)
  const [officialStatuses, setOfficialStatuses] = useState<OfficialProviderStatus[]>(() => (
    OFFICIAL_STATUS_SOURCES.map((source) => ({
      provider: source.provider,
      label: source.label,
      statusPageUrl: source.statusPageUrl,
      ok: false,
      status: null,
      updatedAt: null,
      components: [],
      events: [],
      detailWarning: null,
      error: null,
    }))
  ))
  const [officialLoading, setOfficialLoading] = useState(true)
  const [authRefreshError, setAuthRefreshError] = useState<string | null>(null)
  const [selectedOfficialProvider, setSelectedOfficialProvider] = useState<OfficialStatusRowModel["provider"]>("deepseek")
  const refreshingRef = useRef(false)

  const refreshAll = useCallback(async (force: boolean, includeLocal: boolean) => {
    if (refreshingRef.current) return
    refreshingRef.current = true
    setOfficialLoading(true)
    if (includeLocal) setAuthRefreshError(null)

    const [officialResult, , authResult] = await Promise.allSettled([
      loadOfficialProviderStatuses(fetch, (incoming) => {
        setOfficialStatuses((current) => current.map((entry) => (
          entry.provider === incoming.provider ? incoming : entry
        )))
      }),
      refreshDeepSeek(force),
      includeLocal ? state.socket.command({ type: "auth.refresh", force }) : Promise.resolve(),
    ])

    if (officialResult.status === "fulfilled") setOfficialStatuses(officialResult.value)
    if (includeLocal && authResult.status === "rejected") {
      setAuthRefreshError("本机引擎检测失败，请确认 Youmi 服务已连接后重试。")
    }
    setOfficialLoading(false)
    refreshingRef.current = false
  }, [refreshDeepSeek, state.socket])

  useEffect(() => {
    void refreshAll(false, true)
    const interval = window.setInterval(() => {
      void refreshAll(false, false)
    }, 120_000)
    return () => window.clearInterval(interval)
  }, [refreshAll])

  const officialRows = useMemo<OfficialStatusRowModel[]>(() => {
    const deepSeekRow: OfficialStatusRowModel = {
      provider: "deepseek",
      label: "DeepSeek",
      statusPageUrl: "https://status.deepseek.com",
      status: failed && status?.ok === false ? null : status?.overallStatus ?? null,
      updatedAt: status?.updatedAt ?? null,
      components: status?.components.map((component) => ({
        id: component.id,
        name: component.name,
        status: component.status,
        description: component.description,
        uptime: component.uptime,
      })) ?? [],
      events: status?.incidents.map((incident) => ({
        id: String(incident.changeId),
        title: incident.title,
        type: incident.type,
        status: incident.status,
        impact: null,
        updatedAt: (incident.closeAtSeconds || incident.startAtSeconds) * 1000,
        affectedComponents: incident.affectedComponents.map((component) => component.name),
        active: !["resolved", "completed", "cancelled"].includes(incident.status),
      })) ?? [],
      deepSeekIncidents: status?.incidents,
      detailWarning: null,
      error: failed && !deepSeekLoading ? "DeepSeek status unavailable" : null,
    }
    return [deepSeekRow, ...officialStatuses]
  }, [deepSeekLoading, failed, officialStatuses, status])

  const selectedOfficialRow = officialRows.find((row) => row.provider === selectedOfficialProvider) ?? officialRows[0]!
  const detailOptions = useMemo<SegmentedOption<OfficialStatusRowModel["provider"]>[]>(() => (
    officialRows.map((row) => {
      const Icon = PROVIDER_ICONS[row.provider]
      return {
        value: row.provider,
        label: row.label,
        icon: <Icon className="h-4 w-4" />,
      }
    })
  ), [officialRows])

  const localAccess = useMemo(() => deriveLocalEngineAccess({
    auth: providerAuth,
    appSettings: state.appSettings,
    llmProvider: state.llmProvider,
  }), [providerAuth, state.appSettings, state.llmProvider])

  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="official-status-heading">
        <div className="mb-3 flex items-end justify-between gap-4">
          <div>
            <h3 id="official-status-heading" className="text-sm font-semibold text-foreground">官方服务状态</h3>
            <p className="mt-1 text-xs text-muted-foreground">只统计与当前引擎相关的官方组件，每行都可查看详情。</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void refreshAll(true, true)}
            disabled={officialLoading || deepSeekLoading}
          >
            <RefreshCw data-icon="inline-start" className={cn((officialLoading || deepSeekLoading) && "animate-spin")} />
            全部刷新
          </Button>
        </div>
        <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card/40">
          {officialRows.map((row) => (
            <OfficialStatusRow
              key={row.provider}
              row={row}
              loading={(row.provider === "deepseek" ? deepSeekLoading : officialLoading) && !row.status}
              onSelect={() => setSelectedOfficialProvider(row.provider)}
            />
          ))}
        </div>
      </section>

      <section aria-labelledby="official-detail-heading">
        <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h3 id="official-detail-heading" className="text-sm font-semibold text-foreground">官方服务详情</h3>
            <p className="mt-1 text-xs text-muted-foreground">切换查看各引擎的组件、近期事件和计划维护。</p>
          </div>
          <div className="max-w-full overflow-x-auto pb-0.5">
            <SegmentedControl
              value={selectedOfficialProvider}
              onValueChange={setSelectedOfficialProvider}
              options={detailOptions}
              size="sm"
              className="min-w-max"
            />
          </div>
        </div>
        <OfficialProviderDetail
          row={selectedOfficialRow}
          loading={(selectedOfficialRow.provider === "deepseek" ? deepSeekLoading : officialLoading) && !selectedOfficialRow.status}
        />
      </section>

      <section aria-labelledby="local-access-heading">
        <div className="mb-3">
          <h3 id="local-access-heading" className="text-sm font-semibold text-foreground">本机引擎接入</h3>
          <p className="mt-1 text-xs text-muted-foreground">登录与模型档案只在本机检测，不会显示 API Key。</p>
        </div>
        {authRefreshError ? (
          <div className="mb-3 flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2.5 text-xs text-destructive">
            <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {authRefreshError}
          </div>
        ) : null}
        <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card/40">
          {localAccess.map((entry) => (
            <div key={entry.provider} className="flex items-center gap-3 px-4 py-3.5">
              <ProviderMark provider={entry.provider} />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-foreground">{entry.label}</div>
                <div className="mt-0.5 truncate text-xs text-muted-foreground" title={entry.detail}>{entry.detail}</div>
              </div>
              <span className={cn(
                "shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-medium",
                ACCESS_TONE_CLASSES[entry.tone],
              )}>
                {entry.statusLabel}
              </span>
            </div>
          ))}
        </div>
      </section>

    </div>
  )
}
