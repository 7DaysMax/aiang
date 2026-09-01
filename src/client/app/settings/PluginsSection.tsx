import { useEffect, useState } from "react"
import { ExternalLink, Loader2, Puzzle, Search, Star, Trash2 } from "lucide-react"
import type {
  CommunityPlugin,
  InstalledPlugin,
  PluginCommunityCategoryId,
  PluginCommunitySnapshot,
  PluginEcosystem,
  PluginListSnapshot,
} from "../../../shared/plugin"
import { Button } from "../../components/ui/button"
import { Input } from "../../components/ui/input"
import type { KannaState } from "../useKannaState"
import { SETTINGS_ROWS } from "./registry"
import { SettingsErrorBanner, SettingsRow } from "./shared"

const CATEGORIES: Array<{ id: PluginCommunityCategoryId; label: string }> = [
  { id: "all", label: "全部" },
  { id: "coding", label: "编码" },
  { id: "tools", label: "工具" },
  { id: "search", label: "搜索" },
  { id: "ui", label: "界面" },
  { id: "browser", label: "浏览器" },
  { id: "models", label: "模型" },
  { id: "mcp", label: "MCP" },
]

function capabilityLine(plugin: { tools?: string[]; skills?: string[]; commands?: string[]; mcpServers?: string[] }) {
  const parts: string[] = []
  if (plugin.tools?.length) parts.push(`工具 ${plugin.tools.join(" / ")}`)
  if (plugin.skills?.length) parts.push(`技能 ${plugin.skills.length}`)
  if (plugin.commands?.length) parts.push(`命令 ${plugin.commands.length}`)
  if (plugin.mcpServers?.length) parts.push(`MCP ${plugin.mcpServers.length}`)
  return parts.join(" · ") || "尚未声明能力"
}

const ECOSYSTEMS: Array<{ id: "all" | "featured" | PluginEcosystem; label: string }> = [
  { id: "all", label: "全部生态" },
  { id: "featured", label: "强力 MCP" },
  { id: "mcp", label: "MCP 目录" },
  { id: "dsh", label: "DSH" },
  { id: "github", label: "GitHub MCP" },
]

function ecosystemLabel(ecosystem: PluginEcosystem, featured?: boolean) {
  if (featured) return "强力 MCP"
  if (ecosystem === "dsh") return "DSH"
  if (ecosystem === "mcp") return "MCP"
  return "GitHub"
}

function formatStars(count: number) {
  if (count >= 1000) return `${(count / 1000).toFixed(1).replace(/\.0$/, "")}k`
  return String(count)
}

