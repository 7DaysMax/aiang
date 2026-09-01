import type {
  CommunityPlugin,
  CommunityPluginInstall,
  PluginCommunityCategoryId,
  PluginCommunitySnapshot,
  PluginEcosystem,
} from "../shared/plugin"
import { sanitizePluginName } from "./plugin-manifest"

const GITHUB_SEARCH = "https://api.github.com/search/repositories"
const MCP_REGISTRY = "https://registry.modelcontextprotocol.io/v0.1/servers"
const CACHE_TTL_MS = 10 * 60_000
const SEARCH_TTL_MS = 2 * 60_000
const PAGE_SIZE = 50
const BROWSE_PAGES = 2
const SKIP_REPOS = new Set([
  "deepseek-ai/deepseek-harness",
  "0xsline/awesome-deepseek-harness",
  "awesome-dsh-plugin/awesome-dsh-plugin",
  "modelcontextprotocol/servers",
  "punkpeye/awesome-mcp-servers",
  "wong2/awesome-mcp-servers",
])

export const PLUGIN_COMMUNITY_CATEGORIES: Array<{ id: PluginCommunityCategoryId; label: string }> = [
  { id: "all", label: "全部" },
  { id: "coding", label: "编码" },
  { id: "tools", label: "工具" },
  { id: "search", label: "搜索" },
  { id: "ui", label: "界面" },
  { id: "browser", label: "浏览器" },
  { id: "models", label: "模型" },
  { id: "mcp", label: "MCP" },
]

function stdio(name: string, npm: string, description: string, category: PluginCommunityCategoryId, extraTopics: string[] = []): CommunityPlugin {
  return {
    name,
    fullName: `npm/${npm}`,
    description,
    url: `https://www.npmjs.com/package/${npm}`,
    cloneUrl: "",
    stars: 0,
    category,
    ecosystem: "mcp",
    featured: true,
    install: { kind: "mcp-stdio", command: "npx", args: ["-y", npm] },
    topics: ["mcp", ...extraTopics],
    updatedAt: "",
  }
}

/** 能在 Youmi 上真正跑起来的强力 MCP（npx stdio），置顶展示。 */
export const FEATURED_MCP_PLUGINS: CommunityPlugin[] = [
  stdio("playwright", "@playwright/mcp", "浏览器自动化：打开页面、点击、截图、抓内容。", "browser", ["playwright"]),
  stdio("chrome-devtools", "chrome-devtools-mcp", "Chrome DevTools：性能、DOM、网络、控制台。", "browser"),
  stdio("browserbase", "@browserbasehq/mcp-server-browserbase", "云端浏览器：托管会话、自动化、截图。", "browser"),
  stdio("puppeteer", "@modelcontextprotocol/server-puppeteer", "无头 Chrome 自动化。", "browser"),
  stdio("github", "@modelcontextprotocol/server-github", "GitHub：仓库、issue、PR、代码搜索。", "coding", ["github"]),
  stdio("gitlab", "@modelcontextprotocol/server-gitlab", "GitLab：项目、MR、issue。", "coding"),
  stdio("git", "@modelcontextprotocol/server-git", "读 git 历史、diff、blame。", "coding"),
  stdio("linear", "@linear/mcp", "Linear：issue、项目、周期。", "coding"),
  stdio("sentry", "@sentry/mcp-server", "Sentry：错误、issue、性能。", "coding"),
  stdio("context7", "@upstash/context7-mcp", "按库拉最新文档和示例，减少过时 API。", "search"),
  stdio("firecrawl", "firecrawl-mcp", "网站爬取与结构化抽取。", "search"),
  stdio("tavily", "tavily-mcp", "面向 agent 的网页搜索与抽取。", "search"),
  stdio("exa", "exa-mcp-server", "Exa 神经网络搜索。", "search"),
  stdio("brave-search", "@modelcontextprotocol/server-brave-search", "Brave 网页搜索。", "search"),
  stdio("fetch", "@modelcontextprotocol/server-fetch", "HTTP 抓取并转成适合模型的文本。", "search"),
  stdio("sequential-thinking", "@modelcontextprotocol/server-sequential-thinking", "把复杂问题拆成逐步推理链。", "tools"),
  stdio("memory", "@modelcontextprotocol/server-memory", "跨会话知识图谱记忆。", "tools"),
  stdio("sqlite", "@modelcontextprotocol/server-sqlite", "本地 SQLite 查询与分析。", "tools"),
  stdio("postgres", "@modelcontextprotocol/server-postgres", "连接 PostgreSQL 跑 SQL。", "tools"),
  stdio("mongodb", "mongodb-mcp-server", "MongoDB 查询与聚合。", "tools"),
  stdio("redis", "@modelcontextprotocol/server-redis", "Redis 读写。", "tools"),
  stdio("docker", "@docker/mcp-server", "管理 Docker 容器与镜像。", "tools"),
  stdio("notion", "@notionhq/notion-mcp-server", "Notion 页面与数据库。", "tools"),
  stdio("slack", "@modelcontextprotocol/server-slack", "读/发 Slack 消息。", "tools"),
  stdio("stripe", "@stripe/mcp", "Stripe：客户、支付、订阅。", "tools"),
  stdio("figma", "figma-developer-mcp", "读 Figma 文件、节点、设计 token。", "ui"),
  stdio("magic", "@21st-dev/magic", "21st.dev：按描述生成 UI 组件。", "ui"),
  stdio("time", "mcp-server-time", "时区转换与当前时间。", "tools"),
  stdio("gdrive", "@modelcontextprotocol/server-gdrive", "Google Drive 文件检索。", "search"),
  stdio("everything", "@modelcontextprotocol/server-everything", "MCP 参考实现：全套示例工具。", "tools"),
]

