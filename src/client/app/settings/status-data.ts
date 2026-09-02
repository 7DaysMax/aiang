import { engineUsesModelProfile } from "../../../shared/engine-family"
import type { ModelProfile } from "../../../shared/model-profile"
import {
  PROVIDERS,
  type AgentProvider,
  type AppSettingsSnapshot,
  type AuthServiceSnapshot,
  type DeepSeekStatusLevel,
  type LlmProviderSnapshot,
  type ProviderAuthSnapshot,
} from "../../../shared/types"

export type OfficialProviderId = "claude" | "codex" | "cursor"

export interface OfficialStatusComponent {
  id: string
  name: string
  status: DeepSeekStatusLevel
  description: string | null
}

export interface OfficialStatusEvent {
  id: string
  title: string
  type: "incident" | "maintenance"
  status: string
  impact: string | null
  updatedAt: number | null
  affectedComponents: string[]
  active: boolean
}

export interface OfficialProviderStatus {
  provider: OfficialProviderId
  label: string
  statusPageUrl: string
  ok: boolean
  status: DeepSeekStatusLevel | null
  updatedAt: number | null
  components: OfficialStatusComponent[]
  events: OfficialStatusEvent[]
  detailWarning: string | null
  error: string | null
}

interface StatuspageComponent {
  id: string
  name: string
  status: string
  description?: string | null
}

interface StatuspageIncident {
  id?: string
  name?: string
  status?: string
  impact?: string | null
  updated_at?: string
  components?: Array<{ id?: string; name?: string }>
  incident_updates?: Array<{
    body?: string | null
    affected_components?: Array<{ code?: string; id?: string }>
  }>
}

interface StatuspageSummary {
  page?: { updated_at?: string }
  components?: StatuspageComponent[]
  incidents?: StatuspageIncident[]
  scheduled_maintenances?: StatuspageIncident[]
}

interface OfficialStatusSource {
  provider: OfficialProviderId
  label: string
  statusPageUrl: string
  summaryUrl: string
  incidentsUrl: string
  maintenancesUrl?: string
  matchesComponent: (name: string) => boolean
  matchesEventText?: (text: string) => boolean
}

export const OFFICIAL_STATUS_SOURCES: readonly OfficialStatusSource[] = [
  {
    provider: "claude",
    label: "Claude Code",
    statusPageUrl: "https://status.claude.com",
    summaryUrl: "https://status.claude.com/api/v2/summary.json",
    incidentsUrl: "https://status.claude.com/api/v2/incidents.json",
    maintenancesUrl: "https://status.claude.com/api/v2/scheduled-maintenances.json",
    matchesComponent: (name) => /^(Claude Code|Claude API(?:\s|$))/i.test(name),
    matchesEventText: (text) => /Claude Code|Claude API/i.test(text),
  },
  {
    provider: "codex",
    label: "Codex",
    statusPageUrl: "https://status.openai.com",
    summaryUrl: "https://status.openai.com/api/v2/summary.json",
    incidentsUrl: "https://status.openai.com/api/v2/incidents.json",
    matchesComponent: (name) => /Codex|VS Code extension/i.test(name),
    matchesEventText: (text) => /Codex|VS Code extension/i.test(text),
  },
  {
    provider: "cursor",
    label: "Cursor",
    statusPageUrl: "https://status.cursor.com",
    summaryUrl: "https://status.cursor.com/api/v2/summary.json",
    incidentsUrl: "https://status.cursor.com/api/v2/incidents.json",
    maintenancesUrl: "https://status.cursor.com/api/v2/scheduled-maintenances.json",
    matchesComponent: (name) => /^(CLI|IDE|Cloud Agents)$/i.test(name),
  },
] as const

const STATUS_SEVERITY: Record<DeepSeekStatusLevel, number> = {
  operational: 0,
  maintenance: 1,
  degraded: 2,
  partial_outage: 3,
  full_outage: 4,
}

