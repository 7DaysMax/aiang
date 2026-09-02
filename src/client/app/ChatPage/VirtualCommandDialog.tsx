import { Coins, Gauge, Percent, Sigma } from "lucide-react"
import type { ReactNode } from "react"
import type { DeepSeekBalanceSnapshot } from "../../../shared/types"
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../../components/ui/dialog"
import type { ChatDockMetrics } from "../../lib/contextWindow"
import { formatContextWindowTokens } from "../../lib/contextWindow"
import { VIRTUAL_COMMANDS } from "../../lib/virtualCommands"
import SearchList from "@/components/primitives/SearchList"
import { insertComposerText } from "../../lib/composerInsert"

export type VirtualCommandDialogMode = "commands" | "usage"

function formatRate(value: number | null): string | null {
  if (value === null || !Number.isFinite(value)) return null
  return `${Math.round(value)}%`
}

function UsageRow({ icon, label, value, hint }: { icon: ReactNode; label: string; value: string; hint: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-border px-3 py-2">
      <div className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
        <span className="[&>svg]:h-3.5 [&>svg]:w-3.5 shrink-0 opacity-70">{icon}</span>
        <span className="shrink-0">{label}</span>
        <span className="hidden truncate text-xs text-muted-foreground/70 sm:inline" title={hint}>{hint}</span>
      </div>
      <span className="shrink-0 text-sm font-medium tabular-nums">{value}</span>
    </div>
  )
}

export function VirtualCommandDialog({
  open,
  onOpenChange,
  mode,
  metrics,
  balance,
  balanceFailed,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: VirtualCommandDialogMode
  metrics: ChatDockMetrics
  balance: DeepSeekBalanceSnapshot | null
  balanceFailed: boolean
}) {
  const isUsage = mode === "usage"
  const balanceLabel = balance?.available
    ? `${balance.currency === "CNY" ? "¥" : balance.currency ? `${balance.currency} ` : ""}${balance.totalBalance ?? "—"}`
    : "—"
  const currentRate = formatRate(metrics.currentCacheHitRate)
  const averageRate = formatRate(metrics.averageCacheHitRate)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isUsage ? "用量与状态" : "命令帮助"}</DialogTitle>
          <DialogDescription>
            {isUsage
              ? "DeepSeek 账户余额与会话消耗（与底部栏数据同源）"
              : "这些命令由 ccb 的无头模式过滤，由前端直接桥接到对应功能"}
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-2">
          {isUsage ? (
            <>
              <UsageRow
                icon={<Coins />}
                label="DP 余额"
                value={balanceLabel}
                hint={balanceFailed ? "余额拉取失败" : "DeepSeek 账户实时余额"}
              />
              <UsageRow
                icon={<Gauge />}
                label="本次命中"
                value={currentRate ?? "—"}
                hint="当前回合缓存命中率（缓存读取 tokens / 输入 tokens）"
              />
              <UsageRow
                icon={<Percent />}
                label="平均命中"
                value={averageRate ?? "—"}
                hint="会话内平均缓存命中率"
              />
              <UsageRow
                icon={<Sigma />}
                label="会话 tokens"
                value={formatContextWindowTokens(metrics.sessionTokens)}
                hint="会话累计消耗 tokens（非缓存输入 + 输出）"
              />
            </>
          ) : (
            <SearchList
              className="min-h-0 max-w-none"
              items={VIRTUAL_COMMANDS.map((command) => ({ id: command.name, label: `/${command.name}`, description: command.description }))}
              labels={{ placeholder: "搜索命令…", ariaLabel: "搜索命令", emptyTitle: "没有匹配命令", emptyHint: "换个关键词试试" }}
              onSelect={(item) => {
                if (typeof item === "string") return
                insertComposerText(`${item.label} `, { replace: true })
                onOpenChange(false)
              }}
            />
          )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  )
}