function dshFallback(
  fullName: string,
  description: string,
  category: PluginCommunityCategoryId,
): CommunityPlugin {
  const name = fullName.split("/")[1] ?? fullName
  return {
    name,
    fullName,
    description,
    url: `https://github.com/${fullName}`,
    cloneUrl: `https://github.com/${fullName}.git`,
    stars: 0,
    category,
    ecosystem: "dsh",
    install: { kind: "github", repo: fullName },
    topics: ["dsh-plugin"],
    updatedAt: "",
  }
}

export const FALLBACK_COMMUNITY_PLUGINS: CommunityPlugin[] = [
  dshFallback("dsh-external/dsh-toolkit", "官方工具套件：计算器 / CSV / JSON / 正则 / 时间", "tools"),
  dshFallback("dsh-external/dsh-plan-execute", "双模型规划/执行：规划模型思考，执行模型动手", "coding"),
  dshFallback("dsh-external/dsh-deep-research", "自适应深度研究编排器", "search"),
  dshFallback("dsh-external/dsh-session-search", "跨 dsh / Codex / Claude Code 会话只读搜索", "search"),
  dshFallback("dsh-external/dsh-memory-evolve", "跨会话长期记忆与技能自进化", "tools"),
  dshFallback("dsh-external/dsh-data-agent", "让模型连数据库、写 SQL", "tools"),
  dshFallback("dsh-external/dsh-github-integration", "GitHub 集成：PR / issue / 审批写入", "coding"),
  dshFallback("Tyan66666/billion-context-dsh", "模型驱动的上下文压缩", "tools"),
  dshFallback("Zhenyu98/dsh-context-doctor", "看清每次请求带了什么：token、技能、工具 schema", "tools"),
  dshFallback("omdsh-dev/dsh-at-file", "对话里 @ 文件引用", "coding"),
  dshFallback("PerryLink/dsh-github", "GitHub：创建/评审 PR、读 issue，写入需人工批准", "coding"),
  dshFallback("NanmiCoder/dsh-agent-teams", "多智能体团队编排", "coding"),
]

interface GithubSearchRepo {
  full_name?: string
  name?: string
  description?: string | null
  html_url?: string
  clone_url?: string
  stargazers_count?: number
  topics?: string[]
  updated_at?: string
}

interface McpRegistryPackage {
  registryType?: string
  identifier?: string
  transport?: { type?: string }
}

