import { memo, useEffect, useState } from "react"
import { BarChart3, Bot, Cloud, Cpu, FolderTree, Image, Rocket, ShieldCheck, Wrench, X, type LucideIcon } from "lucide-react"
import { Button } from "./ui/button"
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog"

/** Youmi V1 测试版发布时间（东八区）：2026-08-13 12:00。 */
export const RELEASE_AT_MS = new Date("2026-08-13T12:00:00+08:00").getTime()
/** 发布后横幅继续展示的天数，到期自动消失。 */
const RELEASE_BANNER_LIFETIME_MS = 3 * 24 * 60 * 60 * 1000
const DISMISS_STORAGE_KEY = "youmi-release-banner-dismissed-day"

const FEATURES: Array<{ icon: LucideIcon; title: string; description: string }> = [
  {
    icon: Cpu,
    title: "原生 DeepSeek V4",
    description: "1M 超长上下文，思考模式可选，缓存命中、余额、费用实时可见。",
  },
  {
    icon: Bot,
    title: "多 Agent 引擎",
    description: "Claude Code（原版 / 魔改）、Codex、Reasonix 一键切换，工具调用过程全程可视化。",
  },
  {
    icon: Image,
    title: "MCP 识图",
    description: "DeepSeek 是文本模型，贴图时自动调用千问 / GLM 视觉模型（可免费）把图片转成文字描述。",
  },
  {
    icon: BarChart3,
    title: "会话分析",
    description: "上下文窗口、缓存命中率、tokens、费用、运行时间，用量可按来源 / 类型统计。",
  },
  {
    icon: FolderTree,
    title: "文件与改动",
    description: "内置文件树（语法高亮、可直接编辑），改动审查（+/- 行），一键撤销，不依赖 git。",
  },
  {
    icon: Wrench,
    title: "技能市场",
    description: "安装 GitHub 热门编程 / 逆向技能，自动注入 agent，开箱即用。",
  },
  {
    icon: Cloud,
    title: "Youmi Cloud",
    description: "远程配对与隧道，随时连接你的电脑。",
  },
  {
    icon: ShieldCheck,
    title: "本地优先",
    description: "对话与用量日志全部保存在本地，可自由关闭匿名分析。",
  },
]

function buildCountdownLabel(remainingMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(remainingMs / 1000))
  const days = Math.floor(totalSeconds / 86400)
  const hours = Math.floor((totalSeconds % 86400) / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  if (days > 0) return `还有 ${days} 天 ${hours} 小时`
  if (hours > 0) return `还有 ${hours} 小时 ${minutes} 分`
  return `还有 ${minutes} 分 ${String(seconds).padStart(2, "0")} 秒`
}

function readDismissedDay(): string | null {
  if (typeof window === "undefined") return null
  try {
    return window.localStorage.getItem(DISMISS_STORAGE_KEY)
  } catch {
    return null
  }
}

function writeDismissedDay(value: string) {
  try {
    window.localStorage.setItem(DISMISS_STORAGE_KEY, value)
  } catch {
    // 存储不可用时静默忽略，横幅照常展示。
  }
}

/**
 * 顶部全宽公告横条：Youmi V1 测试版发布倒计时。
 * 发布前实时倒计时；发布后展示“已发布”；可关闭（发布前当天不再显示，发布后永久隐藏）；
 * 发布 3 天后自动消失。“查看详情”弹出 Youmi 功能介绍。
 */
export const ReleaseBanner = memo(function ReleaseBanner() {
  const [now, setNow] = useState(() => Date.now())
  const [dismissedDay, setDismissedDay] = useState<string | null>(readDismissedDay)
  const [detailsOpen, setDetailsOpen] = useState(false)

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  const remaining = RELEASE_AT_MS - now
  const released = remaining <= 0
  const todayKey = new Date(now).toISOString().slice(0, 10)
  if (now >= RELEASE_AT_MS + RELEASE_BANNER_LIFETIME_MS) return null
  if (dismissedDay === todayKey || (released && dismissedDay === "released")) return null

  const handleDismiss = () => {
    const value = released ? "released" : todayKey
    writeDismissedDay(value)
    setDismissedDay(value)
  }

  return (
    <>
      <div className="relative z-40 flex h-9 shrink-0 items-center justify-center gap-2 border-b border-border bg-gradient-to-r from-logo/15 via-background to-logo/15 px-16">
        <Rocket className="size-4 shrink-0 text-logo" />
        <p className="min-w-0 truncate text-xs font-medium text-foreground">
          <span className="font-semibold">Youmi V1 测试版</span>
          {released ? (
            <span className="text-muted-foreground"> 已于 8月13日 12:00 正式发布 🎉</span>
          ) : (
            <span className="text-muted-foreground"> 将于 8月13日 12:00 发布 · {buildCountdownLabel(remaining)}</span>
          )}
        </p>
        <Button
          type="button"
          variant="link"
          size="sm"
          className="h-auto shrink-0 p-0 text-xs text-primary underline-offset-4 hover:underline"
          onClick={() => setDetailsOpen(true)}
        >
          查看详情
        </Button>
        <button
          type="button"
          onClick={handleDismiss}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground/70 transition-colors hover:bg-muted hover:text-foreground"
          title="关闭公告"
        >
          <X className="size-3.5" />
        </button>
      </div>
      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>关于 Youmi</DialogTitle>
            <DialogDescription>
              Youmi（原 Aiang）是一款原生支持 DeepSeek 的 AI 编程助手桌面应用。
              它把 Claude Code / Codex 的 agent 能力装进现代中文界面，直接在本地项目里写代码、改文件、跑命令。
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="grid gap-2.5 sm:grid-cols-2">
            {FEATURES.map((feature) => (
              <div key={feature.title} className="flex gap-2.5 rounded-lg border border-border/60 bg-muted/40 p-2.5">
                <feature.icon className="mt-0.5 size-4 shrink-0 text-logo" />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-foreground">{feature.title}</p>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{feature.description}</p>
                </div>
              </div>
            ))}
          </DialogBody>
          <div className="border-t border-border px-5 py-3 text-center text-xs text-muted-foreground">
            V1 测试版将于 8月13日 12:00 发布，敬请期待 🎉
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
})
