import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, test } from "bun:test"
import type { Agent } from "@prismshadow/penguin-core"
import {
  applyYoumiPluginsToAgent,
  penguinPluginSkillName,
} from "./youmi-plugin-runtime"
import { getInstalledPluginsLockPath, getPluginsDir } from "./plugin-store"

function fakeAgent(): Agent {
  return {
    state: {
      systemConfig: {
        tools: { builtin: [], mcpServers: [] },
      },
    },
  } as Agent
}

function writeInstalledPlugin(home: string) {
  const pluginRoot = join(getPluginsDir(home), "echo-plugin")
  mkdirSync(join(pluginRoot, ".youmi-plugin"), { recursive: true })
  mkdirSync(join(pluginRoot, "tools"), { recursive: true })
  mkdirSync(join(pluginRoot, "skills", "hello"), { recursive: true })
  writeFileSync(
    join(pluginRoot, ".youmi-plugin/plugin.json"),
    JSON.stringify({
      name: "echo-plugin",
      description: "Echo + MCP",
      skills: ["./skills"],
      tools: [{
        name: "echo_word",
        description: "Echo a word",
        permission: "r",
        entry: "./tools/echo.ts",
        parameters: {
          type: "object",
          properties: { word: { type: "string" } },
          required: ["word"],
        },
      }],
      mcpServers: {
        notes: { command: "npx", args: ["-y", "@notes/mcp"] },
      },
    }),
  )
  writeFileSync(
    join(pluginRoot, "tools/echo.ts"),
    `export async function execute(args) {\n  return "echo:" + String(args.word ?? "")\n}\n`,
  )
  writeFileSync(
    join(pluginRoot, "skills/hello/SKILL.md"),
    "---\nname: hello\ndescription: Say hi\n---\nSay 你好.\n",
  )
  mkdirSync(join(home, ".aiang", "plugins"), { recursive: true })
  writeFileSync(
    getInstalledPluginsLockPath(home),
    JSON.stringify({
      plugins: [{
        name: "echo-plugin",
        installDir: pluginRoot,
        installedAt: new Date().toISOString(),
        source: { kind: "local" },
        skills: ["skills/hello"],
        commands: [],
        tools: ["echo_word"],
        mcpServers: ["notes"],
      }],
    }),
  )
  return pluginRoot
}

describe("applyYoumiPluginsToAgent", () => {
  test("keeps Youmi engine and mounts shipped glob/grep plus user plugin tools, MCP, skills", async () => {
    const home = mkdtempSync(join(tmpdir(), "youmi-plugin-rt-"))
    try {
      writeInstalledPlugin(home)
      const agent = fakeAgent()
      const result = await applyYoumiPluginsToAgent(agent, home)

      expect(result.tools).toContain("glob")
      expect(result.tools).toContain("grep")
      expect(result.tools).toContain("fetch_url")
      expect(result.tools).toContain("now")
      expect(result.tools).toContain("echo_word")
      expect(result.mcpServers).toEqual(["echo-plugin__notes"])
      expect(result.skills.map((skill) => skill.name)).toContain(penguinPluginSkillName("echo-plugin", "hello"))
      expect(result.skills[0]?.content).toContain("你好")

      const builtin = agent.state.systemConfig.tools?.builtin ?? []
      expect(builtin.some((tool) => tool.name === "glob")).toBe(true)
      expect(builtin.some((tool) => tool.name === "echo_word")).toBe(true)
      expect(agent.state.systemConfig.tools?.mcpServers).toEqual([
        {
          name: "echo-plugin__notes",
          config: { command: "npx", args: ["-y", "@notes/mcp"] },
        },
      ])
    } finally {
      rmSync(home, { recursive: true, force: true })
    }
  })
})
