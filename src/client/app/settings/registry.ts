import { Activity, BookText, Command, FlaskConical, Gauge, MessageSquareQuote, Settings2, type LucideIcon } from "lucide-react"

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
    id: "skills",
    label: "技能",
    icon: BookText as LucideIcon,
    subtitle: "管理从技能锁文件安装的全局 Agent 技能。",
  },
  {
    id: "providers",
    label: "模型服务",
    icon: MessageSquareQuote as LucideIcon,
    subtitle: "配置 DeepSeek API Key、默认模型与快速回复模型。",
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
    subtitle: "DeepSeek 账户实时余额与用量记录。",
  },
  {
    id: "status",
    label: "服务状态",
    icon: Activity as LucideIcon,
    subtitle: "DeepSeek 官方服务状态、组件可用率与事件记录。",
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

  // Providers
  deepseekApiKey: {
    sectionId: "providers",
    title: "DeepSeek API Key",
    description: "用于连接 DeepSeek API 的密钥，保存在本机设置文件中。",
    keywords: ["api key", "密钥", "deepseek"],
  },
  visionService: {
    sectionId: "providers",
    title: "识图服务（视觉模型）",
    description: "DeepSeek V4 是文本模型，贴图时由千问/GLM 视觉模型把图片转成文字描述（describe_image MCP 工具）。",
    keywords: ["识图", "视觉", "图片", "截图", "qwen", "glm", "mcp"],
  },
  codexEngine: {
    sectionId: "providers",
    title: "Codex 引擎",
    description: "Codex agent 引擎（codex CLI）。未安装时点击一键安装，自动配置为 DeepSeek V4 官方 API。",
    keywords: ["codex", "引擎", "安装", "agent"],
  },
  defaultProvider: {
    sectionId: "providers",
    title: "默认服务商",
    description: "新建对话使用的默认模型服务商（Aiang 仅支持 DeepSeek）。",
    keywords: ["服务商", "引擎"],
  },
  deepseekDefaults: {
    sectionId: "providers",
    title: "DeepSeek 默认设置",
    description: "使用 DeepSeek 时的默认模型设置。",
    keywords: ["模型", "deepseek"],
  },
  modelRegistry: {
    sectionId: "providers",
    title: "快速回复模型",
    description: "对话命名、提交信息生成等快速回复使用的模型端点与 API Key。",
    keywords: ["api key", "base url", "llm provider", "模型端点"],
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
