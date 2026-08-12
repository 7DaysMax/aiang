export function toTitleCase(value: string): string {
  return value
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ")
}

const SHELL_WRAPPER_PATTERNS = [
  /^(?:\/usr\/bin\/env\s+)?(?:\/bin\/)?(?:bash|zsh|sh)\s+(?:-[a-zA-Z]*c|-c)\s+(['"])([\s\S]*)\1$/,
  /^(?:\/usr\/bin\/env\s+)?(?:\/bin\/)?(?:bash|zsh|sh)\s+(?:-[a-zA-Z]*c|-c)\s+(.+)$/,
  /^(?:\/usr\/bin\/env\s+)?(?:cmd(?:\.exe)?)\s+\/c\s+(['"])([\s\S]*)\1$/i,
  /^(?:\/usr\/bin\/env\s+)?(?:cmd(?:\.exe)?)\s+\/c\s+(.+)$/i,
  /^(?:\/usr\/bin\/env\s+)?(?:powershell(?:\.exe)?|pwsh)\s+(?:-NoProfile\s+)?-Command\s+(['"])([\s\S]*)\1$/i,
  /^(?:\/usr\/bin\/env\s+)?(?:powershell(?:\.exe)?|pwsh)\s+(?:-NoProfile\s+)?-Command\s+(.+)$/i,
] as const

export function formatBashCommandTitle(command: string): string {
  const trimmed = command.trim()
  for (const pattern of SHELL_WRAPPER_PATTERNS) {
    const match = trimmed.match(pattern)
    if (!match) continue
    const candidate = (match[2] ?? match[1] ?? "").trim()
    if (candidate) {
      return candidate
    }
  }
  return trimmed
}

/** 工具活动的耗时展示：<1s 显示毫秒，之后显示秒（保留一位小数，≥10s 取整）。 */
export function formatActivityDuration(durationMs: number): string {
  if (!Number.isFinite(durationMs) || durationMs < 0) return ""
  if (durationMs < 1000) return `${Math.round(durationMs)}ms`
  const seconds = durationMs / 1000
  if (Number.isInteger(seconds)) return `${seconds}s`
  return seconds >= 10 ? `${Math.round(seconds)}s` : `${seconds.toFixed(1)}s`
}

export function getPathBasename(fullPath: string): string {
  return fullPath.split("/").pop() || fullPath
}

export function formatModelLabel(modelId: string): string {
  const shortModelName = modelId.split("/")[1]?.split(":")[0] ?? modelId
  return toTitleCase(shortModelName).replace(/^Claude\s+/i, "")
}

const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS
const WEEK_MS = 7 * DAY_MS
const MONTH_MS = 30 * DAY_MS
const YEAR_MS = 365 * DAY_MS

export const SIDEBAR_RECENT_WINDOW_MS = DAY_MS

interface RelativeAgeStyle {
  nowLabel: string
  suffix: string
  round: (value: number) => number
  units: Array<{ ms: number; label: string }>
}

function formatRelativeAge(deltaMs: number, style: RelativeAgeStyle): string {
  const { units } = style
  for (let index = units.length - 1; index >= 0; index -= 1) {
    const unit = units[index]
    if (deltaMs >= unit.ms) {
      return `${style.round(deltaMs / unit.ms)}${unit.label}${style.suffix}`
    }
  }
  return style.nowLabel
}

const SIDEBAR_AGE_STYLE: RelativeAgeStyle = {
  nowLabel: "刚刚",
  suffix: "",
  round: Math.floor,
  units: [
    { ms: MINUTE_MS, label: "分钟" },
    { ms: HOUR_MS, label: "小时" },
    { ms: DAY_MS, label: "天" },
    { ms: WEEK_MS, label: "周" },
  ],
}

const TIMESTAMP_AGE_STYLE: RelativeAgeStyle = {
  nowLabel: "刚刚",
  suffix: "前",
  round: Math.round,
  units: [
    { ms: MINUTE_MS, label: "分钟" },
    { ms: HOUR_MS, label: "小时" },
    { ms: DAY_MS, label: "天" },
    { ms: WEEK_MS, label: "周" },
    { ms: MONTH_MS, label: "个月" },
    { ms: YEAR_MS, label: "年" },
  ],
}

export function formatSidebarAgeLabel(lastMessageAt: number | undefined, nowMs: number): string | null {
  if (lastMessageAt === undefined) return null
  return formatRelativeAge(Math.max(0, nowMs - lastMessageAt), SIDEBAR_AGE_STYLE)
}

export function formatRelativeTime(isoTimestamp: string): string {
  const timestamp = Date.parse(isoTimestamp)
  if (!Number.isFinite(timestamp)) {
    return ""
  }
  return formatRelativeAge(Date.now() - timestamp, TIMESTAMP_AGE_STYLE)
}
