import { Activity, BookText, Command, FlaskConical, Gauge, MessageSquareQuote, Palette, Puzzle, Settings2, type LucideIcon } from "lucide-react"

/**
 * Single source of truth for settings navigation targets.
 *
 * Every settings row is declared here and referenced by the section components
 * (`<SettingsRow def={SETTINGS_ROWS.theme}>`), so the command palette derives
 * its "Settings" entries automatically: add a def + use it in JSX and the row
 * is searchable and jumpable (`/settings/:sectionId#rowId`) with no palette
 * changes.
 */

export const SETTINGS_SECTIONS = [
  {
    id: "general",
    label: "通用",
    icon: Settings2 as LucideIcon,
    subtitle: "管理外观、编辑器行为和内置终端默认设置。",
  },
  {
    id: "appearance",
    label: "界面样式",
    icon: Palette as LucideIcon,
    subtitle: "切换 Beautiful UI 官网组件的完整样式模式，聊天界面会立即同步。",
  },
  {
    id: "skills",
    label: "技能",
    icon: BookText as LucideIcon,
    subtitle: "管理从技能锁文件安装的全局 Agent 技能。",
  },
  {
    id: "plugins",
    label: "插件",
    icon: Puzzle as LucideIcon,
    subtitle: "强力 MCP、官方目录、GitHub mcp-server 与 DSH 社区，挂到 Youmi 引擎。",
  },
  {
    id: "providers",
    label: "模型服务",
    icon: MessageSquareQuote as LucideIcon,
    subtitle: "按服务商保存多套配置，点选即可切换。Claude / Codex / Youmi / ccb / Reasonix 共用当前档案；Cursor 只走原版登录。",
  },
  {
    id: "keybindings",
    label: "快捷键",
    icon: Command as LucideIcon,
    subtitle: "编辑保存在快捷键文件中的全局应用快捷键。",
  },
  {
    id: "usage",
    label: "用量",
    icon: Gauge as LucideIcon,
    subtitle: "查看各模型服务的账户余额、订阅限额与可用状态。",
  },
  {
    id: "status",
    label: "服务状态",
    icon: Activity as LucideIcon,
    subtitle: "查看各引擎的官方服务状态、本机接入状态与当前故障。",
  },
  {
    id: "labs",
    label: "实验",
    icon: FlaskConical as LucideIcon,
    subtitle: "仍在开发中的实验性功能。",
  },
  // always last
  {
    id: "changelog",
    label: "更新日志",
    icon: BookText as LucideIcon,
    subtitle: "从 GitHub Releases 拉取的版本说明。",
  },
] as const

export type SettingsSection = (typeof SETTINGS_SECTIONS)[number]
export type SettingsSectionId = SettingsSection["id"]

export interface SettingsRowDef {
  /** Stable anchor id; the palette navigates to `/settings/:sectionId#id`. */
  id: string
  sectionId: SettingsSectionId
  title: string
  /** Plain-text description used for palette search + display. Sections may render richer JSX in place of it. */
  description: string
  /** Extra search terms that don't appear in the title/description. */
  keywords?: string[]
}

function defineRows<TIds extends string>(
  rows: { [TId in TIds]: Omit<SettingsRowDef, "id"> }
): { [TId in TIds]: SettingsRowDef } {
  return Object.fromEntries(
    Object.entries<Omit<SettingsRowDef, "id">>(rows).map(([id, row]) => [id, { ...row, id }])
  ) as { [TId in TIds]: SettingsRowDef }
}

