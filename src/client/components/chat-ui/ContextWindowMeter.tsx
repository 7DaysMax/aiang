import { cn } from "../../lib/utils"
import { type ContextWindowSnapshot, formatContextWindowTokens } from "../../lib/contextWindow"
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip"
import ContextCards from "@/components/primitives/ContextCards"

function formatPercentage(value: number | null): string | null {
  if (value === null || !Number.isFinite(value)) {
    return null
  }
  if (value < 10) {
    return `${value.toFixed(1).replace(/\.0$/, "")}%`
  }
  return `${Math.round(value)}%`
}

export function ContextWindowMeter({ usage }: { usage: ContextWindowSnapshot }) {
  const usedPercentage = formatPercentage(usage.usedPercentage)
  const normalizedPercentage = Math.max(0, Math.min(100, usage.usedPercentage ?? 0))
  const radius = 9.75
  const circumference = 2 * Math.PI * radius
  const dashOffset = circumference - (normalizedPercentage / 100) * circumference

  return (
    <Tooltip delayDuration={0}>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="group inline-flex items-center justify-center rounded-full transition-opacity hover:opacity-85"
          aria-label={
            usage.maxTokens !== undefined && usedPercentage
              ? `Context window ${usedPercentage} used`
              : `Context window ${formatContextWindowTokens(usage.usedTokens)} tokens used`
          }
        >
          <span className="relative flex h-6 w-6 items-center justify-center">
            <svg
              viewBox="0 0 24 24"
              className="-rotate-90 absolute inset-0 h-full w-full transform-gpu"
              aria-hidden="true"
            >
              <circle
                cx="12"
                cy="12"
                r={radius}
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="text-muted-foreground/20"
              />
              <circle
                cx="12"
                cy="12"
                r={radius}
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={dashOffset}
                className="text-muted-foreground transition-[stroke-dashoffset] duration-500 ease-out"
              />
            </svg>
            <span
              className={cn(
                "relative flex h-[15px] w-[15px] items-center justify-center rounded-full bg-background text-[9px] font-medium",
                "text-muted-foreground",
              )}
            >
              {usage.usedPercentage !== null
                ? Math.round(usage.usedPercentage)
                : formatContextWindowTokens(usage.usedTokens)}
            </span>
          </span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" align="center" className="w-[min(24rem,calc(100vw-1rem))] max-w-none px-3 py-2">
        <div className="space-y-1.5 leading-tight">
          {usage.maxTokens !== undefined && usedPercentage ? (
            <div className="whitespace-nowrap text-xs font-medium text-foreground">
              <span>{usedPercentage}</span>
              <span className="mx-1">·</span>
              <span>{formatContextWindowTokens(usage.usedTokens)}</span>
              <span>/</span>
              <span>{formatContextWindowTokens(usage.maxTokens)} context used</span>
            </div>
          ) : (
            <div className="text-sm text-foreground">
              {formatContextWindowTokens(usage.usedTokens)} tokens used so far
            </div>
          )}
          <ContextCards
            className="mt-2 max-w-none"
            labels={{ header: "当前上下文", count: formatContextWindowTokens(usage.usedTokens) }}
            chunks={[{
              title: "会话上下文窗口",
              chars: usedPercentage ?? `${formatContextWindowTokens(usage.usedTokens)} tokens`,
              body: usage.maxTokens !== undefined
                ? `已使用 ${formatContextWindowTokens(usage.usedTokens)} / ${formatContextWindowTokens(usage.maxTokens)} tokens。继续对话会实时更新。`
                : `本会话已使用 ${formatContextWindowTokens(usage.usedTokens)} tokens。`,
              source: "当前会话",
              badge: "CTX",
              tone: "bg-accent",
            }]}
          />
        </div>
      </TooltipContent>
    </Tooltip>
  )
}
