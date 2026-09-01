import { engineSupportsCollaboration } from "../../../shared/collaboration"
import type { AgentProvider } from "../../../shared/types"
import { cn } from "../../lib/utils"

export function collaborationCoachCopy(args: {
  provider: AgentProvider
  enabled: boolean
}): { action: string; hint: string; canToggle: boolean } {
  if (!engineSupportsCollaboration(args.provider)) {
    return {
      action: "协作验收不可用",
      hint: "Cursor 只走原版，不会自动验收。",
      canToggle: false,
    }
  }
  if (args.enabled) {
    return {
      action: "协作验收 · 开",
      hint: "先改代码，改完同一引擎自动对照任务验收。不过就点「按意见再改」。",
      canToggle: true,
    }
  }
  return {
    action: "协作验收 · 关",
    hint: "打开后：同一引擎先动手，再自动验收。不换引擎，也不双跑。",
    canToggle: true,
  }
}

export function CollaborationCoach({
  provider,
  enabled,
  onChange,
}: {
  provider: AgentProvider
  enabled: boolean
  onChange: (enabled: boolean) => void
}) {
  const { action, hint, canToggle } = collaborationCoachCopy({ provider, enabled })
  return (
    <div className="flex max-w-[840px] flex-col items-center justify-center gap-0.5 px-4 pt-1 text-center sm:flex-row sm:gap-2 sm:text-left">
      <button
        type="button"
        disabled={!canToggle}
        onClick={() => onChange(!enabled)}
        className={cn(
          "shrink-0 text-[12px] font-medium transition-colors",
          !canToggle && "cursor-default text-muted-foreground/70",
          canToggle && enabled && "text-violet-500 dark:text-violet-400",
          canToggle && !enabled && "text-muted-foreground hover:text-foreground",
        )}
      >
        {action}
      </button>
      <p className="min-w-0 text-[12px] leading-5 text-muted-foreground/80">
        {hint}
      </p>
    </div>
  )
}
