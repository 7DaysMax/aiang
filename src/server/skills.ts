import { existsSync, lstatSync, mkdirSync, readdirSync, readlinkSync, rmSync, symlinkSync } from "node:fs"
import { readFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { getClaudeConfigDir } from "../shared/branding"
import type {
  GlobalSkillsSnapshot,
  HotSkillsCategory,
  HotSkillsSnapshot,
  InstalledSkillsSnapshot,
  SkillInstallResult,
  SkillSearchResult,
  SkillSearchSnapshot,
  SkillUninstallResult,
} from "../shared/types"
import { listGlobalSkills } from "./harness-skills"

const SKILL_AGENT_ALIASES = ["universal", "claude-code"] as const

export function assertSafeSkillSource(source: string) {
  const normalized = source.trim()
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(normalized)) {
    throw new Error("Skill source must be an owner/repo pair.")
  }
  return normalized
}

export function assertSafeSkillId(skillId: string) {
  const normalized = skillId.trim()
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(normalized)) {
    throw new Error("Skill id is invalid.")
  }
  return normalized
}

export function getGlobalSkillLockPath() {
  const xdgStateHome = process.env.XDG_STATE_HOME?.trim()
  if (xdgStateHome) {
    return path.join(xdgStateHome, "skills", ".skill-lock.json")
  }
  return path.join(os.homedir(), ".agents", ".skill-lock.json")
}

function asString(value: unknown) {
  return typeof value === "string" ? value : ""
}

