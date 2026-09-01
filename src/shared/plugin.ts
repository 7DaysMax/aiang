/**
 * 插件与 marketplace 类型,对齐 openai/codex 的 core-plugins 规范
 * (plugin.json / marketplace.json),让 Codex 生态的插件可以直接装进 aiang。
 */

export interface PluginManifestMcpServer {
  command?: string
  args?: string[]
  env?: Record<string, string>
  url?: string
}

export interface PluginManifestHooks {
  /** 回合开始前执行的命令。 */
  preTurn?: string
  /** 工具调用后执行的命令。 */
  postToolUse?: string
}

/** 插件向 Youmi 引擎注册的一条模型工具。 */
export interface PluginManifestTool {
  name: string
  description: string
  parameters?: Record<string, unknown>
  permission?: "r" | "rw"
  /** 相对插件根的执行模块(.js/.ts),export default 或 export function execute。 */
  entry?: string
}

export interface PluginManifestInterface {
  displayName?: string
  shortDescription?: string
  longDescription?: string
  developerName?: string
  category?: string
  capabilities: string[]
  websiteUrl?: string
  brandColor?: string
  logo?: string
  logoDark?: string
  screenshots: string[]
}

/** 对齐 Codex plugin.json(相对路径指向插件根目录下)。 */
export interface PluginManifest {
  name: string
  version?: string
  description?: string
  keywords: string[]
  /** 插件内置技能目录(含 SKILL.md 的子目录),相对插件根。 */
  skills: string[]
  /** 斜杠命令 markdown 目录。 */
  commands: string[]
  /** Youmi/Penguin 可挂载的模型工具(写入引擎 builtin,轨迹里显示 Glob/Grep/Bash)。 */
  tools: PluginManifestTool[]
  mcpServers: Record<string, PluginManifestMcpServer>
  hooks?: PluginManifestHooks
  interface?: PluginManifestInterface
  /** manifest 原始 JSON(透传展示)。 */
  raw: string
}

export type PluginSourceKind = "local" | "git" | "npm"

export interface PluginMarketplaceEntrySource {
  kind: PluginSourceKind
  /** local: marketplace 仓库内相对路径;git: 仓库 URL;npm: 包名。 */
  path?: string
  url?: string
  ref?: string
}

export interface PluginMarketplaceEntry {
  name: string
  source: PluginMarketplaceEntrySource
}

export interface PluginMarketplaceManifest {
  name: string
  plugins: PluginMarketplaceEntry[]
  raw: string
}

export interface InstalledPlugin {
  name: string
  version?: string
  description?: string
  source: PluginMarketplaceEntrySource
  installDir: string
  installedAt: string
  skills: string[]
  commands: string[]
  tools: string[]
  mcpServers: string[]
}

export interface ShippedPlugin {
  name: string
  version?: string
  description: string
  tools: string[]
  builtin: true
}

export interface PluginListSnapshot {
  shipped: ShippedPlugin[]
  installed: InstalledPlugin[]
  errors: string[]
}

export type PluginCommunityCategoryId =
  | "all"
  | "coding"
  | "tools"
  | "search"
  | "ui"
  | "browser"
  | "models"
  | "mcp"

export type PluginEcosystem = "dsh" | "mcp" | "github"

export type CommunityPluginInstall =
  | { kind: "github"; repo: string }
  | { kind: "mcp-stdio"; command: string; args: string[] }
  | { kind: "mcp-http"; url: string }

/** 社区目录里的一条插件：DSH / 官方 MCP / GitHub mcp-server。 */
export interface CommunityPlugin {
  name: string
  fullName: string
  description: string
  url: string
  cloneUrl: string
  stars: number
  category: PluginCommunityCategoryId
  ecosystem: PluginEcosystem
  featured?: boolean
  install: CommunityPluginInstall
  topics: string[]
  updatedAt: string
}

export interface PluginCommunitySnapshot {
  query: string
  total: number
  plugins: CommunityPlugin[]
  source: "mixed" | "fallback"
  fetchedAt: string
  error?: string
}