interface McpRegistryServer {
  name?: string
  title?: string
  description?: string
  websiteUrl?: string
  repository?: { url?: string; source?: string }
  packages?: McpRegistryPackage[]
  remotes?: Array<{ type?: string; url?: string }>
}

interface CacheEntry {
  expiresAt: number
  snapshot: PluginCommunitySnapshot
}

const cache = new Map<string, CacheEntry>()

export function resetPluginCommunityCache() {
  cache.clear()
}

export function inferPluginCategory(name: string, description: string, topics: string[]): PluginCommunityCategoryId {
  const hay = `${name} ${description} ${topics.join(" ")}`.toLowerCase()
  if (/browser|playwright|puppeteer|chrome|selenium|devtools/.test(hay)) return "browser"
  if (/\bmcp\b|model.context.protocol/.test(hay)) return "mcp"
  if (/web.?ui|sidebar|tui|theme|canvas|desktop|mobile|composer|diff.viewer|emoji/.test(hay)) return "ui"
  if (/model|inference|llm|openai|anthropic|plan-execute/.test(hay)) return "models"
  if (/search|rag|zotero|research|scout|sonar|crawl|firecrawl|brave|tavily|exa/.test(hay)) return "search"
  if (/git|github|coding|code|edit|file|grep|glob|lint|test|interpreter/.test(hay)) return "coding"
  return "tools"
}

function skipRepo(fullName: string, name: string) {
  if (SKIP_REPOS.has(fullName)) return true
  if (name.startsWith("awesome-")) return true
  return false
}

function matchesQuery(plugin: CommunityPlugin, query: string) {
  const needle = query.trim().toLowerCase()
  if (!needle) return true
  return `${plugin.name} ${plugin.description} ${plugin.fullName} ${plugin.topics.join(" ")}`.toLowerCase().includes(needle)
}

export function mapGithubRepo(raw: GithubSearchRepo, ecosystem: PluginEcosystem = "dsh"): CommunityPlugin | null {
  const fullName = typeof raw.full_name === "string" ? raw.full_name : ""
  const name = typeof raw.name === "string" ? raw.name : fullName.split("/")[1] ?? ""
  if (!fullName || !name || skipRepo(fullName, name)) return null
  const description = typeof raw.description === "string" ? raw.description : ""
  const topics = Array.isArray(raw.topics) ? raw.topics.filter((topic): topic is string => typeof topic === "string") : []
  return {
    name,
    fullName,
    description,
    url: typeof raw.html_url === "string" ? raw.html_url : `https://github.com/${fullName}`,
    cloneUrl: typeof raw.clone_url === "string" ? raw.clone_url : `https://github.com/${fullName}.git`,
    stars: typeof raw.stargazers_count === "number" ? raw.stargazers_count : 0,
    category: inferPluginCategory(name, description, topics),
    ecosystem,
    install: { kind: "github", repo: fullName },
    topics,
    updatedAt: typeof raw.updated_at === "string" ? raw.updated_at : "",
  }
}