export function mapStatuspageLevel(status: string): DeepSeekStatusLevel {
  switch (status) {
    case "degraded_performance":
      return "degraded"
    case "partial_outage":
      return "partial_outage"
    case "major_outage":
      return "full_outage"
    case "under_maintenance":
      return "maintenance"
    default:
      return "operational"
  }
}

function aggregateComponentStatus(components: OfficialStatusComponent[]): DeepSeekStatusLevel {
  return components.reduce<DeepSeekStatusLevel>((worst, component) => (
    STATUS_SEVERITY[component.status] > STATUS_SEVERITY[worst] ? component.status : worst
  ), "operational")
}

function incidentTouchesComponents(incident: StatuspageIncident, componentIds: Set<string>): boolean {
  if (incident.components?.some((component) => component.id && componentIds.has(component.id))) return true
  return Boolean(incident.incident_updates?.some((update) => (
    update.affected_components?.some((component) => {
      const id = component.code ?? component.id
      return id ? componentIds.has(id) : false
    })
  )))
}

function incidentMatchesSource(
  incident: StatuspageIncident,
  source: OfficialStatusSource,
  componentIds: Set<string>,
): boolean {
  if (incidentTouchesComponents(incident, componentIds)) return true
  if (!source.matchesEventText) return false
  const text = [
    incident.name,
    ...(incident.incident_updates ?? []).map((update) => update.body),
  ].filter(Boolean).join("\n")
  return source.matchesEventText(text)
}

function parseStatuspageEvent(
  incident: StatuspageIncident,
  type: OfficialStatusEvent["type"],
  source: OfficialStatusSource,
  components: OfficialStatusComponent[],
  index: number,
): OfficialStatusEvent {
  const affectedIds = new Set<string>()
  for (const component of incident.components ?? []) {
    if (component.id) affectedIds.add(component.id)
  }
  for (const update of incident.incident_updates ?? []) {
    for (const component of update.affected_components ?? []) {
      const id = component.code ?? component.id
      if (id) affectedIds.add(id)
    }
  }
  const updatedAt = incident.updated_at ? Date.parse(incident.updated_at) : Number.NaN
  const affectedComponents = components
    .filter((component) => affectedIds.has(component.id))
    .map((component) => component.name)

  // Some official Statuspage incidents mention the engine explicitly while
  // attaching only a broader product component (for example Claude Cowork).
  // Keep those incidents visible and label them with the matched engine.
  if (affectedComponents.length === 0 && source.matchesEventText) {
    affectedComponents.push(source.label)
  }

  return {
    id: incident.id ?? `${type}-${index}`,
    title: incident.name?.trim() || (type === "maintenance" ? "计划维护" : "服务事件"),
    type,
    status: incident.status ?? (type === "maintenance" ? "scheduled" : "investigating"),
    impact: incident.impact ?? null,
    updatedAt: Number.isFinite(updatedAt) ? updatedAt : null,
    affectedComponents,
    active: !["resolved", "completed", "cancelled"].includes(incident.status ?? ""),
  }
}

export function parseOfficialStatusSummary(
  source: OfficialStatusSource,
  summary: StatuspageSummary,
): OfficialProviderStatus {
  const components = (summary.components ?? [])
    .filter((component) => source.matchesComponent(component.name))
    .map((component) => ({
      id: component.id,
      name: component.name,
      status: mapStatuspageLevel(component.status),
      description: component.description?.trim() || null,
    }))

  if (components.length === 0) {
    return {
      provider: source.provider,
      label: source.label,
      statusPageUrl: source.statusPageUrl,
      ok: false,
      status: null,
      updatedAt: null,
      components: [],
      events: [],
      detailWarning: null,
      error: "官方状态页未返回对应组件",
    }
  }

  const componentIds = new Set(components.map((component) => component.id))
  const incidents = (summary.incidents ?? []).filter((entry) => incidentMatchesSource(entry, source, componentIds))
  const maintenances = (summary.scheduled_maintenances ?? []).filter((entry) => (
    incidentMatchesSource(entry, source, componentIds)
  ))
  const events = [
    ...incidents.map((entry, index) => parseStatuspageEvent(entry, "incident", source, components, index)),
    ...maintenances.map((entry, index) => parseStatuspageEvent(entry, "maintenance", source, components, index)),
  ].sort((left, right) => (right.updatedAt ?? 0) - (left.updatedAt ?? 0))
  const updatedAt = summary.page?.updated_at ? Date.parse(summary.page.updated_at) : Number.NaN

  return {
    provider: source.provider,
    label: source.label,
    statusPageUrl: source.statusPageUrl,
    ok: true,
    status: aggregateComponentStatus(components),
    updatedAt: Number.isFinite(updatedAt) ? updatedAt : null,
    components,
    events,
    detailWarning: null,
    error: null,
  }
}

