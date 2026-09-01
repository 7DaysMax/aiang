import { describe, expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { installMcpPlugin, installPluginFromMarketplace, installPluginFromSourceDir, listInstalledPlugins, parseGithubPluginRepo, uninstallPlugin } from "./plugin-store"

function makeMarketplace() {
  const root = mkdtempSync(path.join(tmpdir(), "plugin-mkt-"))
  mkdirSync(path.join(root, ".agents/plugins"), { recursive: true })
  writeFileSync(
    path.join(root, ".agents/plugins/marketplace.json"),
    JSON.stringify({
      name: "test-market",
      plugins: [{ name: "hello-plugin", source: { source: "local", path: "./hello-plugin" } }],
    }),
  )
  // 插件:hello-plugin,含一个技能。
  const plugin = path.join(root, "hello-plugin")
  mkdirSync(path.join(plugin, ".codex-plugin"), { recursive: true })
  mkdirSync(path.join(plugin, "skills", "greet"), { recursive: true })
  writeFileSync(
    path.join(plugin, ".codex-plugin/plugin.json"),
    JSON.stringify({
      name: "hello-plugin",
      version: "1.0.0",
      description: "Says hello",
      skills: ["./skills"],
      tools: [{
        name: "say_hello",
        description: "Say hello",
        permission: "r",
        entry: "./tools/hello.ts",
      }],
      mcpServers: {
        greet: { command: "npx", args: ["-y", "@greet/mcp"] },
      },
    }),
  )
  writeFileSync(
    path.join(plugin, "skills/greet/SKILL.md"),
    "---\nname: greet\ndescription: Greets the user in Chinese\n---\nSay 你好.\n",
  )
  return root
}

describe("plugin store", () => {
  test("installs a plugin from a local marketplace and syncs its skill to ccb", async () => {
    const market = makeMarketplace()
    const home = mkdtempSync(path.join(tmpdir(), "plugin-home-"))
    try {
      const installed = await installPluginFromMarketplace({
        marketplace: market,
        marketplaceIsLocal: true,
        pluginName: "hello-plugin",
        homeDir: home,
      })

      expect(installed.name).toBe("hello-plugin")
      expect(installed.version).toBe("1.0.0")
      expect(installed.skills.map((skill) => skill.replaceAll("\\", "/"))).toContain("skills/greet")

      const lock = listInstalledPlugins(home)
      expect(lock.shipped.some((plugin) => plugin.tools.includes("glob"))).toBe(true)
      expect(lock.installed).toHaveLength(1)
      expect(lock.installed[0]?.name).toBe("hello-plugin")
      expect(lock.installed[0]?.tools).toEqual(["say_hello"])
      expect(lock.installed[0]?.mcpServers).toEqual(["greet"])

      // 技能同步到 ccb skills 目录(前缀命名空间)。
      expect(readFileSync(path.join(installed.installDir, "skills/greet/SKILL.md"), "utf8")).toContain("你好")

      // 卸载后 ccb 链接清理。
      await uninstallPlugin("hello-plugin", home)
      expect(listInstalledPlugins(home).installed).toHaveLength(0)
    } finally {
      rmSync(market, { recursive: true, force: true })
      rmSync(home, { recursive: true, force: true })
    }
  })

  test("rejects a plugin whose manifest name mismatches", async () => {
    const market = makeMarketplace()
    const home = mkdtempSync(path.join(tmpdir(), "plugin-home-"))
    try {
      writeFileSync(
        path.join(market, "hello-plugin/.codex-plugin/plugin.json"),
        JSON.stringify({ name: "other-name", skills: [] }),
      )
      await expect(installPluginFromMarketplace({
        marketplace: market,
        marketplaceIsLocal: true,
        pluginName: "hello-plugin",
        homeDir: home,
      })).rejects.toThrow(/does not match/)
    } finally {
      rmSync(market, { recursive: true, force: true })
      rmSync(home, { recursive: true, force: true })
    }
  })

  test("parses GitHub owner/repo URLs", () => {
    expect(parseGithubPluginRepo("dsh-external/dsh-toolkit")).toMatchObject({
      owner: "dsh-external",
      name: "dsh-toolkit",
      url: "https://github.com/dsh-external/dsh-toolkit.git",
    })
    expect(parseGithubPluginRepo("https://github.com/omdsh-dev/dsh-at-file.git").name).toBe("dsh-at-file")
    expect(() => parseGithubPluginRepo("../evil")).toThrow()
  })

  test("installs a standalone community plugin that has no marketplace.json", () => {
    const home = mkdtempSync(path.join(tmpdir(), "plugin-home-"))
    const source = mkdtempSync(path.join(tmpdir(), "plugin-src-"))
    try {
      mkdirSync(path.join(source, "skills", "note"), { recursive: true })
      writeFileSync(
        path.join(source, "package.json"),
        JSON.stringify({ name: "@demo/hello-notes", version: "0.2.0", description: "Community notes" }),
      )
      writeFileSync(path.join(source, "skills/note/SKILL.md"), "---\nname: note\n---\nTake notes.\n")
      const installed = installPluginFromSourceDir({
        sourceDir: source,
        pluginName: "hello-notes",
        source: { kind: "git", url: "https://github.com/demo/hello-notes.git" },
        homeDir: home,
        description: "Community notes",
      })
      expect(installed.name).toBe("hello-notes")
      expect(installed.description).toBe("Community notes")
      expect(installed.skills.map((skill) => skill.replaceAll("\\", "/"))).toContain("skills/note")
      expect(listInstalledPlugins(home).installed).toHaveLength(1)
    } finally {
      rmSync(home, { recursive: true, force: true })
      rmSync(source, { recursive: true, force: true })
    }
  })

  test("installs an npx MCP plugin without cloning a git repo", () => {
    const home = mkdtempSync(path.join(tmpdir(), "plugin-home-"))
    try {
      const installed = installMcpPlugin({
        name: "playwright",
        description: "Browser automation",
        command: "npx",
        mcpArgs: ["-y", "@playwright/mcp"],
        homeDir: home,
      })
      expect(installed.name).toBe("playwright")
      expect(installed.mcpServers).toEqual(["playwright"])
      expect(listInstalledPlugins(home).installed[0]?.mcpServers).toEqual(["playwright"])
    } finally {
      rmSync(home, { recursive: true, force: true })
    }
  })
})