export function parseInstalledSkillsLock(parsed: unknown, lockFilePath: string): InstalledSkillsSnapshot {
  const skillsRecord = parsed
    && typeof parsed === "object"
    && "skills" in parsed
    && parsed.skills
    && typeof parsed.skills === "object"
    && !Array.isArray(parsed.skills)
      ? parsed.skills as Record<string, unknown>
      : {}

  const skills = Object.entries(skillsRecord)
    .filter(([, entry]) => entry && typeof entry === "object" && !Array.isArray(entry))
    .map(([name, entry]) => {
      const record = entry as Record<string, unknown>
      return {
        name,
        source: asString(record.source),
        sourceType: asString(record.sourceType),
        sourceUrl: asString(record.sourceUrl),
        skillPath: asString(record.skillPath) || undefined,
        installedAt: asString(record.installedAt),
        updatedAt: asString(record.updatedAt),
        pluginName: asString(record.pluginName) || undefined,
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name))

  return {
    lockFilePath,
    skills,
  }
}

export async function listInstalledSkills(lockFilePath = getGlobalSkillLockPath()): Promise<InstalledSkillsSnapshot> {
  try {
    return parseInstalledSkillsLock(JSON.parse(await readFile(lockFilePath, "utf8")), lockFilePath)
  } catch {
    return {
      lockFilePath,
      skills: [],
    }
  }
}

export async function searchSkills(query: string, limit = 100): Promise<SkillSearchSnapshot> {
  const normalizedQuery = query.trim()
  if (normalizedQuery.length < 2) {
    return {
      query: normalizedQuery,
      searchType: "fuzzy",
      skills: [],
      count: 0,
      duration_ms: 0,
    }
  }

  const normalizedLimit = Math.max(1, Math.min(100, Math.trunc(limit)))
  const url = new URL("https://skills.sh/api/search")
  url.searchParams.set("q", normalizedQuery)
  url.searchParams.set("limit", String(normalizedLimit))

  const response = await fetch(url, {
    signal: AbortSignal.timeout(10_000),
  })
  if (!response.ok) {
    throw new Error(`Skills search failed with status ${response.status}.`)
  }

  const payload = await response.json() as Partial<SkillSearchSnapshot>
  return {
    query: typeof payload.query === "string" ? payload.query : normalizedQuery,
    searchType: typeof payload.searchType === "string" ? payload.searchType : "fuzzy",
    skills: Array.isArray(payload.skills)
      ? payload.skills
        .filter((skill) => (
          skill
          && typeof skill === "object"
          && typeof skill.id === "string"
          && typeof skill.skillId === "string"
          && typeof skill.name === "string"
          && typeof skill.source === "string"
        ))
        .map((skill) => ({
          id: skill.id,
          skillId: skill.skillId,
          name: skill.name,
          installs: typeof skill.installs === "number" ? skill.installs : 0,
          source: skill.source,
        }))
      : [],
    count: typeof payload.count === "number" ? payload.count : 0,
    duration_ms: typeof payload.duration_ms === "number" ? payload.duration_ms : 0,
  }
}

// ---------------------------------------------------------------------------
// 热门技能（设置页分类浏览）
// ---------------------------------------------------------------------------

export type HotSkillCategoryId = HotSkillsCategory["id"]

/** 每个分类用一组定向关键词聚合搜索，避免单个关键词的模糊噪音。 */
const HOT_SKILL_QUERIES: Record<HotSkillCategoryId, string[]> = {
  programming: [
    "coding",
    "frontend",
    "web",
    "skill",
    "agent",
    "claude",
    "ai",
    "api",
    "typescript",
    "python",
    "react",
    "git",
    "testing",
    "code-review",
    "code-quality",
    "clean-code",
    "debugging",
    "security",
  ],
  reverse: [
    "reverse-engineering",
    "ctf",
    "malware",
    "ghidra",
    "ida",
    "frida",
    "binary-analysis",
    "pwn",
    "exploit",
    "vulnerability",
  ],
}

/** 热门技能的中文简介：key 为 skillId，给设置页分类浏览的每个技能附上「是干嘛的」。 */
const HOT_SKILL_DESCRIPTIONS: Record<string, string> = {
  // 编程
  "find-skills": "技能发现：在 skills.sh 上搜索、查找最适合的技能（全网安装量第一，2.8M+）。",
  "agent-browser": "Vercel 浏览器代理：让 AI 操作真实浏览器做网页测试、截图与自动化。",
  "skill-creator": "Anthropic 官方技能创建器：按规范把知识/工作流封装成可复用技能。",
  "vercel-composition-patterns": "Vercel 组合模式：组合式 UI 组件与页面模式的最佳实践。",
  "claude-handoff": "Claude 会话交接：把任务上下文干净地交接给下一个 agent，不丢线索。",
  "deploy-to-vercel": "部署到 Vercel：把项目一键部署到 Vercel 的流程与配置。",
  "grill-me": "代码评审陪练：让 AI 扮演严格评审人逐条拷问你的代码，逼出潜在问题。",
  "grill-with-docs": "带文档的代码评审：评审时同步对照项目文档，指出实现与文档的偏差。",
  "improve-codebase-architecture": "架构改进：分析代码库结构，给出分层、模块化与可维护性改进方案。",
  "setup-matt-pocock-skills": "Matt Pocock 技能套件：一键安装 mattpocock/skills 全家桶。",
  "lark-mail": "飞书邮箱：让 AI 直接读写飞书（Lark）邮箱，处理邮件收发。",
  "lark-skill-maker": "飞书技能制作：用飞书开放平台把流程封装成可复用技能。",
  "microsoft-foundry": "Microsoft Foundry：微软 Foundry（Azure AI Foundry）平台开发技能。",
  "azure-ai": "Azure AI：使用 Azure AI 服务（模型、认知服务）开发应用。",
  "azure-diagnostics": "Azure 诊断：排查 Azure 资源与应用的常见故障。",
  "frontend-design": "Anthropic 官方前端设计技能：把设计稿/截图转成高质量 Web 界面，注重视觉细节与响应式布局。",
  "vercel-react-best-practices": "Vercel 官方 React 最佳实践：让 AI 写出符合 Vercel 规范、可直接上线的 React/App Router 代码。",
  "lark-openapi-explorer": "飞书开放平台 API 浏览器：让 AI 直接查询和调用飞书生态的开放接口，自动生成对接代码。",
  "web-design-guidelines": "Vercel Web 设计指南：为 AI 提供现代网页设计规范、排版与配色决策参考。",
  "design-taste-frontend": "前端设计品味：打磨界面美感，帮 AI 产出更有设计感、更像真实产品的 UI。",
  "git-guardrails-claude-code": "Git 护栏：规范 AI 的 git 操作流程，避免乱提交、误删和冲突。",
  "imagegen-frontend-web": "Web 端图像生成：让 AI 生成与前端页面风格匹配的 Web 配图素材。",
  "imagegen-frontend-mobile": "移动端图像生成：为移动端界面生成风格统一的插图素材。",
  "vercel-react-native-skills": "Vercel React Native 技能：指导 AI 编写 React Native 跨平台应用代码。",
  "using-git-worktrees": "Git Worktree 工作流：用并行工作树隔离多任务开发，互不干扰地同时改多个分支。",
  "webapp-testing": "Web 应用测试：为 Web 应用编写端到端/集成测试，覆盖关键用户流程与回归场景。",
  "prisma-client-api": "Prisma Client API：指导 AI 正确使用 Prisma 客户端查询、事务与关系操作。",
  "python-appservice-deploy": "Python 应用部署：把 Python 应用部署到 Azure App Service 的流程与配置。",
  "code-review": "代码审查：让 AI 以专业标准审查代码，揪出 bug、安全隐患与可维护性问题。",
  "requesting-code-review": "主动请求审查：写完代码后发起代码评审，清晰说明改动点并征求反馈。",
  "receiving-code-review": "接收评审反馈：帮 AI 理解评审意见，逐条回应并落地改进。",
  "systematic-debugging": "系统性调试：用结构化方法定位 bug 根因，避免瞎猜和反复试错。",
  "firebase-security-rules-auditor": "Firebase 安全规则审计：检查 Firestore/Storage 规则的越权风险并给出修复建议。",
  "debugging-and-error-recovery": "调试与错误恢复：常见报错的快速定位与恢复流程，减少卡壳。",
  "code-review-and-quality": "代码评审与质量：一套代码审查 + 质量提升的工作流，覆盖可读性、性能与安全。",
  "security-review": "安全评审：对代码做安全视角的审查，识别注入、越权、密钥泄露等风险。",
  "sql-code-review": "SQL 代码审查：检查 SQL 查询的性能、注入风险与正确性。",
  "debugging-strategies": "调试策略：针对疑难 bug 的排查策略与方法论。",
  "clean-code": "整洁代码：按 Clean Code 原则组织代码，提升可读性与可维护性。",
  "golang-security": "Go 安全：Go 代码的安全检查要点与常见漏洞规避。",
  "golang-testing": "Go 测试：为 Go 代码编写单元/集成测试的最佳实践。",
  "typescript-advanced-types": "TypeScript 高级类型：条件类型、映射类型、infer 推断等进阶类型技巧。",
  "web-perf": "Web 性能优化：分析 LCP/FCP 等核心指标，给出可落地的性能优化方案。",
  "ab-testing": "A/B 测试：设计、运行并解读 A/B 实验，用数据判断哪个方案更优。",
  "website-to-video": "网页转视频：把网站/网页内容一键转成演示视频（HeyGen Hyperframes）。",
  "website-to-hyperframes": "网页转动画：把网站页面转换为可编辑的动画帧素材（HeyGen Hyperframes）。",
  "web-artifacts-builder": "Anthropic 官方 Web 产物构建：按设计规格生成可直接运行的网页、组件等产物。",
  "audit-website": "网站审计：检查网站的可访问性、SEO、性能与最佳实践问题。",
  "higgsfield-websites": "Higgsfield 网站生成：用 Higgsfield 平台生成网站页面与视觉素材。",
  "byted-web-search": "字节 Web 搜索：接入字节跳动 Web 搜索 API，让 AI 实时检索网页信息。",
  "git-commit": "Git 提交：规范提交信息与提交流程，避免乱提交和半成品入库。",
  "python-performance-optimization": "Python 性能优化：用 profiling 定位瓶颈，给出算法、并发等优化方案。",
  "python-testing-patterns": "Python 测试模式：为 Python 代码编写可靠单元/集成测试的模式。",
  "excalidraw-diagram-generator": "Excalidraw 图表生成：根据描述生成可编辑的手绘风图表。",
  "documentation-writer": "文档编写：写出清晰、结构化的技术文档与 README。",
  "prd": "PRD 文档：编写产品需求文档，梳理功能、流程与验收标准。",
  "gh-cli": "GitHub CLI：用 gh 命令完成仓库、Issue、PR 等日常操作。",
  "refactor": "重构：安全地重构代码，保持行为不变、提升可维护性。",
  "multi-stage-dockerfile": "多阶段 Dockerfile：编写多阶段构建，减小镜像体积、加速构建。",
  "java-springboot": "Java Spring Boot：Spring Boot 项目开发规范与最佳实践。",
  // 逆向
  "protocol-reverse-engineering": "协议逆向：分析抓包流量，还原私有/加密网络协议的字段结构、加密流程与交互时序。",
  "binary-analysis-patterns": "二进制分析：提供可复用的二进制分析模式与思路，配合 Ghidra/IDA 分析程序逻辑。",
  "ctf-reverse": "CTF 逆向题：系统化的逆向解题方法论，覆盖常见题型的分析套路与工具链。",
  "ctf-web": "CTF Web 题：Web 漏洞利用与解题思路，覆盖 SQLi、XSS、SSRF 等常见考点。",
  "ctf-pwn": "CTF Pwn 题：二进制漏洞利用，覆盖栈溢出、堆利用、格式化字符串等攻击面。",
  "ctf-crypto": "CTF 密码学题：从古典密码到现代密码的识别、分析与破解方法。",
  "ctf-osint": "CTF 开源情报：从公开信息中收集线索、溯源追踪目标的调查方法。",
  "ctf-forensics": "CTF 取证题：磁盘、内存、流量取证分析，从数据中还原关键线索。",
  "ctf-misc": "CTF Misc 杂项题：编码、隐写、文件分析等杂项题的通用解法。",
  "ctf-malware": "CTF 恶意样本：分析恶意程序行为，还原攻击载荷、混淆手段与免杀思路。",
  "frida-17": "Frida 17 使用指南：用动态插桩 hook 运行中的进程，实时分析 App 与程序的行为。",
  "rev-frida": "Frida 逆向：基于 Frida 的 hook 与动态分析工作流，用于应用/游戏逆向。",
  "reverse-engineer-rpi": "树莓派逆向：针对树莓派（Raspberry Pi）固件与二进制程序的逆向分析流程。",
  "analyzing-android-malware-with-apktool": "Android 恶意样本分析：用 Apktool 反编译 APK，还原恶意行为与代码逻辑。",
  "vm-and-bytecode-reverse": "虚拟机与字节码逆向：分析 VM 保护的二进制，还原字节码指令与解释器逻辑。",
  "heap-exploitation": "堆利用：CTF/Pwn 堆漏洞利用技巧，覆盖堆溢出、UAF、Tcache 攻击等。",
  "format-string-exploitation": "格式化字符串利用：利用格式化字符串漏洞读写内存、泄露地址或执行 shellcode。",
  "kernel-exploitation": "内核利用：分析内核漏洞并构造提权利用，覆盖常见内核攻击面。",
  "browser-exploitation-v8": "V8 浏览器利用：针对 V8/JavaScript 引擎漏洞的利用开发与分析。",
  "reverse-shell-techniques": "反弹 Shell：各种反弹 Shell 的构造与规避技巧（攻防对抗向）。",
  "reverse-engineer": "逆向工程入门：通用的逆向分析方法论与常用工具链（Ghidra/IDA/调试器）。",
  "ctf-writeup": "CTF 题解文档：把解题思路与过程整理成规范、可复现的 writeup。",
  "ctf-ai-ml": "CTF AI/ML 题：CTF 中的人工智能题目，覆盖对抗样本、模型攻击与逆向推理。",
  "apk-reverse": "APK 逆向：解包、分析 Android 应用并还原其逻辑。",
  "analyzing-linux-elf-malware": "Linux ELF 恶意样本：对 ELF 恶意程序做静态与动态行为分析。",
  "analyzing-network-traffic-of-malware": "恶意流量分析：从抓包数据中识别 C2 通信与恶意行为特征。",
  "analyzing-golang-malware-with-ghidra": "Ghidra 分析 Go 恶意程序：还原 Go 二进制中的符号与业务逻辑。",
  "analyzing-network-covert-channels-in-malware": "隐蔽信道分析：识别恶意软件中的隐蔽通信信道与数据外带手法。",
  "analyzing-malware-sandbox-evasion-techniques": "沙箱逃逸分析：识别恶意样本的沙箱检测与逃逸手法。",
  "ghidra-headless": "Ghidra 无头模式：用命令行/脚本批量反编译与自动化分析。",
  "analyzing-malware-behavior-with-cuckoo-sandbox": "Cuckoo 沙箱：自动化运行恶意样本并提取行为分析报告。",
  "reverse-engineering-android-malware-with-jadx": "JADX 逆向 Android 恶意样本：反编译 APK，定位并还原恶意代码。",
}

/**
 * 逆向分类的名称过滤：skills.sh 的模糊搜索会把无关技能混进来
 * （如 azure-validate、returns-reverse-logistics），只保留名字明显属于逆向/安全研究的。
 */
// frida(?!y) 避免把 friday-brief 这类模糊命中当逆向技能。
const REVERSE_NAME_PATTERN = /(reverse|malware|ctf|ghidra|\bida\b|frida(?!y)|binary|bytecode|pwn|exploit|disasm|unpack|hack|forensic|shellcode|kernel|debug)/i
/** 名字碰巧命中关键词、但实际与逆向无关的模糊命中。 */
const REVERSE_NOISE_PATTERN = /returns-reverse-logistics|reverse-image-search|reverse-proxy|reverse-dns|reverse-string|reverse-lookup|hackernews|^hack$/i

export function isReverseSkillName(name: string): boolean {
  if (REVERSE_NOISE_PATTERN.test(name)) return false
  return REVERSE_NAME_PATTERN.test(name)
}

/**
 * 聚合一个分类的热门技能：并行跑定向关键词搜索，按 skillId 去重（同名不同
 * source 保留安装量最高的一条），按安装量降序取前 `limit` 个。
 */
export async function fetchHotSkillCategory(
  id: HotSkillCategoryId,
  search: (query: string, limit?: number) => Promise<SkillSearchSnapshot> = searchSkills,
  limit = 15,
): Promise<SkillSearchResult[]> {
  const snapshots = await Promise.all(HOT_SKILL_QUERIES[id].map(async (query) => {
    try {
      return await search(query, 60)
    } catch {
      // 单个查询失败（限流/超时）不拖垮整个分类：跳过该查询，用其余结果聚合。
      return { query, searchType: "fuzzy", skills: [], count: 0, duration_ms: 0 } satisfies SkillSearchSnapshot
    }
  }))
  const bySkillId = new Map<string, SkillSearchResult>()
  for (const snapshot of snapshots) {
    for (const skill of snapshot.skills) {
      if (id === "reverse" && !isReverseSkillName(skill.name)) continue
      const existing = bySkillId.get(skill.skillId)
      if (!existing || skill.installs > existing.installs) {
        bySkillId.set(skill.skillId, {
          ...skill,
          description: HOT_SKILL_DESCRIPTIONS[skill.skillId],
        })
      }
    }
  }
  return [...bySkillId.values()]
    .sort((a, b) => b.installs - a.installs)
    .slice(0, limit)
}

const HOT_SKILL_TTL_MS = 10 * 60_000

let hotSkillsCache: { at: number; snapshot: HotSkillsSnapshot } | null = null

/** 分类返回编程/逆向各前 15 个热门技能；10 分钟内复用缓存。 */
export async function fetchHotSkills(force = false): Promise<HotSkillsSnapshot> {
  const now = Date.now()
  if (!force && hotSkillsCache && now - hotSkillsCache.at < HOT_SKILL_TTL_MS) {
    return hotSkillsCache.snapshot
  }
  const [programming, reverse] = await Promise.all([
    fetchHotSkillCategory("programming"),
    fetchHotSkillCategory("reverse"),
  ])
  const snapshot: HotSkillsSnapshot = {
    fetchedAt: new Date().toISOString(),
    categories: [
      { id: "programming", label: "编程", skills: programming },
      { id: "reverse", label: "逆向", skills: reverse },
    ],
  }
  hotSkillsCache = { at: now, snapshot }
  return snapshot
}

export function buildInstallSkillCommand(source: string, skillId: string) {
  return [
    process.platform === "win32" ? "npx.cmd" : "npx",
    "skills",
    "add",
    assertSafeSkillSource(source),
    "--skill",
    assertSafeSkillId(skillId),
    "--global",
    "--agent",
    ...SKILL_AGENT_ALIASES,
    "--yes",
  ]
}

export function buildUninstallSkillCommand(skillId: string) {
  return [
    process.platform === "win32" ? "npx.cmd" : "npx",
    "skills",
    "remove",
    assertSafeSkillId(skillId),
    "--global",
    "--yes",
  ]
}

async function runSkillCommand(command: string[]) {
  const cwd = os.homedir()
  const subprocess = Bun.spawn(command, {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
    env: skillCommandEnv(),
  })

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(subprocess.stdout).text(),
    new Response(subprocess.stderr).text(),
    subprocess.exited,
  ])

  if (exitCode !== 0) {
    throw new Error(stderr.trim() || stdout.trim() || `skills CLI exited with code ${exitCode}.`)
  }

  return { cwd, stdout, stderr }
}