export async function loadOfficialProviderStatuses(
  fetchImpl: typeof fetch = fetch,
  onSummary?: (status: OfficialProviderStatus) => void,
): Promise<OfficialProviderStatus[]> {
  return Promise.all(OFFICIAL_STATUS_SOURCES.map(async (source) => {
    const summaryController = new AbortController()
    const detailController = new AbortController()
    const summaryTimeout = setTimeout(() => summaryController.abort(), 12_000)
    const detailTimeout = setTimeout(() => detailController.abort(), 5_000)
    try {
      const fetchJson = async (url: string, signal: AbortSignal): Promise<StatuspageSummary> => {
        const response = await fetchImpl(url, {
          headers: { Accept: "application/json" },
          cache: "no-store",
          signal,
        })
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        return await response.json() as StatuspageSummary
      }

      const summaryPromise = fetchJson(source.summaryUrl, summaryController.signal)
      const incidentsPromise = fetchJson(source.incidentsUrl, detailController.signal)
      const maintenancesPromise = source.maintenancesUrl
        ? fetchJson(source.maintenancesUrl, detailController.signal)
        : Promise.resolve(null)
      const [summaryResult] = await Promise.allSettled([summaryPromise])
      if (summaryResult.status === "rejected") {
        await Promise.allSettled([incidentsPromise, maintenancesPromise])
        throw summaryResult.reason
      }
      const summary = summaryResult.value
      onSummary?.(parseOfficialStatusSummary(source, { ...summary }))

      const [incidentsResult, maintenancesResult] = await Promise.allSettled([
        incidentsPromise,
        maintenancesPromise,
      ])
      if (incidentsResult.status === "fulfilled" && incidentsResult.value?.incidents) {
        summary.incidents = incidentsResult.value.incidents
      }
      if (maintenancesResult.status === "fulfilled" && maintenancesResult.value?.scheduled_maintenances) {
        summary.scheduled_maintenances = maintenancesResult.value.scheduled_maintenances
      }

      const parsed = parseOfficialStatusSummary(source, summary)
      const unavailableDetails = [
        incidentsResult.status === "rejected" ? "事件记录" : null,
        source.maintenancesUrl && maintenancesResult.status === "rejected" ? "维护记录" : null,
      ].filter(Boolean)
      parsed.detailWarning = unavailableDetails.length > 0
        ? `${unavailableDetails.join("和")}暂时无法获取，组件状态仍可用。`
        : null
      return parsed
    } catch (error) {
      return {
        provider: source.provider,
        label: source.label,
        statusPageUrl: source.statusPageUrl,
        ok: false,
        status: null,
        updatedAt: null,
        components: [],
        events: [],
        detailWarning: null,
        error: error instanceof Error ? error.message : "请求失败",
      }
    } finally {
      clearTimeout(summaryTimeout)
      clearTimeout(detailTimeout)
    }
  }))
}

export type LocalAccessTone = "ready" | "attention" | "unavailable" | "checking"

export interface LocalEngineAccess {
  provider: AgentProvider
  label: string
  statusLabel: string
  detail: string
  tone: LocalAccessTone
}

