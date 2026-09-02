import { describe, expect, test } from "bun:test"
import {
  FEATURED_MCP_PLUGINS,
  FALLBACK_COMMUNITY_PLUGINS,
  fetchPluginCommunity,
  inferPluginCategory,
  mapGithubRepo,
  mapMcpRegistryServer,
  resetPluginCommunityCache,
} from "./plugin-community"

describe("plugin community catalog", () => {
  test("infers DSH-style categories from names and descriptions", () => {
    expect(inferPluginCategory("dsh-web-ui", "sidebar theme", [])).toBe("ui")
    expect(inferPluginCategory("playwright-browser", "", ["browser"])).toBe("browser")
    expect(inferPluginCategory("session-search", "RAG over past chats", [])).toBe("search")
    expect(inferPluginCategory("dsh-github", "create PRs", [])).toBe("coding")
    expect(inferPluginCategory("notes-mcp", "MCP server for notes", [])).toBe("mcp")
  })

  test("drops the harness repo itself from the plugin list", () => {
    expect(mapGithubRepo({
      full_name: "deepseek-ai/deepseek-harness",
      name: "deepseek-harness",
      description: "Everything is a plugin",
      stargazers_count: 90000,
    })).toBeNull()
  })

  test("maps official MCP registry npm packages to npx installs", () => {
    const plugin = mapMcpRegistryServer({
      name: "io.github.example/firecrawl",
      description: "Crawl the web",
      packages: [{ registryType: "npm", identifier: "firecrawl-mcp", transport: { type: "stdio" } }],
    })
    expect(plugin).toMatchObject({
      name: "firecrawl",
      ecosystem: "mcp",
      install: { kind: "mcp-stdio", command: "npx", args: ["-y", "firecrawl-mcp"] },
    })
  })

  test("maps GitHub search hits and keeps featured MCP plugins on top", async () => {
    resetPluginCommunityCache()
    const snapshot = await fetchPluginCommunity("", (async () => new Response(JSON.stringify({
      total_count: 853,
      items: [
        {
          full_name: "dsh-external/dsh-toolkit",
          name: "dsh-toolkit",
          description: "calculator csv json",
          html_url: "https://github.com/dsh-external/dsh-toolkit",
          clone_url: "https://github.com/dsh-external/dsh-toolkit.git",
          stargazers_count: 42,
          topics: ["dsh-plugin"],
          updated_at: "2026-08-14T00:00:00Z",
        },
        {
          full_name: "deepseek-ai/deepseek-harness",
          name: "deepseek-harness",
          stargazers_count: 1,
        },
      ],
    }), { status: 200 })) as unknown as typeof fetch)

    expect(snapshot.source).toBe("mixed")
    expect(snapshot.plugins[0]?.featured).toBe(true)
    expect(snapshot.plugins.some((plugin) => plugin.name === "playwright")).toBe(true)
    expect(snapshot.plugins.some((plugin) => plugin.name === "dsh-toolkit")).toBe(true)
    expect(FEATURED_MCP_PLUGINS.length).toBeGreaterThan(20)
    expect(FEATURED_MCP_PLUGINS.some((plugin) => plugin.name === "tavily")).toBe(true)
    expect(FEATURED_MCP_PLUGINS.some((plugin) => plugin.name === "notion")).toBe(true)
    expect(FEATURED_MCP_PLUGINS.some((plugin) => plugin.name === "figma")).toBe(true)
  })

  test("uses the curated fallback list when GitHub is down", async () => {
    resetPluginCommunityCache()
    const snapshot = await fetchPluginCommunity("memory", (async () => new Response("nope", { status: 403 })) as unknown as typeof fetch)
    expect(snapshot.source).toBe("fallback")
    expect(snapshot.plugins.length).toBeGreaterThan(0)
    expect(snapshot.plugins.every((plugin) => (
      `${plugin.name} ${plugin.description}`.toLowerCase().includes("memory")
    ))).toBe(true)
    expect(FALLBACK_COMMUNITY_PLUGINS.length).toBeGreaterThan(8)
  })
})
