/**
 * 插件与 marketplace 类型,对齐 openai/codex 的 core-plugins 规范
 * (plugin.json / marketplace.json),让 Codex 生态的插件可以直接装进 aiang。
 */

export interface PluginManifestMcpServer {
  command: string
  args: string[]
  env?: Record<string, string>
}

export interface PluginManifestHooks {
  /** 回合开始前执行的命令。 */
  preTurn?: string
  /** 工具调用后执行的命令。 */
  postToolUse?: string
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
}

export interface PluginListSnapshot {
  installed: InstalledPlugin[]
  errors: string[]
}