type LocalAccessInput = {
  auth: ProviderAuthSnapshot | null
  appSettings: Pick<AppSettingsSnapshot, "activeModelProfileId" | "modelProfiles" | "deepseekApiKey"> | null
  llmProvider: Pick<LlmProviderSnapshot, "enabled" | "provider" | "model"> | null
}

function activeConfiguredProfile(appSettings: LocalAccessInput["appSettings"]): ModelProfile | null {
  if (!appSettings?.activeModelProfileId) return null
  const profile = appSettings.modelProfiles.find((item) => item.id === appSettings.activeModelProfileId) ?? null
  if (!profile?.apiKey.trim() || !profile.baseUrl.trim() || !profile.modelId.trim()) return null
  return profile
}

function authService(auth: ProviderAuthSnapshot | null, provider: "claude" | "codex" | "cursor"): AuthServiceSnapshot | null {
  return auth?.services.find((service) => service.service === provider) ?? null
}

function fromAuthService(provider: "claude" | "codex" | "cursor", service: AuthServiceSnapshot | null): LocalEngineAccess {
  const label = PROVIDERS.find((entry) => entry.id === provider)?.label ?? provider
  if (!service || service.authStatus === "unknown") {
    return { provider, label, statusLabel: "检测中", detail: "正在读取本机登录状态", tone: "checking" }
  }

  const version = service.version ? `v${service.version}` : null
  const account = service.account?.trim() || null
  const extra = [account, version].filter(Boolean).join(" · ")
  switch (service.authStatus) {
    case "signed_in":
      return { provider, label, statusLabel: "已登录", detail: extra || "原版账号可用", tone: "ready" }
    case "outdated":
      return { provider, label, statusLabel: "需更新", detail: service.statusDetail || extra || "本机 CLI 版本过旧", tone: "attention" }
    case "error":
      return { provider, label, statusLabel: "检测失败", detail: service.statusDetail || "未能确认本机状态", tone: "attention" }
    case "not_installed":
      return { provider, label, statusLabel: "未安装", detail: "本机未找到对应 CLI", tone: "unavailable" }
    default:
      return { provider, label, statusLabel: "未登录", detail: service.statusDetail || extra || "请先登录原版账号", tone: "unavailable" }
  }
}

export function deriveLocalEngineAccess({ auth, appSettings, llmProvider }: LocalAccessInput): LocalEngineAccess[] {
  const profile = activeConfiguredProfile(appSettings)
  const profileDetail = profile ? `当前档案：${profile.name} · ${profile.modelId}` : null

  return PROVIDERS.map((provider) => {
    if (provider.id === "cursor") return fromAuthService("cursor", authService(auth, "cursor"))

    if (engineUsesModelProfile(provider.id) && profile && profileDetail) {
      return {
        provider: provider.id,
        label: provider.label,
        statusLabel: "档案已配置",
        detail: profileDetail,
        tone: "ready",
      }
    }

    if (provider.id === "claude" || provider.id === "codex") {
      return fromAuthService(provider.id, authService(auth, provider.id))
    }

    if (provider.id === "deepseek" && appSettings?.deepseekApiKey.trim()) {
      return {
        provider: provider.id,
        label: provider.label,
        statusLabel: "已配置",
        detail: "已使用旧版 DeepSeek API Key 配置",
        tone: "ready",
      }
    }

    if (provider.id === "pi" && llmProvider?.enabled) {
      return {
        provider: provider.id,
        label: provider.label,
        statusLabel: "已配置",
        detail: `${llmProvider.provider} · ${llmProvider.model || "未选模型"}`,
        tone: "ready",
      }
    }

    return {
      provider: provider.id,
      label: provider.label,
      statusLabel: "未配置",
      detail: provider.id === "pi" ? "请在模型服务中配置 Pi 的模型源" : "请先选择并完成模型档案",
      tone: "unavailable",
    }
  })
}
