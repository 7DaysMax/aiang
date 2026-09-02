import { existsSync, readdirSync, readFileSync } from "node:fs"
import { basename, join } from "node:path"
import { pathToFileURL } from "node:url"
import {
  BUILTIN_TOOL_FACTORIES,
  partialToolCallOutput,
  type Agent,
  type BuiltinTool,
  type BuiltinToolFactory,
  type ToolDefinitionConfig,
  type ToolExecutionContext,
} from "@prismshadow/penguin-core"
import type { PluginManifest, PluginManifestTool } from "../shared/plugin"
import { findPluginManifestFile, parsePluginManifest } from "./plugin-manifest"
import { getPluginsDir, listInstalledPlugins } from "./plugin-store"
import {
  executeFetchUrlTool,
  executeGlobTool,
  executeGrepTool,
  executeNowTool,
  YOUMI_SHIPPED_TOOL_DEFINITIONS,
} from "./youmi-plugins"

type PluginToolExecutor = (args: Record<string, unknown>, ctx: ToolExecutionContext) => Promise<string>

const factories = BUILTIN_TOOL_FACTORIES as Record<string, BuiltinToolFactory>

/** Penguin 里插件技能目录前缀，卸载后可按此前缀清掉，不碰用户自己装的技能。 */
export const YOUMI_PLUGIN_SKILL_PREFIX = "yp__"

export interface YoumiPluginSkill {
  name: string
  content: string
}

export interface YoumiPluginApplyResult {
  tools: string[]
  mcpServers: string[]
  skills: YoumiPluginSkill[]
}

function toolFactory(execute: PluginToolExecutor): BuiltinToolFactory {
  return (definition: ToolDefinitionConfig): BuiltinTool => ({
    name: definition.name,
    definition,
    async *execute(args, ctx) {
      const output = await execute(args, ctx)
      if (output) {
        yield partialToolCallOutput({
          eventType: "delta",
          output,
          toolCallId: ctx.toolCallId,
        })
      }
    },
  })
}

function mergeBuiltinTool(agent: Agent, definition: ToolDefinitionConfig) {
  const tools = agent.state.systemConfig.tools ?? {}
  const builtin = [...(tools.builtin ?? [])]
  const index = builtin.findIndex((entry) => entry.name === definition.name)
  if (index >= 0) builtin[index] = definition
  else builtin.push(definition)
  agent.state.systemConfig.tools = { ...tools, builtin }
}

function mergeMcpServer(agent: Agent, server: { name: string; config: Record<string, unknown> }) {
  const tools = agent.state.systemConfig.tools ?? {}
  const mcpServers = [...(tools.mcpServers ?? [])]
  const index = mcpServers.findIndex((entry) => entry.name === server.name)
  if (index >= 0) mcpServers[index] = server
  else mcpServers.push(server)
  agent.state.systemConfig.tools = { ...tools, mcpServers }
}

async function loadEntryExecutor(pluginRoot: string, tool: PluginManifestTool): Promise<PluginToolExecutor | null> {
  if (!tool.entry) return null
  const entryPath = join(pluginRoot, tool.entry)
  if (!existsSync(entryPath)) return null
  const module = await import(pathToFileURL(entryPath).href) as {
    default?: PluginToolExecutor
    execute?: PluginToolExecutor
  }
  const execute = module.execute ?? module.default
  return typeof execute === "function" ? execute : null
}

export function penguinPluginSkillName(pluginName: string, skillPath: string): string {
  return `${YOUMI_PLUGIN_SKILL_PREFIX}${pluginName}__${basename(skillPath)}`
}

function collectPluginSkills(pluginName: string, pluginRoot: string, skillDirs: string[]): YoumiPluginSkill[] {
  const skills: YoumiPluginSkill[] = []
  for (const dir of skillDirs) {
    const root = join(pluginRoot, dir)
    if (existsSync(join(root, "SKILL.md"))) {
      skills.push({
        name: penguinPluginSkillName(pluginName, dir),
        content: readFileSync(join(root, "SKILL.md"), "utf8"),
      })
      continue
    }
    let entries: string[]
    try {
      entries = readdirSync(root)
    } catch {
      continue
    }
    for (const entry of entries) {
      if (entry.startsWith(".")) continue
      const skillMd = join(root, entry, "SKILL.md")
      if (!existsSync(skillMd)) continue
      skills.push({
        name: penguinPluginSkillName(pluginName, entry),
        content: readFileSync(skillMd, "utf8"),
      })
    }
  }
  return skills
}

function readInstalledManifest(pluginRoot: string): PluginManifest | null {
  const manifestFile = findPluginManifestFile(pluginRoot)
  if (!manifestFile) return null
  try {
    return parsePluginManifest(readFileSync(manifestFile, "utf8"))
  } catch {
    return null
  }
}

/** 把 Youmi 内置 + 已安装插件的工具 / MCP 挂进 Penguin 引擎（不换引擎）。 */
export async function applyYoumiPluginsToAgent(agent: Agent, homeDir?: string): Promise<YoumiPluginApplyResult> {
  factories.glob = toolFactory(executeGlobTool)
  factories.grep = toolFactory(executeGrepTool)
  factories.fetch_url = toolFactory(executeFetchUrlTool)
  factories.now = toolFactory(async () => executeNowTool())
  for (const definition of YOUMI_SHIPPED_TOOL_DEFINITIONS) {
    mergeBuiltinTool(agent, definition)
  }

  const snapshot = listInstalledPlugins(homeDir)
  const pluginsDir = getPluginsDir(homeDir)
  const skills: YoumiPluginSkill[] = []
  const mcpNames: string[] = []

  for (const installed of snapshot.installed) {
    const pluginRoot = installed.installDir || join(pluginsDir, installed.name)
    const manifest = readInstalledManifest(pluginRoot)
    if (!manifest) continue

    for (const tool of manifest.tools) {
      const execute = await loadEntryExecutor(pluginRoot, tool)
      if (!execute) continue
      factories[tool.name] = toolFactory(execute)
      mergeBuiltinTool(agent, {
        name: tool.name,
        description: tool.description,
        permission: tool.permission ?? "r",
        ...(tool.parameters ? { parameters: tool.parameters } : {}),
      })
    }

    for (const [serverName, server] of Object.entries(manifest.mcpServers)) {
      const name = `${installed.name}__${serverName}`
      mergeMcpServer(agent, {
        name,
        config: server.url
          ? { url: server.url }
          : {
              command: server.command ?? "",
              args: server.args ?? [],
              ...(server.env ? { env: server.env } : {}),
            },
      })
      mcpNames.push(name)
    }

    skills.push(...collectPluginSkills(installed.name, pluginRoot, manifest.skills))
  }

  return {
    tools: (agent.state.systemConfig.tools?.builtin ?? []).map((tool) => tool.name),
    mcpServers: mcpNames,
    skills,
  }
}