export function PluginsSection({
  state,
}: {
  state: Pick<KannaState, "connectionStatus" | "socket">
}) {
  const socket = state.socket
  const connectionStatus = state.connectionStatus
  const [snapshot, setSnapshot] = useState<PluginListSnapshot | null>(null)
  const [community, setCommunity] = useState<PluginCommunitySnapshot | null>(null)
  const [loading, setLoading] = useState(false)
  const [communityLoading, setCommunityLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  const [category, setCategory] = useState<PluginCommunityCategoryId>("all")
  const [ecosystem, setEcosystem] = useState<"all" | "featured" | PluginEcosystem>("all")
  const [installing, setInstalling] = useState<string | null>(null)
  const [uninstalling, setUninstalling] = useState<string | null>(null)

  const installedNames = new Set((snapshot?.installed ?? []).map((plugin) => plugin.name))

  async function reloadInstalled() {
    if (connectionStatus !== "connected") {
      setSnapshot(null)
      return
    }
    setLoading(true)
    try {
      setSnapshot(await socket.command<PluginListSnapshot>({ type: "plugin.list" }))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "无法读取插件列表。")
      setSnapshot(null)
    } finally {
      setLoading(false)
    }
  }

  async function reloadCommunity(search = query) {
    if (connectionStatus !== "connected") {
      setCommunity(null)
      return
    }
    setCommunityLoading(true)
    try {
      setCommunity(await socket.command<PluginCommunitySnapshot>({
        type: "plugin.community",
        query: search.trim() || undefined,
      }))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "无法读取插件社区。")
    } finally {
      setCommunityLoading(false)
    }
  }

  useEffect(() => {
    void reloadInstalled()
  }, [connectionStatus, socket])

  useEffect(() => {
    const normalized = query.trim()
    if (normalized.length === 1) return
    const timeout = window.setTimeout(() => {
      void reloadCommunity(normalized)
    }, normalized.length === 0 ? 0 : 280)
    return () => window.clearTimeout(timeout)
  }, [query, connectionStatus, socket])

  async function handleInstall(plugin: CommunityPlugin) {
    setInstalling(plugin.fullName)
    setError(null)
    try {
      if (plugin.install.kind === "github") {
        await socket.command<InstalledPlugin>({
          type: "plugin.installGithub",
          repo: plugin.install.repo,
          description: plugin.description,
        })
      } else if (plugin.install.kind === "mcp-stdio") {
        await socket.command<InstalledPlugin>({
          type: "plugin.installMcp",
          name: plugin.name,
          description: plugin.description,
          command: plugin.install.command,
          args: plugin.install.args,
        })
      } else {
        await socket.command<InstalledPlugin>({
          type: "plugin.installMcp",
          name: plugin.name,
          description: plugin.description,
          url: plugin.install.url,
        })
      }
      await reloadInstalled()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "安装插件失败。")
    } finally {
      setInstalling(null)
    }
  }

  async function handleUninstall(name: string) {
    setUninstalling(name)
    setError(null)
    try {
      await socket.command({ type: "plugin.uninstall", pluginName: name })
      await reloadInstalled()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "卸载插件失败。")
    } finally {
      setUninstalling(null)
    }
  }

  const visibleCommunity = (community?.plugins ?? []).filter((plugin) => {
    if (category !== "all" && plugin.category !== category) return false
    if (ecosystem === "all") return true
    if (ecosystem === "featured") return Boolean(plugin.featured)
    return plugin.ecosystem === ecosystem
  })

  return (
    <>
      {error ? <SettingsErrorBanner message={error} /> : null}
      <div className="border-b border-border">
        <SettingsRow def={SETTINGS_ROWS.youmiPlugins} bordered={false}>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {loading || communityLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Puzzle className="h-3.5 w-3.5" />}
            <span>引擎仍是 Youmi。强力 MCP（Playwright / GitHub / 搜索 / 数据库）可一键挂上；也收录 DSH 与 GitHub mcp-server。</span>
          </div>
        </SettingsRow>
      </div>

      <div className="mt-8">
        <div className="text-sm font-medium text-foreground">社区插件</div>
        <div className="mt-1 text-xs text-muted-foreground">
          {community
            ? `已索引 ${community.total} 个（MCP 官方目录 + GitHub mcp-server + dsh-plugin）${community.source === "fallback" ? "，当前为精选备份" : ""}。`
            : "正在读取 MCP / DSH / GitHub 插件社区…"}
          {" "}
          <a
            href="https://registry.modelcontextprotocol.io"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-foreground underline-offset-2 hover:underline"
          >
            MCP 目录
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
        <div className="relative mt-3">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索 Playwright、GitHub、Postgres、DSH…"
            className="pl-8"
          />
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {ECOSYSTEMS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => setEcosystem(entry.id)}
              className={`rounded-full border px-2.5 py-0.5 text-[11px] ${
                ecosystem === entry.id
                  ? "border-foreground bg-foreground text-background"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {entry.label}
            </button>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {CATEGORIES.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => setCategory(entry.id)}
              className={`rounded-full border px-2.5 py-0.5 text-[11px] ${
                category === entry.id
                  ? "border-foreground/80 bg-muted text-foreground"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {entry.label}
            </button>
          ))}
        </div>
        {community?.error ? (
          <div className="mt-3 text-xs text-muted-foreground">{community.error} 已显示精选列表。</div>
        ) : null}
        <div className="mt-3 flex flex-col gap-2">
          {visibleCommunity.map((plugin) => {
            const installed = installedNames.has(plugin.name)
            const busy = installing === plugin.fullName
            return (
              <div key={plugin.fullName} className="flex items-start justify-between gap-3 rounded-lg border border-border bg-card/30 p-3">
                <div className="min-w-0">
                  <div className="flex min-w-0 items-center gap-2">
                    <div className="truncate text-sm font-medium text-foreground">{plugin.name}</div>
                    <span className="rounded-full border border-border px-1.5 py-px text-[10px] text-muted-foreground">
                      {ecosystemLabel(plugin.ecosystem, plugin.featured)}
                    </span>
                    {plugin.stars > 0 ? (
                      <span className="inline-flex items-center gap-0.5 text-[11px] text-muted-foreground">
                        <Star className="h-3 w-3" />
                        {formatStars(plugin.stars)}
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                    {plugin.description || plugin.fullName}
                  </div>
                  <a
                    href={plugin.url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                  >
                    {plugin.fullName}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant={installed ? "ghost" : "default"}
                  disabled={busy || installed}
                  onClick={() => void handleInstall(plugin)}
                >
                  {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : installed ? "已安装" : "安装"}
                </Button>
              </div>
            )
          })}
          {!communityLoading && visibleCommunity.length === 0 ? (
            <div className="text-xs text-muted-foreground">这一类没有匹配的社区插件。</div>
          ) : null}
        </div>
      </div>

      <div className="mt-8">
        <div className="text-sm font-medium text-foreground">内置插件</div>
        <div className="mt-1 text-xs text-muted-foreground">随 Youmi 引擎一起加载，无需安装。</div>
        <div className="mt-3 flex flex-col gap-2">
          {(snapshot?.shipped ?? []).map((plugin) => (
            <div key={plugin.name} className="rounded-lg border border-border bg-card/30 p-3">
              <div className="text-sm font-medium text-foreground">{plugin.name}</div>
              <div className="mt-1 text-xs text-muted-foreground">{plugin.description}</div>
              <div className="mt-2 text-[11px] text-muted-foreground">{capabilityLine(plugin)}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-8 mb-10">
        <div className="text-sm font-medium text-foreground">已安装</div>
        <div className="mt-1 text-xs text-muted-foreground">装到 ~/.aiang/plugins，下次 Youmi 会话会挂载技能 / 工具 / MCP。</div>
        <div className="mt-3 flex flex-col gap-2">
          {(snapshot?.installed ?? []).map((plugin) => (
            <div key={plugin.name} className="flex items-start justify-between gap-3 rounded-lg border border-border bg-card/30 p-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-foreground">{plugin.name}</div>
                {plugin.description ? (
                  <div className="mt-1 text-xs text-muted-foreground">{plugin.description}</div>
                ) : null}
                <div className="mt-2 text-[11px] text-muted-foreground">{capabilityLine(plugin)}</div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={uninstalling === plugin.name}
                onClick={() => void handleUninstall(plugin.name)}
              >
                {uninstalling === plugin.name ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              </Button>
            </div>
          ))}
          {!loading && (snapshot?.installed.length ?? 0) === 0 ? (
            <div className="text-xs text-muted-foreground">还没有安装第三方插件。从上面的社区列表一键安装即可。</div>
          ) : null}
        </div>
      </div>
    </>
  )
}