export function mapMcpRegistryServer(raw: McpRegistryServer): CommunityPlugin | null {
  const fullName = typeof raw.name === "string" ? raw.name : ""
  if (!fullName) return null
  const leaf = fullName.split("/").pop() || fullName
  let name: string
  try {
    name = sanitizePluginName(leaf.replace(/[^A-Za-z0-9._-]+/g, "-"))
  } catch {
    return null
  }
  const description = typeof raw.description === "string" ? raw.description : ""
  const repoUrl = typeof raw.repository?.url === "string" ? raw.repository.url : ""
  const website = typeof raw.websiteUrl === "string" ? raw.websiteUrl : ""
  const npm = (raw.packages ?? []).find((entry) => entry.registryType === "npm" && entry.identifier)
  const remote = (raw.remotes ?? []).find((entry) => typeof entry.url === "string" && entry.url)
  let install: CommunityPluginInstall | null = null
  if (npm?.identifier) {
    install = { kind: "mcp-stdio", command: "npx", args: ["-y", npm.identifier] }
  } else if (remote?.url) {
    install = { kind: "mcp-http", url: remote.url }
  } else if (/github\.com\/[^/]+\/[^/]+/.test(repoUrl)) {
    const repo = repoUrl.replace(/^https?:\/\/github\.com\//i, "").replace(/\.git$/i, "").replace(/\/+$/, "")
    install = { kind: "github", repo }
  }
  if (!install) return null
  return {
    name,
    fullName,
    description: description || (typeof raw.title === "string" ? raw.title : name),
    url: repoUrl || website || `https://github.com/search?q=${encodeURIComponent(fullName)}`,
    cloneUrl: repoUrl.endsWith(".git") ? repoUrl : repoUrl ? `${repoUrl}.git` : "",
    stars: 0,
    category: inferPluginCategory(name, description, ["mcp"]),
    ecosystem: "mcp",
    install,
    topics: ["mcp"],
    updatedAt: "",
  }
}

async function githubSearch(
  topicQuery: string,
  extra: string,
  page: number,
  fetchImpl: typeof fetch,
): Promise<{ total: number; items: GithubSearchRepo[] }> {
  const q = extra.trim() ? `${topicQuery} ${extra.trim()}` : topicQuery
  const url = new URL(GITHUB_SEARCH)
  url.searchParams.set("q", q)
  url.searchParams.set("sort", "stars")
  url.searchParams.set("order", "desc")
  url.searchParams.set("per_page", String(PAGE_SIZE))
  url.searchParams.set("page", String(page))
  const response = await fetchImpl(url, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "YoumiAiagent",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    signal: AbortSignal.timeout(12_000),
  })
  if (!response.ok) {
    throw new Error(`GitHub 插件目录请求失败（${response.status}）。`)
  }
  const payload = await response.json() as { total_count?: number; items?: GithubSearchRepo[] }
  return {
    total: typeof payload.total_count === "number" ? payload.total_count : 0,
    items: Array.isArray(payload.items) ? payload.items : [],
  }
}

async function githubTopicPlugins(
  topicQuery: string,
  ecosystem: PluginEcosystem,
  query: string,
  fetchImpl: typeof fetch,
): Promise<{ total: number; plugins: CommunityPlugin[] }> {
  const first = await githubSearch(topicQuery, query, 1, fetchImpl)
  const pages = [first]
  if (!query.trim()) {
    for (let page = 2; page <= BROWSE_PAGES; page++) {
      try {
        pages.push(await githubSearch(topicQuery, query, page, fetchImpl))
      } catch {
        break
      }
    }
  }
  const plugins: CommunityPlugin[] = []
  const seen = new Set<string>()
  for (const page of pages) {
    for (const raw of page.items) {
      const mapped = mapGithubRepo(raw, ecosystem)
      if (!mapped || seen.has(mapped.fullName)) continue
      seen.add(mapped.fullName)
      plugins.push(mapped)
    }
  }
  return { total: first.total, plugins }
}

async function mcpRegistryPlugins(query: string, fetchImpl: typeof fetch): Promise<{ total: number; plugins: CommunityPlugin[] }> {
  const plugins: CommunityPlugin[] = []
  const seen = new Set<string>()
  let cursor: string | undefined
  let total = 0
  const maxPages = query.trim() ? 1 : 3
  for (let page = 0; page < maxPages; page++) {
    const url = new URL(MCP_REGISTRY)
    if (query.trim()) url.searchParams.set("search", query.trim())
    url.searchParams.set("version", "latest")
    url.searchParams.set("limit", query.trim() ? "50" : "100")
    if (cursor) url.searchParams.set("cursor", cursor)
    const response = await fetchImpl(url, {
      headers: { Accept: "application/json", "User-Agent": "YoumiAiagent" },
      signal: AbortSignal.timeout(12_000),
    })
    if (!response.ok) throw new Error(`MCP 官方目录请求失败（${response.status}）。`)
    const payload = await response.json() as {
      servers?: Array<{ server?: McpRegistryServer }>
      metadata?: { nextCursor?: string; count?: number }
    }
    total += typeof payload.metadata?.count === "number" ? payload.metadata.count : (payload.servers?.length ?? 0)
    for (const entry of payload.servers ?? []) {
      if (!entry.server) continue
      const mapped = mapMcpRegistryServer(entry.server)
      if (!mapped || seen.has(mapped.fullName)) continue
      seen.add(mapped.fullName)
      plugins.push(mapped)
    }
    cursor = payload.metadata?.nextCursor
    if (!cursor) break
  }
  return { total: Math.max(total, plugins.length), plugins }
}