export const SETTINGS_ROWS = defineRows({
  // General
  applicationUpdate: {
    sectionId: "general",
    title: "应用更新",
    description: "当前版本与更新状态。",
    keywords: ["version", "升级", "最新"],
  },
  theme: {
    sectionId: "general",
    title: "主题",
    description: "选择浅色、深色或跟随系统外观",
    keywords: ["外观", "深色", "浅色"],
  },
  chatSounds: {
    sectionId: "general",
    title: "聊天提示音",
    description: "当对话开始等待你或未读数增加时播放提示音",
    keywords: ["通知", "声音", "静音"],
  },
  chatSound: {
    sectionId: "general",
    title: "提示音",
    description: "聊天通知播放和预览使用的内置音效",
    keywords: ["通知", "声音"],
  },
  defaultEditor: {
    sectionId: "general",
    title: "默认编辑器",
    description: "打开 transcript 链接或 git diff 菜单中的文件时使用",
    keywords: ["cursor", "xcode", "windsurf", "vscode", "命令模板"],
  },
  newProjectsDirectory: {
    sectionId: "general",
    title: "新项目目录",
    description: "克隆和新建项目存放的位置",
    keywords: ["克隆", "新建", "文件夹", "路径", "添加项目"],
  },
  dockMetrics: {
    sectionId: "general",
    title: "底部栏指标",
    description: "选择输入框下方状态条显示哪些指标：DP 余额、缓存命中率与会话 tokens",
    keywords: ["底部栏", "状态条", "余额", "缓存命中", "tokens", "指标"],
  },
  terminalScrollback: {
    sectionId: "general",
    title: "终端回滚行数",
    description: "内置终端保留的历史行数",
  },
  terminalMinColumnWidth: {
    sectionId: "general",
    title: "终端最小列宽",
    description: "每个终端面板的最小宽度",
  },
  anonymousAnalytics: {
    sectionId: "general",
    title: "匿名分析",
    description: "通过匿名产品分析帮助改进 Aiang。",
    keywords: ["遥测", "隐私", "统计"],
  },

  // Appearance
  loadingStyle: {
    sectionId: "appearance",
    title: "加载状态",
    description: "选择长任务运行时的像素加载动画。",
    keywords: ["beautiful ui", "loading", "Drive", "Dots", "Orbit", "Surfer"],
  },
  thinkingStyle: {
    sectionId: "appearance",
    title: "思考过程",
    description: "选择代理推理轨迹的呈现方式。",
    keywords: ["beautiful ui", "thinking", "Steps", "Reasoning", "Search", "Coding"],
  },
  taskRowsStyle: {
    sectionId: "appearance",
    title: "任务列表",
    description: "选择任务步骤使用独立胶囊或紧凑列表。",
    keywords: ["beautiful ui", "tasks", "Capsules", "List"],
  },
  promptBarStyle: {
    sectionId: "appearance",
    title: "输入栏",
    description: "选择聊天输入区域的轮廓样式。",
    keywords: ["beautiful ui", "prompt", "Rounded", "Pill"],
  },
  codeBlockStyle: {
    sectionId: "appearance",
    title: "代码块",
    description: "选择代码内容默认使用代码视图或差异视图。",
    keywords: ["beautiful ui", "code", "diff"],
  },

  // Providers
  modelProfiles: {
    sectionId: "providers",
    title: "模型档案",
    description: "按 DeepSeek、OpenRouter、Anthropic 等服务商保存多套配置，点一下就能切换。Claude、Codex、Youmi、ccb、Reasonix 共用当前选用的档案。",
    keywords: ["档案", "中转", "openai", "anthropic", "deepseek", "openrouter", "千问", "glm", "moonshot", "模型"],
  },
  deepseekApiKey: {
    sectionId: "providers",
    title: "DeepSeek API Key",
    description: "旧版回退：没有档案时，Youmi / ccb 仍可读这个 Key。",
    keywords: ["api key", "密钥", "deepseek", "回退"],
  },
  visionService: {
    sectionId: "providers",
    title: "识图服务（视觉模型）",
    description: "Youmi 当前的图片附件统一由千问/GLM 视觉服务转成文字描述（describe_image MCP 工具）。",
    keywords: ["识图", "视觉", "图片", "截图", "qwen", "glm", "mcp"],
  },
  claudeEngine: {
    sectionId: "providers",
    title: "Claude 引擎",
    description: "原版 Claude Code CLI。有新版本时不会自动升级，由你选择是否更新。",
    keywords: ["claude", "引擎", "安装", "升级", "版本"],
  },
  codexEngine: {
    sectionId: "providers",
    title: "Codex 引擎",
    description: "安装官方 Codex CLI。有新版本时不会自动升级，由你选择是否更新。当前模型档案会写入 ~/.codex。",
    keywords: ["codex", "引擎", "安装", "升级", "版本", "agent"],
  },
  cursorEngine: {
    sectionId: "providers",
    title: "Cursor 引擎",
    description: "通过本机 cursor-agent 控制 Cursor。有新版本时不会自动升级，由你选择是否更新。",
    keywords: ["cursor", "cursor-agent", "引擎", "安装", "升级", "版本", "登录", "kanna"],
  },
  defaultProvider: {
    sectionId: "providers",
    title: "默认引擎",
    description: "新建对话的默认引擎。原生：Claude / Cursor / Codex；第三方：Youmi / ccb / Reasonix / Pi。",
    keywords: ["服务商", "引擎", "youmi", "cursor", "原生", "第三方"],
  },
  youmiDefaults: {
    sectionId: "providers",
    title: "Youmi 默认设置",
    description: "Youmi 引擎（PenguinHarness）的默认模型与思考档位；Glob/Grep 等能力由插件提供。",
    keywords: ["模型", "youmi", "penguin", "插件"],
  },
  deepseekDefaults: {
    sectionId: "providers",
    title: "DeepSeek 默认设置",
    description: "使用 DeepSeek 时的默认模型设置。",
    keywords: ["模型", "deepseek"],
  },
  cursorDefaults: {
    sectionId: "providers",
    title: "Cursor 默认设置",
    description: "使用 Cursor 引擎（cursor-agent）时的默认模型与快速模式。",
    keywords: ["模型", "cursor", "composer", "fast"],
  },
  modelRegistry: {
    sectionId: "providers",
    title: "快速回复模型",
    description: "对话命名、提交信息生成等快速回复使用的模型端点与 API Key。",
    keywords: ["api key", "base url", "llm provider", "模型端点"],
  },

  youmiPlugins: {
    sectionId: "plugins",
    title: "Youmi 插件",
    description: "强力 MCP、官方 MCP 目录、GitHub mcp-server 与 DSH 社区。引擎仍是 Youmi。",
    keywords: ["plugin", "插件", "mcp", "playwright", "github", "glob", "grep", "marketplace", "harness", "dsh", "社区"],
  },

  // Labs
  recentChatsInSidebar: {
    sectionId: "labs",
    title: "新侧边栏",
    description: "用带标签的「对话 / 项目」视图替代侧边栏——进行中、评审、最近置顶，项目一键可达。",
    keywords: ["侧边栏", "最近", "对话", "项目", "实验"],
  },
  terminalWebglRenderer: {
    sectionId: "labs",
    title: "终端 GPU 渲染",
    description: "用 xterm 的 WebGL 渲染器替代 DOM 渲染器绘制内置终端。大量输出时更快；GPU 上下文不可用时会回退到 DOM 渲染器。",
    keywords: ["终端", "webgl", "gpu", "渲染", "性能", "实验"],
  },
  sessionMemory: {
    sectionId: "labs",
    title: "会话记忆（实验）",
    description: "开启后 agent 会参考本机最近的历史对话作为背景，减少重复交代。默认关闭；对话内容只在本机处理。",
    keywords: ["记忆", "memory", "历史", "上下文", "实验"],
  },
  nightlyBuilds: {
    sectionId: "labs",
    title: "每日构建",
    description: "运行 main 分支的最新改动——从 GitHub 下载并在本机从源码构建。",
    keywords: ["nightly", "main", "更新", "稳定版", "预览版", "构建"],
  },
})

export function listAllSettingsRowDefs(): SettingsRowDef[] {
  return Object.values<SettingsRowDef>(SETTINGS_ROWS)
}
