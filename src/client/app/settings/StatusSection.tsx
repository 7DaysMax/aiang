import { useEffect, useMemo, useState } from "react"
import { Activity, ArrowUpRight, CircleAlert, ExternalLink, Loader2, RefreshCw, ShieldCheck, Wrench } from "lucide-react"
import type { DeepSeekStatusIncident, DeepSeekStatusLevel, DeepSeekStatusSnapshot } from "../../../shared/types"
import { Button } from "../../components/ui/button"
import { cn } from "../../lib/utils"
import { useDeepSeekStatusStore } from "../../stores/deepSeekStatusStore"

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

function StatusBadge({ status, label }: { status: DeepSeekStatusLevel; label: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
        STATUS_TEXT_COLORS[status],
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", STATUS_COLORS[status])} />
      {label}
    </span>
  )
}

function IncidentTypeTag({ type }: { type: "incident" | "maintenance" }) {
  return type === "maintenance" ? (
    <span className="inline-flex items-center gap-1 rounded-md bg-sky-500/10 px-1.5 py-0.5 text-[11px] font-medium text-sky-500">
      <Wrench className="h-3 w-3" /> 维护
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-md bg-red-500/10 px-1.5 py-0.5 text-[11px] font-medium text-red-500">
      <CircleAlert className="h-3 w-3" /> 故障
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
        <div className="flex flex-wrap items-center gap-2">
          <IncidentTypeTag type={incident.type} />
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
                <div key={update.id} className="relative flex gap-3">
                  <div className="flex flex-col items-center">
                    <span className={cn("mt-1 h-2 w-2 shrink-0 rounded-full", STATUS_COLORS[update.status as DeepSeekStatusLevel] ?? "bg-muted-foreground/40")} />
                  </div>
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

function StatusOverview({ snapshot, loading, onRefresh }: {
  snapshot: DeepSeekStatusSnapshot
  loading: boolean
  onRefresh: () => void
}) {
  const overall = snapshot.overallStatus
  const isOperational = overall === "operational"
  const statusLabel = STATUS_LABELS[overall]
  const desc = isOperational
    ? "所有系统均正常运行"
    : snapshot.activeChanges > 0
      ? `有 ${snapshot.activeChanges} 个进行中的事件`
      : "部分服务可能受到影响"

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border p-5",
        isOperational ? "border-emerald-500/20 bg-emerald-500/5" : "border-amber-500/20 bg-amber-500/5",
      )}
    >
      <div className="flex flex-wrap items-center gap-4">
        {snapshot.page.logo ? (
          <img
            src={snapshot.page.logo}
            alt="DeepSeek"
            className="h-10 w-10 shrink-0 rounded-lg object-contain"
            onError={(event) => {
              event.currentTarget.style.display = "none"
            }}
          />
        ) : (
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
            <ShieldCheck className="h-5 w-5 text-muted-foreground" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[15px] font-semibold text-foreground">DeepSeek 官方服务状态</span>
            <StatusBadge status={overall} label={statusLabel} />
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {desc} · 数据更新于 {formatFetchedAt(snapshot.updatedAt)}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onRefresh}
            disabled={loading}
            aria-label="刷新服务状态"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
            刷新
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              void window.open(`https://${snapshot.page.customDomain}`, "_blank")
            }}
          >
            官方页面
            <ArrowUpRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  )
}

export function StatusSection() {
  const status = useDeepSeekStatusStore((store) => store.status)
  const failed = useDeepSeekStatusStore((store) => store.failed)
  const loading = useDeepSeekStatusStore((store) => store.loading)
  const refresh = useDeepSeekStatusStore((store) => store.refresh)

  useEffect(() => {
    void refresh(true)
  }, [refresh])

  const grouped = useMemo<
    Array<{ name: string; uptime: number | null; components: DeepSeekStatusSnapshot["components"] }>
  >(() => {
    if (!status) return []
    const snapshot = status
    const sections = new Map<string, DeepSeekStatusSnapshot["components"]>()
    for (const component of snapshot.components) {
      const key = component.sectionId ?? ""
      if (!sections.has(key)) sections.set(key, [])
      sections.get(key)!.push(component)
    }
    return Array.from(sections.entries()).map(([sectionId, components]) => {
      const section = snapshot.sections.find((item) => item.id === sectionId)
      return {
        name: section?.name ?? "核心服务",
        uptime: section?.uptime ?? null,
        components,
      }
    })
  }, [status])

  return (
    <div className="flex flex-col gap-4">
      {status ? (
        <>
          <StatusOverview snapshot={status} loading={loading} onRefresh={() => void refresh(true)} />

          {failed && status.ok === false ? (
            <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              无法连接 DeepSeek 状态页，请检查网络或代理后重试。
            </div>
          ) : null}

          {status.components.length > 0 ? (
            <div className="flex flex-col gap-4">
              {grouped.map((group) => (
                <div key={group.name} className="rounded-xl border border-border bg-card/40">
                  <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
                    <span className="text-sm font-medium text-foreground">{group.name}</span>
                    {group.uptime !== null ? (
                      <span className="text-xs tabular-nums text-muted-foreground">
                        近 90 天可用率 <span className="font-medium text-foreground/90">{group.uptime}%</span>
                      </span>
                    ) : null}
                  </div>
                  <div className="divide-y divide-border">
                    {group.components.map((component) => (
                      <div key={component.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                        <span className={cn("h-2 w-2 shrink-0 rounded-full", STATUS_COLORS[component.status])} />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm text-foreground">{component.name}</div>
                          {component.description ? (
                            <div className="mt-0.5 truncate text-xs text-muted-foreground">{component.description}</div>
                          ) : null}
                        </div>
                        <span className="text-xs text-muted-foreground">{STATUS_LABELS[component.status]}</span>
                        {component.uptime !== null ? (
                          <span className="w-14 text-right text-xs tabular-nums text-muted-foreground">
                            {component.uptime}%
                          </span>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {status.incidents.length > 0 ? (
            <div className="rounded-xl border border-border bg-card/40">
              <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
                <Activity className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium text-foreground">事件与维护记录</span>
                <span className="ml-auto text-xs text-muted-foreground">共 {status.incidents.length} 条</span>
              </div>
              <div className="flex flex-col gap-3 p-4">
                {status.incidents.map((incident) => (
                  <IncidentCard key={incident.changeId} incident={incident} />
                ))}
              </div>
            </div>
          ) : null}

          <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
            <ExternalLink className="h-3 w-3" />
            数据来自{" "}
            <a
              href="https://status.deepseek.com"
              target="_blank"
              rel="noreferrer"
              className="text-foreground/80 underline underline-offset-2 hover:text-foreground"
            >
              status.deepseek.com
            </a>
            ，每 2 分钟自动同步
          </div>
        </>
      ) : (
        <div className="flex min-h-[240px] items-center justify-center rounded-2xl border border-border bg-card/40 px-4 py-6 text-sm text-muted-foreground">
          {loading ? (
            <span className="flex items-center gap-3">
              <Loader2 className="h-4 w-4 animate-spin" />
              正在获取 DeepSeek 官方状态…
            </span>
          ) : (
            <span className="flex items-center gap-3">
              <CircleAlert className="h-4 w-4" />
              无法获取服务状态
              <Button variant="outline" size="sm" onClick={() => void refresh(true)}>
                重试
              </Button>
            </span>
          )}
        </div>
      )}
    </div>
  )
}
