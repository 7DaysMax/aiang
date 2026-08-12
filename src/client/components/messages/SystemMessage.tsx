import { useEffect, useState, useMemo, type ReactNode } from "react"
import { ArrowRightLeft, ChevronRight, RotateCw, Slash, UserRound } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import type { ProcessedSystemMessage } from "./types"
import { PROVIDERS, resolveModelLabel, type AgentProvider } from "../../../shared/types"
import { PROVIDER_ICONS } from "../chat-ui/ChatPreferenceControls"
import { MetaRow, MetaLabel, MetaText, MetaPill, ExpandableRow, VerticalLineContainer, toolIcons, defaultToolIcon, getToolIcon } from "./shared"
import { toTitleCase } from "../../lib/formatters"
import { cn } from "../../lib/utils"
import { useTranscriptRenderOptions } from "./render-context"

export interface SessionHandoff {
  fromProvider: AgentProvider
  toProvider: AgentProvider
}

export interface SessionRestore {
  provider: AgentProvider
}

interface Props {
  message: ProcessedSystemMessage
  rawJson?: string
  /** Rendered mid-conversation because the model changed (rather than as the first session init). */
  modelChanged?: boolean
  /** This session init follows a harness switch — label it "From → To". */
  handoff?: SessionHandoff
  /**
   * This session init follows a same-provider session restore
   * (session_restored boundary) — label it "Session Repaired" and explain the
   * recovery in the expanded content.
   */
  restored?: SessionRestore
}

function providerLabel(provider: AgentProvider) {
  return PROVIDERS.find((candidate) => candidate.id === provider)?.label ?? provider
}