/**
 * Build the child env for the skills CLI. The app can be launched from an env
 * whose PATH misses the homebrew/usr-local bin dirs (dev respawn, GUI launch),
 * which would make `npx` unresolvable — prepend the common locations so the
 * installer works regardless of how the process was started.
 */
function skillCommandEnv() {
  const existingPath = process.env.PATH ?? ""
  const missing = ["/opt/homebrew/bin", "/usr/local/bin"].filter(
    (dir) => !existingPath.split(":").includes(dir),
  )
  const PATH = missing.length > 0 ? [...missing, existingPath].filter(Boolean).join(":") : existingPath
  return {
    ...process.env,
    PATH,
    DISABLE_TELEMETRY: process.env.DISABLE_TELEMETRY ?? "1",
  }
}

/**
 * ccb（DeepSeek 通道内置的 claude-code-best 引擎）只读自己配置目录下的
 * skills/，而设置页安装的技能落在 ~/.agents/skills。这里把已装技能符号链接
 * 进 ccb 的 skills 目录，让 DeepSeek 对话的 "/" 菜单立即可用。
 */
export function getCcbSkillsDir(homeDir = os.homedir()): string {
  return path.join(getClaudeConfigDir(homeDir), "skills")
}

function isLinkedTo(sourceDir: string, linkPath: string): boolean {
  try {
    return readlinkSync(linkPath) === sourceDir
  } catch {
    return false
  }
}

