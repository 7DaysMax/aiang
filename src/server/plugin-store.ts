import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs"
import os from "node:os"
import path from "node:path"
import { getClaudeConfigDir } from "../shared/branding"
import type {
  InstalledPlugin,
  PluginListSnapshot,
  PluginMarketplaceEntrySource,
  PluginMarketplaceManifest,
} from "../shared/plugin"
import {
  assertSafePluginName,
  MARKETPLACE_MANIFEST_RELATIVE_PATHS,
  parseMarketplaceManifest,
  parsePluginManifest,
  PLUGIN_MANIFEST_RELATIVE_PATHS,
} from "./plugin-manifest"

/** 插件安装根:~/.aiang/plugins。 */
export function getPluginsDir(homeDir = os.homedir()): string {
  return path.join(homeDir, ".aiang", "plugins")
}

export function getInstalledPluginsLockPath(homeDir = os.homedir()): string {
  return path.join(getPluginsDir(homeDir), ".installed.json")
}

function asString(value: unknown) {
  return typeof value === "string" ? value : ""
}

export function parseInstalledPluginsLock(parsed: unknown, lockFilePath: string): InstalledPlugin[] {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return []
  const plugins = (parsed as { plugins?: unknown }).plugins
  if (!Array.isArray(plugins)) return []
  return plugins
    .filter((p): p is Record<string, unknown> => Boolean(p) && typeof p === "object" && !Array.isArray(p))
    .map((p) => ({
      name: asString(p.name),
      ...(asString(p.version) ? { version: asString(p.version) } : {}),
      ...(asString(p.description) ? { description: asString(p.description) } : {}),
      source: (p.source ?? { kind: "local" }) as PluginMarketplaceEntrySource,
      installDir: asString(p.installDir),
      installedAt: asString(p.installedAt),
      skills: Array.isArray(p.skills) ? p.skills.filter((s): s is string => typeof s === "string") : [],
      commands: Array.isArray(p.commands) ? p.commands.filter((c): c is string => typeof c === "string") : [],
    }))
}

function readInstalledLock(homeDir = os.homedir()): InstalledPlugin[] {
  const lockPath = getInstalledPluginsLockPath(homeDir)
  try {
    return parseInstalledPluginsLock(JSON.parse(readFileSync(lockPath, "utf8")), lockPath)
  } catch {
    return []
  }
}

function writeInstalledLock(plugins: InstalledPlugin[], homeDir = os.homedir()) {
  const lockPath = getInstalledPluginsLockPath(homeDir)
  mkdirSync(path.dirname(lockPath), { recursive: true })
  writeFileSync(lockPath, JSON.stringify({ plugins }, null, 2), "utf8")
}

export function listInstalledPlugins(homeDir = os.homedir()): PluginListSnapshot {
  return { installed: readInstalledLock(homeDir), errors: [] }
}

function findManifestFile(pluginRoot: string): string | null {
  for (const relative of PLUGIN_MANIFEST_RELATIVE_PATHS) {
    const candidate = path.join(pluginRoot, relative)
    if (existsSync(candidate)) return candidate
  }
  return null
}

function findMarketplaceFile(repoRoot: string): string | null {
  for (const relative of MARKETPLACE_MANIFEST_RELATIVE_PATHS) {
    const candidate = path.join(repoRoot, relative)
    if (existsSync(candidate)) return candidate
  }
  return null
}

async function runGit(args: string[], cwd: string): Promise<void> {
  const subprocess = Bun.spawn(["git", ...args], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  })
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(subprocess.stdout).text(),
    new Response(subprocess.stderr).text(),
    subprocess.exited,
  ])
  if (exitCode !== 0) {
    throw new Error(stderr.trim() || stdout.trim() || `git ${args[0]} failed with code ${exitCode}.`)
  }
}

function copyDir(src: string, dest: string) {
  mkdirSync(dest, { recursive: true })
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    if (entry.name === ".git") continue
    const from = path.join(src, entry.name)
    const to = path.join(dest, entry.name)
    if (entry.isDirectory()) {
      copyDir(from, to)
    } else {
      copyFileSync(from, to)
    }
  }
}

/** 扫描插件内 skills 目录(每个子目录含 SKILL.md)。 */
function scanPluginSkills(pluginRoot: string, skillDirs: string[]): string[] {
  const found: string[] = []
  for (const dir of skillDirs) {
    const root = path.join(pluginRoot, dir)
    let entries: string[]
    try {
      entries = readdirSync(root)
    } catch {
      continue
    }
    for (const entry of entries) {
      if (entry.startsWith(".")) continue
      if (existsSync(path.join(root, entry, "SKILL.md"))) found.push(path.join(dir, entry))
    }
  }
  return found
}

function syncPluginSkillsToCcb(pluginName: string, pluginRoot: string, skillPaths: string[], homeDir: string): number {
  if (skillPaths.length === 0) return 0
  const ccbSkillsDir = path.join(getClaudeConfigDir(homeDir), "skills")
  mkdirSync(ccbSkillsDir, { recursive: true })
  let synced = 0
  for (const skillPath of skillPaths) {
    const sourceDir = path.join(pluginRoot, skillPath)
    if (!existsSync(path.join(sourceDir, "SKILL.md"))) continue
    const skillName = path.basename(skillPath)
    // 插件技能用 前缀 命名空间,避免和用户技能同名冲突。
    const namespaced = `${pluginName}__${skillName}`
    const linkPath = path.join(ccbSkillsDir, namespaced)
    try {
      if (existsSync(linkPath)) {
        try {
          if (readlinkSync(linkPath) === sourceDir) {
            synced += 1
            continue
          }
        } catch {}
        rmSync(linkPath, { recursive: true, force: true })
      }
      symlinkSync(sourceDir, linkPath)
      synced += 1
    } catch {}
  }
  return synced
}