function mergePlugins(groups: CommunityPlugin[][]): CommunityPlugin[] {
  const seen = new Set<string>()
  const out: CommunityPlugin[] = []
  for (const group of groups) {
    for (const plugin of group) {
      const key = plugin.fullName.toLowerCase()
      const nameKey = plugin.name.toLowerCase()
      if (seen.has(key) || seen.has(`name:${nameKey}`)) continue
      seen.add(key)
      seen.add(`name:${nameKey}`)
      out.push(plugin)
    }
  }
  out.sort((left, right) => Number(Boolean(right.featured)) - Number(Boolean(left.featured)) || right.stars - left.stars)
  return out
}

/** 合并 DSH 社区、GitHub mcp-server、官方 MCP 目录与精选强力插件。 */
export async function fetchPluginCommunity(
  query = "",
  fetchImpl: typeof fetch = fetch,
): Promise<PluginCommunitySnapshot> {
  const normalized = query.trim()
  const cacheKey = normalized.toLowerCase()
  const cached = cache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) return cached.snapshot

  const featured = FEATURED_MCP_PLUGINS.filter((plugin) => matchesQuery(plugin, normalized))
  const errors: string[] = []
  let dshTotal = 0
  let mcpGithubTotal = 0
  let mcpRegistryTotal = 0
  let dsh: CommunityPlugin[] = []
  let mcpGithub: CommunityPlugin[] = []
  let mcpRegistry: CommunityPlugin[] = []

  const [dshResult, mcpGithubResult, mcpRegistryResult] = await Promise.allSettled([
    githubTopicPlugins("topic:dsh-plugin", "dsh", normalized, fetchImpl),
    githubTopicPlugins("topic:mcp-server OR topic:mcp", "github", normalized, fetchImpl),
    mcpRegistryPlugins(normalized, fetchImpl),
  ])

  if (dshResult.status === "fulfilled") {
    dsh = dshResult.value.plugins
    dshTotal = dshResult.value.total
  } else {
    errors.push(dshResult.reason instanceof Error ? dshResult.reason.message : "DSH 目录失败")
  }
  if (mcpGithubResult.status === "fulfilled") {
    mcpGithub = mcpGithubResult.value.plugins
    mcpGithubTotal = mcpGithubResult.value.total
  } else {
    errors.push(mcpGithubResult.reason instanceof Error ? mcpGithubResult.reason.message : "MCP GitHub 目录失败")
  }
  if (mcpRegistryResult.status === "fulfilled") {
    mcpRegistry = mcpRegistryResult.value.plugins
    mcpRegistryTotal = mcpRegistryResult.value.total
  } else {
    errors.push(mcpRegistryResult.reason instanceof Error ? mcpRegistryResult.reason.message : "MCP 官方目录失败")
  }

  const liveFailed = dshResult.status !== "fulfilled" && mcpGithubResult.status !== "fulfilled" && mcpRegistryResult.status !== "fulfilled"
  const plugins = liveFailed
    ? mergePlugins([featured, FALLBACK_COMMUNITY_PLUGINS.filter((plugin) => matchesQuery(plugin, normalized))])
    : mergePlugins([featured, mcpRegistry, mcpGithub, dsh])

  const snapshot: PluginCommunitySnapshot = {
    query: normalized,
    total: Math.max(dshTotal + mcpGithubTotal + mcpRegistryTotal + featured.length, plugins.length),
    plugins,
    source: liveFailed ? "fallback" : "mixed",
    fetchedAt: new Date().toISOString(),
    ...(errors.length && liveFailed ? { error: errors.join("；") } : {}),
  }
  cache.set(cacheKey, {
    expiresAt: Date.now() + (normalized ? SEARCH_TTL_MS : CACHE_TTL_MS),
    snapshot,
  })
  return snapshot
}