/** existsSync 对悬空符号链接返回 false，这里用 lstat 判断「路径存在」不受目标影响。 */
function pathEntryExists(target: string): boolean {
  try {
    lstatSync(target)
    return true
  } catch {
    return false
  }
}

/** 把 ~/.agents/skills/<id> 同步为 ccb skills/<id> 符号链接（幂等）。 */
export function syncInstalledSkillToCcb(skillId: string, homeDir = os.homedir()): boolean {
  const safeId = assertSafeSkillId(skillId)
  const sourceDir = path.join(homeDir, ".agents", "skills", safeId)
  if (!existsSync(path.join(sourceDir, "SKILL.md"))) return false

  const ccbSkillsDir = getCcbSkillsDir(homeDir)
  try {
    mkdirSync(ccbSkillsDir, { recursive: true })
  } catch {
    return false
  }

  const linkPath = path.join(ccbSkillsDir, safeId)
  try {
    if (pathEntryExists(linkPath)) {
      // 已是指向同一来源的链接：无需重建；被别的来源占用（换源重装）则先清掉。
      if (isLinkedTo(sourceDir, linkPath)) return true
      rmSync(linkPath, { recursive: true, force: true })
    }
    symlinkSync(sourceDir, linkPath)
    return true
  } catch {
    return false
  }
}