function clearPluginSkillsFromCcb(pluginName: string, skillPaths: string[], homeDir: string) {
  const ccbSkillsDir = path.join(getClaudeConfigDir(homeDir), "skills")
  for (const skillPath of skillPaths) {
    const skillName = path.basename(skillPath)
    const linkPath = path.join(ccbSkillsDir, `${pluginName}__${skillName}`)
    try {
      if (existsSync(linkPath)) rmSync(linkPath, { recursive: true, force: true })
    } catch {}
  }
}

interface InstallRequest {
  /** marketplace 来源:git 仓库 URL 或本地目录。 */
  marketplace: string
  marketplaceIsLocal?: boolean
  pluginName: string
  homeDir?: string
}

export async function installPluginFromMarketplace(request: InstallRequest): Promise<InstalledPlugin> {
  const homeDir = request.homeDir ?? os.homedir()
  const pluginName = assertSafePluginName(request.pluginName)
  const pluginsDir = getPluginsDir(homeDir)
  mkdirSync(pluginsDir, { recursive: true })

  const tmpRoot = path.join(os.tmpdir(), `aiang-mkt-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  const marketplaceRoot = request.marketplaceIsLocal
    ? request.marketplace
    : tmpRoot

  try {
    if (!request.marketplaceIsLocal) {
      await runGit(["clone", "--depth", "1", request.marketplace, tmpRoot], os.homedir())
    }

    const marketplaceFile = findMarketplaceFile(marketplaceRoot)
    if (!marketplaceFile) {
      throw new Error("Marketplace manifest not found (expected .agents/plugins/marketplace.json).")
    }
    const marketplace: PluginMarketplaceManifest = parseMarketplaceManifest(
      readFileSync(marketplaceFile, "utf8"),
    )
    const entry = marketplace.plugins.find((p) => p.name === pluginName)
    if (!entry) {
      throw new Error(`Plugin "${pluginName}" not found in marketplace "${marketplace.name}".`)
    }

    // 解析插件源码目录。
    let pluginSourceDir: string
    switch (entry.source.kind) {
      case "git": {
        const gitTmp = path.join(os.tmpdir(), `aiang-plugin-${pluginName}-${Date.now()}`)
        await runGit(["clone", "--depth", "1", entry.source.url ?? request.marketplace, gitTmp], os.homedir())
        pluginSourceDir = entry.source.path ? path.join(gitTmp, entry.source.path) : gitTmp
        break
      }
      case "npm":
        throw new Error("npm 来源的插件暂不支持,请用 git 或本地 marketplace。")
      case "local":
      default:
        pluginSourceDir = path.join(marketplaceRoot, entry.source.path ?? pluginName)
    }

    if (!existsSync(pluginSourceDir) || !findManifestFile(pluginSourceDir)) {
      throw new Error(`Plugin manifest not found at ${pluginSourceDir}.`)
    }

    const manifest = parsePluginManifest(
      readFileSync(findManifestFile(pluginSourceDir)!, "utf8"),
    )
    if (manifest.name !== pluginName) {
      throw new Error(`Manifest name "${manifest.name}" does not match requested "${pluginName}".`)
    }

    const installDir = path.join(pluginsDir, pluginName)
    // 已存在则先清掉(覆盖重装)。
    if (existsSync(installDir)) rmSync(installDir, { recursive: true, force: true })
    copyDir(pluginSourceDir, installDir)

    const skills = scanPluginSkills(installDir, manifest.skills)
    syncPluginSkillsToCcb(pluginName, installDir, skills, homeDir)

    const installed: InstalledPlugin = {
      name: pluginName,
      ...(manifest.version ? { version: manifest.version } : {}),
      ...(manifest.description ? { description: manifest.description } : {}),
      source: entry.source,
      installDir,
      installedAt: new Date().toISOString(),
      skills,
      commands: manifest.commands,
    }
    const lock = readInstalledLock(homeDir).filter((p) => p.name !== pluginName)
    lock.push(installed)
    writeInstalledLock(lock, homeDir)
    return installed
  } finally {
    try {
      if (!request.marketplaceIsLocal) rmSync(tmpRoot, { recursive: true, force: true })
    } catch {}
  }
}

export async function uninstallPlugin(pluginName: string, homeDir = os.homedir()): Promise<void> {
  const safeName = assertSafePluginName(pluginName)
  const lock = readInstalledLock(homeDir)
  const installed = lock.find((p) => p.name === safeName)
  if (!installed) return
  clearPluginSkillsFromCcb(safeName, installed.skills, homeDir)
  const installDir = path.join(getPluginsDir(homeDir), safeName)
  try {
    if (existsSync(installDir)) rmSync(installDir, { recursive: true, force: true })
  } catch {}
  writeInstalledLock(lock.filter((p) => p.name !== safeName), homeDir)
}
