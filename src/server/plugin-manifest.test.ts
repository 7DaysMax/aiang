import { describe, expect, test } from "bun:test"
import { parseMarketplaceManifest, parsePluginManifest, sanitizePluginName } from "./plugin-manifest"

describe("parsePluginManifest", () => {
  test("parses a full Codex-style plugin.json", () => {
    const manifest = parsePluginManifest(JSON.stringify({
      name: "my-plugin",
      version: "1.2.0",
      description: "Test plugin",
      keywords: ["codex", "skills"],
      skills: ["./skills"],
      commands: ["./commands"],
      mcpServers: {
        tools: { command: "npx", args: ["-y", "@tools/mcp"], env: { KEY: "value" } },
      },
      hooks: { preTurn: "echo start" },
      interface: {
        displayName: "My Plugin",
        category: "coding",
        capabilities: ["skills"],
        screenshots: ["shot.png"],
      },
    }))

    expect(manifest.name).toBe("my-plugin")
    expect(manifest.version).toBe("1.2.0")
    expect(manifest.skills).toEqual(["skills"])
    expect(manifest.commands).toEqual(["commands"])
    expect(manifest.tools).toEqual([])
    expect(manifest.mcpServers.tools).toMatchObject({ command: "npx", args: ["-y", "@tools/mcp"], env: { KEY: "value" } })
    expect(manifest.hooks?.preTurn).toBe("echo start")
    expect(manifest.interface?.displayName).toBe("My Plugin")
    expect(manifest.interface?.capabilities).toEqual(["skills"])
  })

  test("rejects unsafe relative paths", () => {
    expect(() => parsePluginManifest(JSON.stringify({ name: "p", skills: ["../evil"] }))).toThrow()
    expect(() => parsePluginManifest(JSON.stringify({ name: "p", skills: ["/abs"] }))).toThrow()
    expect(() => parsePluginManifest(JSON.stringify({ name: "bad/name" }))).toThrow()
  })

  test("accepts string or array skills and empty optional fields", () => {
    const manifest = parsePluginManifest(JSON.stringify({ name: "minimal", skills: "skills" }))
    expect(manifest.skills).toEqual(["skills"])
    expect(manifest.commands).toEqual([])
    expect(manifest.tools).toEqual([])
    expect(manifest.mcpServers).toEqual({})
  })

  test("parses Youmi tool plugins from .youmi-plugin fields", () => {
    const manifest = parsePluginManifest(JSON.stringify({
      name: "coding-tools",
      tools: [
        {
          name: "glob",
          description: "List files",
          permission: "r",
          entry: "./tools/glob.ts",
          parameters: { type: "object", properties: { pattern: { type: "string" } } },
        },
      ],
    }))
    expect(manifest.tools).toEqual([
      {
        name: "glob",
        description: "List files",
        permission: "r",
        entry: "tools/glob.ts",
        parameters: { type: "object", properties: { pattern: { type: "string" } } },
      },
    ])
  })
})

describe("parseMarketplaceManifest", () => {
  test("parses local, string, and git sources", () => {
    const marketplace = parseMarketplaceManifest(JSON.stringify({
      name: "codex-curated",
      plugins: [
        { name: "local-plugin", source: { source: "local", path: "./plugin-1" } },
        { name: "string-plugin", source: "./plugins/string-plugin" },
        { name: "git-plugin", source: { source: "git", url: "https://github.com/x/y.git", ref: "main" } },
      ],
    }))

    expect(marketplace.name).toBe("codex-curated")
    expect(marketplace.plugins[0]).toMatchObject({ name: "local-plugin", source: { kind: "local", path: "plugin-1" } })
    expect(marketplace.plugins[1]).toMatchObject({ name: "string-plugin", source: { kind: "local", path: "plugins/string-plugin" } })
    expect(marketplace.plugins[2]).toMatchObject({ name: "git-plugin", source: { kind: "git", url: "https://github.com/x/y.git", ref: "main" } })
  })
})

describe("sanitizePluginName", () => {
  test("strips npm scopes", () => {
    expect(sanitizePluginName("@dsh/toolkit")).toBe("toolkit")
    expect(sanitizePluginName("dsh-at-file")).toBe("dsh-at-file")
  })
})