/**
 * 卸载后清理 ccb 里的链接。只在来源目录确实被删掉时清理：同名的手工目录
 * 保留，避免把用户自己放进去的技能一并删掉。
 */
export function removeInstalledSkillFromCcb(skillId: string, homeDir = os.homedir()): void {
  const safeId = assertSafeSkillId(skillId)
  if (existsSync(path.join(homeDir, ".agents", "skills", safeId))) return
  const linkPath = path.join(getCcbSkillsDir(homeDir), safeId)
  try {
    if (pathEntryExists(linkPath)) rmSync(linkPath, { recursive: true, force: true })
  } catch {}
}

/** 启动兜底：把 ~/.agents/skills 下所有技能同步进 ccb（旧版本装的技能无需重装）。 */
export function syncCcbSkillsFromAgents(): number {
  let entries: string[]
  try {
    entries = readdirSync(path.join(os.homedir(), ".agents", "skills"))
  } catch {
    return 0
  }
  let synced = 0
  for (const entry of entries) {
    if (entry.startsWith(".")) continue
    if (syncInstalledSkillToCcb(entry)) synced += 1
  }
  return synced
}

export async function installSkill(source: string, skillId: string): Promise<SkillInstallResult> {
  const command = buildInstallSkillCommand(source, skillId)
  const { cwd, stdout, stderr } = await runSkillCommand(command)
  // 让新装的技能立刻出现在 DeepSeek 对话（ccb 只读自己的配置目录）。
  syncInstalledSkillToCcb(skillId)
  return {
    source: command[3],
    skillId: command[5],
    command,
    cwd,
    stdout,
    stderr,
  }
}

