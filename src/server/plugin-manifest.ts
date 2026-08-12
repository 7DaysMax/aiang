import type {
  PluginManifest,
  PluginManifestInterface,
  PluginManifestMcpServer,
  PluginMarketplaceEntry,
  PluginMarketplaceEntrySource,
  PluginMarketplaceManifest,
} from "../shared/plugin"

/** 对齐 Codex:manifest 在插件根下的这些位置之一。 */
export const PLUGIN_MANIFEST_RELATIVE_PATHS = [
  ".codex-plugin/plugin.json",
  ".claude-plugin/plugin.json",
  ".cursor-plugin/plugin.json",
] as const

/** 对齐 Codex:marketplace manifest 在仓库根下的这些位置之一。 */
export const MARKETPLACE_MANIFEST_RELATIVE_PATHS = [
  ".agents/plugins/marketplace.json",
  ".claude-plugin/marketplace.json",
  ".cursor-plugin/marketplace.json",
] as const

export function assertSafePluginName(name: string) {
  const normalized = name.trim()
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(normalized)) {
    throw new Error("Plugin name is invalid.")
  }
  return normalized
}

function asString(value: unknown) {
  return typeof value === "string" ? value : ""
}

function asStringArray(value: unknown): string[] {
  if (typeof value === "string") return [value]
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string")
  return []
}

/** 插件内目录路径必须是以 ./ 开头或直接是目录名,禁止绝对路径/..逃逸。 */
export function assertSafePluginRelativePath(raw: string, field: string) {
  const value = raw.trim()
  if (
    !value
    || value.startsWith("/")
    || value.includes("..")
    || value.includes("\\")
  ) {
    throw new Error(`${field} must be a plugin-relative path (got "${value}").`)
  }
  return value.replace(/^\.\//, "")
}

function parseMcpServers(value: unknown): Record<string, PluginManifestMcpServer> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {}
  const servers: Record<string, PluginManifestMcpServer> = {}
  for (const [name, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue
    const entry = raw as Record<string, unknown>
    const command = asString(entry.command)
    if (!command) continue
    const env = entry.env && typeof entry.env === "object" && !Array.isArray(entry.env)
      ? Object.fromEntries(
          Object.entries(entry.env as Record<string, unknown>)
            .filter(([, v]) => typeof v === "string")
            .map(([k, v]) => [k, v as string])
        )
      : undefined
    servers[name] = {
      command,
      args: asStringArray(entry.args),
      ...(env ? { env } : {}),
    }
  }
  return servers
}

function parseInterface(value: unknown): PluginManifestInterface | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined
  const entry = value as Record<string, unknown>
  return {
    ...(asString(entry.displayName) ? { displayName: asString(entry.displayName) } : {}),
    ...(asString(entry.shortDescription) ? { shortDescription: asString(entry.shortDescription) } : {}),
    ...(asString(entry.longDescription) ? { longDescription: asString(entry.longDescription) } : {}),
    ...(asString(entry.developerName) ? { developerName: asString(entry.developerName) } : {}),
    ...(asString(entry.category) ? { category: asString(entry.category) } : {}),
    capabilities: asStringArray(entry.capabilities),
    ...(asString(entry.websiteUrl ?? entry.websiteURL) ? { websiteUrl: asString(entry.websiteUrl ?? entry.websiteURL) } : {}),
    ...(asString(entry.brandColor) ? { brandColor: asString(entry.brandColor) } : {}),
    ...(asString(entry.logo) ? { logo: asString(entry.logo) } : {}),
    ...(asString(entry.logoDark ?? entry.logo_dark) ? { logoDark: asString(entry.logoDark ?? entry.logo_dark) } : {}),
    screenshots: asStringArray(entry.screenshots),
  }
}

/** 解析插件 manifest(plugin.json),校验 name 与相对路径安全。 */
export function parsePluginManifest(json: string): PluginManifest {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    throw new Error("Plugin manifest is not valid JSON.")
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Plugin manifest must be a JSON object.")
  }
  const entry = parsed as Record<string, unknown>
  const name = assertSafePluginName(asString(entry.name))
  const skills = asStringArray(entry.skills).map((p) => assertSafePluginRelativePath(p, "skills"))
  const commands = asStringArray(entry.commands).map((p) => assertSafePluginRelativePath(p, "commands"))
  return {
    name,
    ...(asString(entry.version) ? { version: asString(entry.version) } : {}),
    ...(asString(entry.description) ? { description: asString(entry.description) } : {}),
    keywords: asStringArray(entry.keywords),
    skills,
    commands,
    mcpServers: parseMcpServers(entry.mcpServers),
    ...(entry.hooks && typeof entry.hooks === "object" && !Array.isArray(entry.hooks)
      ? {
          hooks: {
            ...(asString((entry.hooks as Record<string, unknown>).preTurn)
              ? { preTurn: asString((entry.hooks as Record<string, unknown>).preTurn) }
              : {}),
            ...(asString((entry.hooks as Record<string, unknown>).postToolUse)
              ? { postToolUse: asString((entry.hooks as Record<string, unknown>).postToolUse) }
              : {}),
          },
        }
      : {}),
    ...(parseInterface(entry.interface) ? { interface: parseInterface(entry.interface) } : {}),
    raw: json,
  }
}

function parseSource(raw: unknown, fallbackName: string): PluginMarketplaceEntrySource {
  if (typeof raw === "string") {
    // 字符串即本地相对路径。
    return { kind: "local", path: raw.replace(/^\.\//, "") }
  }
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const entry = raw as Record<string, unknown>
    const kind = asString(entry.source)
    if (kind === "git" || kind === "npm") {
      return {
        kind,
        ...(asString(entry.url) ? { url: asString(entry.url) } : {}),
        ...(asString(entry.path) ? { path: asString(entry.path) } : {}),
        ...(asString(entry.ref ?? entry.ref_name) ? { ref: asString(entry.ref ?? entry.ref_name) } : {}),
      }
    }
    if (kind === "url") {
      // Codex marketplace 用 source: "url" 指向仓库内相对路径(如 "./")。
      const rawPath = asString(entry.url)
      return {
        kind: "local" as const,
        ...(rawPath ? { path: rawPath.replace(/^\.\//, "") } : { path: fallbackName }),
      }
    }
    // { "source": "local", "path": "./x" }
    return {
      kind: "local",
      ...(asString(entry.path) ? { path: asString(entry.path).replace(/^\.\//, "") } : { path: fallbackName }),
    }
  }
  return { kind: "local", path: fallbackName }
}

/** 解析 marketplace manifest(marketplace.json)。 */
export function parseMarketplaceManifest(json: string): PluginMarketplaceManifest {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    throw new Error("Marketplace manifest is not valid JSON.")
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Marketplace manifest must be a JSON object.")
  }
  const entry = parsed as Record<string, unknown>
  const name = assertSafePluginName(asString(entry.name) || "marketplace")
  const plugins: PluginMarketplaceEntry[] = Array.isArray(entry.plugins)
    ? entry.plugins
        .filter((p): p is Record<string, unknown> => Boolean(p) && typeof p === "object" && !Array.isArray(p))
        .map((p) => {
          const pluginName = assertSafePluginName(asString(p.name))
          return { name: pluginName, source: parseSource(p.source, pluginName) }
        })
    : []
  return { name, plugins, raw: json }
}

export function marketplaceManifestPathAt(repoRoot: string): string {
  return repoRoot.endsWith("marketplace.json") ? repoRoot : `${repoRoot.replace(/\/+$/, "")}/.agents/plugins/marketplace.json`
}
