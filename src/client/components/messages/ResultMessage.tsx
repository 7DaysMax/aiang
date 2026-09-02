import { AlertTriangle } from "lucide-react"
import type { ProcessedResultMessage } from "./types"
import { MetaRow, MetaLabel } from "./shared"

interface Props {
  message: ProcessedResultMessage
  /** Timestamp of the user prompt that follows this turn, when one exists. */
  nextPromptTimestamp?: string
}

const DAY_MS = 24 * 60 * 60 * 1000

export interface ParsedResultError {
  title: string
  message: string
  recovery?: string
  status?: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function errorRecovery(status: number | undefined, message: string): string | undefined {
  const normalizedMessage = message.toLowerCase()

  if (
    normalizedMessage.includes("model is not supported")
    || normalizedMessage.includes("模型") && normalizedMessage.includes("不支持")
  ) {
    return "当前模型与执行引擎不匹配。请重新选择实现引擎，或把该模型切回对应引擎后重试。"
  }
  if (status === 401 || status === 403) {
    return "请检查该引擎的登录状态、API Key 和访问权限，然后重试。"
  }
  if (status === 429) {
    return "请求过于频繁或额度暂时不足，请稍后重试或更换引擎。"
  }
  if (status !== undefined && status >= 500) {
    return "服务暂时不可用，请稍后重试；如果持续失败，可切换引擎。"
  }
  return undefined
}

export function parseResultError(result?: string): ParsedResultError {
  const fallbackMessage = "发生未知错误。"
  if (!result?.trim()) {
    return { title: "请求失败", message: fallbackMessage }
  }

  let payload: unknown
  try {
    payload = JSON.parse(result)
  } catch {
    return { title: "请求失败", message: result }
  }

  if (!isRecord(payload)) {
    return { title: "请求失败", message: result }
  }

  const status = typeof payload.status === "number" ? payload.status : undefined
  const nestedError = isRecord(payload.error) ? payload.error : undefined
  const nestedMessage = nestedError && typeof nestedError.message === "string" ? nestedError.message : undefined
  const topLevelMessage = typeof payload.message === "string" ? payload.message : undefined
  const message = nestedMessage ?? topLevelMessage ?? fallbackMessage

  return {
    title: status ? `请求失败（${status}）` : "请求失败",
    message,
    recovery: errorRecovery(status, message),
    status,
  }
}

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

export function formatPromptTimestamp(timestamp: string, now: Date = new Date()): string {
  const date = new Date(timestamp)
  const time = date.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  })

  const dayDelta = Math.round((startOfDay(now) - startOfDay(date)) / DAY_MS)

  // Today (or anything not in the past): just the time.
  if (dayDelta <= 0) return time
  if (dayDelta === 1) return `Yesterday ${time}`
  // Within the past week: weekday + time (e.g. "Mon 3:33 PM").
  if (dayDelta < 7) {
    const weekday = date.toLocaleDateString(undefined, { weekday: "short" })
    return `${weekday} ${time}`
  }
  // Older: full date + time (e.g. "Thu, Jul 16 at 1:23 PM").
  const fullDate = date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  })
  return `${fullDate} at ${time}`
}

/** Compact turn duration, e.g. "820ms", "12s", "3m 4s", "1h 20m". */
export function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`
  }

  const totalSeconds = Math.floor(ms / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  if (hours > 0) {
    return `${hours}h${minutes > 0 ? ` ${minutes}m` : ""}`
  }

  if (minutes > 0) {
    return `${minutes}m${seconds > 0 ? ` ${seconds}s` : ""}`
  }

  return `${seconds}s`
}

export function ResultMessage({ message, nextPromptTimestamp }: Props) {
  if (!message.success) {
    const error = parseResultError(message.result)
    return (
      <div className="mx-2 my-2 flex gap-2.5 rounded-lg border border-destructive/20 bg-destructive/8 px-3.5 py-3 text-sm text-destructive" role="alert">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <div className="min-w-0">
          <div className="font-medium leading-5">{error.title}</div>
          <div className="mt-0.5 break-words leading-5 text-foreground/80">{error.message}</div>
          {error.recovery ? (
            <div className="mt-1.5 break-words leading-5 text-muted-foreground">建议：{error.recovery}</div>
          ) : null}
        </div>
      </div>
    )
  }

  const label = nextPromptTimestamp
    ? formatPromptTimestamp(nextPromptTimestamp)
    : message.durationMs > 0
      ? `Worked for ${formatDuration(message.durationMs)}`
      : "Completed"

  return (
    <MetaRow className="px-0.5 text-xs tracking-wide">
      <div className="w-full h-[1px] bg-border/70"></div>
      <MetaLabel className="whitespace-nowrap text-[12px] tracking-wide text-muted-foreground/60 flex-shrink-0">{label}</MetaLabel>
      <div className="w-full h-[1px] bg-border/70"></div>
    </MetaRow>
  )
}