export async function uninstallSkill(skillId: string): Promise<SkillUninstallResult> {
  const command = buildUninstallSkillCommand(skillId)
  const { cwd, stdout, stderr } = await runSkillCommand(command)
  removeInstalledSkillFromCcb(skillId)
  return {
    skillId: command[3],
    command,
    cwd,
    stdout,
    stderr,
  }
}

/**
 * The settings "Installed" view: scan the global skill roots the harnesses
 * read (~/.agents, ~/.claude, ~/.cursor, ~/.codex) with per-harness
 * attribution, then annotate entries the skills-CLI lock file knows about with
 * their marketplace source — those get skills.sh links and an uninstall
 * affordance; hand-dropped skills are listed without them.
 */
export async function listGlobalSkillsWithSources(args: {
  home?: string
  lockFilePath?: string
} = {}): Promise<GlobalSkillsSnapshot> {
  const scanned = listGlobalSkills({ home: args.home })
  const lock = await listInstalledSkills(args.lockFilePath ?? getGlobalSkillLockPath())
  const sourceByName = new Map(
    lock.skills
      .filter((skill) => skill.source)
      .map((skill) => [skill.name, skill.source])
  )
  return {
    skills: scanned.map((skill) => {
      const source = sourceByName.get(skill.name)
      return source ? { ...skill, source } : skill
    }),
  }
}