function CollapsibleSection({ title, count, children, badge, defaultOpen = false }: { title: string; count: number; children: ReactNode; badge?: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  if (count === 0) return null
  return (
    <div className="flex flex-col gap-1.5">
      <button onClick={() => setOpen(!open)} className="flex items-center gap-1 cursor-pointer group/section hover:opacity-60 transition-opacity">
        <ChevronRight className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform duration-200", open && "rotate-90")} />
        <span className="text-muted-foreground font-medium">{title}</span>
        <span className="text-muted-foreground/60">{count}</span>
        {badge}
      </button>
      {open && <div className="ml-5">{children}</div>}
    </div>
  )
}

interface PillSectionProps {
  title: string
  items: string[]
  icon?: LucideIcon
  getIcon?: (item: string) => LucideIcon
}

function PillSection({ title, items, icon, getIcon }: PillSectionProps) {
  if (items.length === 0) return null
  return (
    <CollapsibleSection title={title} count={items.length} defaultOpen>
      <div className="flex flex-wrap gap-1.5">
        {items.map((item) => (
          <MetaPill key={item} icon={getIcon ? getIcon(item) : icon}>{item}</MetaPill>
        ))}
      </div>
    </CollapsibleSection>
  )
}

/** Parse MCP tool name: "mcp__server__tool" → { server: "server", tool: "tool" } */
function parseMcpTool(name: string): { server: string; tool: string } | null {
  const match = name.match(/^mcp__([^_]+)__(.+)$/)
  if (!match) return null
  return { server: match[1], tool: match[2] }
}

interface McpServerWithTools {
  name: string
  status: string
  error?: string
  tools: string[]
}

function StatusDot({ status }: { status: string }) {
  const color = status === "connected"
    ? "bg-emerald-500"
    : status === "pending"
      ? "bg-yellow-500"
      : "bg-red-500"
  return <span className={cn("inline-block h-2 w-2 rounded-full shrink-0", color)} />
}

function statusLabel(status: string): string {
  switch (status) {
    case "connected": return "已连接"
    case "failed": return "连接失败"
    case "needs-auth": return "需要登录"
    case "pending": return "连接中…"
    case "disabled": return "已禁用"
    default: return status
  }
}

function ExpandableMcpServer({ server }: { server: McpServerWithTools }) {
  const [open, setOpen] = useState(false)
  const isConnected = server.status === "connected"

  return (
    <div className="flex flex-col gap-1.5">
      <button
        onClick={() => isConnected && server.tools.length > 0 && setOpen(!open)}
        className={cn(
          "flex items-center gap-1.5",
          isConnected && server.tools.length > 0 && "cursor-pointer hover:opacity-60 transition-opacity"
        )}
      >
        {isConnected && server.tools.length > 0 && (
          <ChevronRight className={cn("h-3 w-3 text-muted-foreground transition-transform duration-200", open && "rotate-90")} />
        )}
        <StatusDot status={server.status} />
        <span className="text-muted-foreground font-medium">{toTitleCase(server.name)}</span>
        {isConnected ? (
          <span className="text-muted-foreground/50">{server.tools.length} tools</span>
        ) : (
          <span className="text-muted-foreground/50">{statusLabel(server.status)}</span>
        )}
      </button>
      {!isConnected && server.error && (
        <span className="text-destructive ml-5">{server.error}</span>
      )}
      {open && server.tools.length > 0 && (
        <div className="flex flex-wrap gap-1.5 ml-5">
          {server.tools.map((tool) => (
            <MetaPill key={tool} icon={getToolIcon(`mcp__${server.name}__${tool}`)}>{tool}</MetaPill>
          ))}
        </div>
      )}
    </div>
  )
}

function McpServerSection({ servers }: { servers: McpServerWithTools[] }) {
  if (servers.length === 0) return null

  const connected = servers.filter((s) => s.status === "connected")
  const disconnected = servers.filter((s) => s.status !== "connected")

  const badge = disconnected.length > 0 ? (
    <span className="flex items-center gap-1 ml-1">
      <StatusDot status="failed" />
      <span className="text-muted-foreground/60">{disconnected.length} disconnected</span>
    </span>
  ) : null

  return (
    <CollapsibleSection title="MCP Servers" count={servers.length} badge={badge}>
      <div className="flex flex-col gap-2">
        {connected.map((server) => (
          <ExpandableMcpServer key={server.name} server={server} />
        ))}
        {disconnected.map((server) => (
          <ExpandableMcpServer key={server.name} server={server} />
        ))}
      </div>
    </CollapsibleSection>
  )
}

/**
 * `rawJson` is used when the host already has the payload inline (export
 * bundles); otherwise it is fetched on first expand, since live snapshots omit
 * `debugRaw`.
 */
function RawMessageSection({ rawJson, entryId }: { rawJson?: string; entryId: string }) {
  const { loadEntryDebugRaw } = useTranscriptRenderOptions()
  const [open, setOpen] = useState(false)
  const [loaded, setLoaded] = useState<string | null>(null)
  const [state, setState] = useState<"idle" | "loading" | "error">("idle")

  useEffect(() => {
    if (!open || rawJson !== undefined || loaded !== null || state !== "idle") return
    if (!loadEntryDebugRaw) return
    let cancelled = false
    setState("loading")
    void loadEntryDebugRaw(entryId)
      .then((value) => {
        if (cancelled) return
        setLoaded(value ?? "")
        setState("idle")
      })
      .catch(() => {
        if (!cancelled) setState("error")
      })
    return () => {
      cancelled = true
    }
  }, [open, rawJson, loaded, state, loadEntryDebugRaw, entryId])

  const body = rawJson ?? loaded

  return (
    <div className="flex flex-col gap-1.5">
      <button onClick={() => setOpen(!open)} className="flex items-center gap-1 cursor-pointer group/section hover:opacity-60 transition-opacity">
        <ChevronRight className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform duration-200", open && "rotate-90")} />
        <span className="text-muted-foreground font-medium">Raw Message</span>
      </button>
      {open && (
        <pre className="ml-5 text-xs whitespace-pre-wrap break-all border border-border rounded-md p-3 overflow-x-auto max-h-96 overflow-y-auto">
          {state === "loading" && body === null ? "加载中…" : null}
          {state === "error" ? "无法加载原始消息。" : null}
          {state !== "error" ? body : null}
        </pre>
      )}
    </div>
  )
}

export function SystemMessage({ message, rawJson, modelChanged, handoff, restored }: Props) {
  const iconProvider = handoff?.toProvider ?? message.provider
  const ProviderIcon = PROVIDER_ICONS[iconProvider]
  const { loadEntryDebugRaw } = useTranscriptRenderOptions()
  const provider = PROVIDERS.find((candidate) => candidate.id === message.provider)
  // 目录里的模型 label 常自带家族名（deepseek → "DeepSeek Flash"），再拼 provider
  // 名会变成 "DeepSeek DeepSeek Flash"；只有模型 label 不含家族名时才拼前缀。
  const modelLabel = resolveModelLabel(provider?.models, message.model)
  const providerName = provider?.label ?? message.provider
  const modelRepeatsProvider = modelLabel.toLowerCase().startsWith(providerName.toLowerCase())
  const { coreTools, mcpServersWithTools } = useMemo(() => {
    const mcpToolsByServer = new Map<string, string[]>()
    const core: string[] = []

    for (const tool of message.tools) {
      const parsed = parseMcpTool(tool)
      if (parsed) {
        const existing = mcpToolsByServer.get(parsed.server) || []
        existing.push(parsed.tool)
        mcpToolsByServer.set(parsed.server, existing)
      } else {
        core.push(tool)
      }
    }

    const servers: McpServerWithTools[] = message.mcpServers.map((s) => ({
      name: s.name,
      status: s.status,
      error: s.error,
      tools: mcpToolsByServer.get(s.name) || [],
    }))

    return { coreTools: core, mcpServersWithTools: servers }
  }, [message.tools, message.mcpServers])

  return (
    <MetaRow>
      <ExpandableRow
        expandedContent={
          <VerticalLineContainer className="my-4 text-xs">
            <div className="flex flex-col gap-3">
              {restored && (
                <MetaText>
                  {providerLabel(restored.provider)} 此对话已保存的会话不再可用——Agent CLI 会清理旧会话文件。Aiang 已通过新建会话并从自身保存的 transcript 恢复对话。
                </MetaText>
              )}
              <MetaText>{message.model}</MetaText>
              <PillSection title="工具" items={coreTools} getIcon={(tool) => toolIcons[tool] ?? defaultToolIcon} />
              <PillSection title="Agent" items={message.agents} icon={UserRound} />
              <PillSection title="命令" items={message.slashCommands} icon={Slash} />
              <McpServerSection servers={mcpServersWithTools} />
              {/* Inline payload (export bundles) or a loader (live snapshots,
                  which omit debugRaw); nothing to show without either. */}
              {(rawJson !== undefined || loadEntryDebugRaw) && (
                <RawMessageSection rawJson={rawJson} entryId={message.id} />
              )}
            </div>
          </VerticalLineContainer>
        }
      >
        {restored && !handoff
          ? <RotateCw className="h-5 w-5 p-0.5 text-logo" />
          : modelChanged && !handoff
            ? <ArrowRightLeft className="h-5 w-5 p-0.5 text-logo" />
            : <ProviderIcon data-provider-icon={iconProvider} className="h-5 w-5 p-0.5 text-logo" />}
        <MetaLabel>
          {handoff
            ? providerLabel(handoff.toProvider)
            : restored
              ? "会话已修复"
              : modelChanged ? "模型已更改" : modelRepeatsProvider ? null : providerName}
          <span className="ml-1.5 opacity-50 tracking-normal">
            {modelLabel}
          </span>
        </MetaLabel>
      </ExpandableRow>
    </MetaRow>
  )
}
