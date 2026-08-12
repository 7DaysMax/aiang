import { describe, expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { installPluginFromMarketplace, listInstalledPlugins, uninstallPlugin } from "./plugin-store"

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
      expect(installed.skills).toContain("skills/greet")

      const lock = listInstalledPlugins(home)
      expect(lock.installed).toHaveLength(1)
      expect(lock.installed[0]?.name).toBe("hello-plugin")

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
})
