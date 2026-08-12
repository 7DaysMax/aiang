import { UserRound, X } from "lucide-react"
import type { ProcessedToolCall } from "./types"
import { MetaRow, MetaLabel, ExpandableRow, getToolIcon } from "./shared"
import { useMemo } from "react"
import { stripWorkspacePath } from "../../lib/pathUtils"
import { AnimatedShinyText } from "../ui/animated-shiny-text"
import { formatActivityDuration, formatBashCommandTitle, toTitleCase } from "../../lib/formatters"
import { ToolCallExpandedContent } from "./ToolCallExpandedContent"
import { useToolPayloadPrefetch } from "./tool-payload-context"

interface Props {
  message: ProcessedToolCall
  isLoading?: boolean
  localPath?: string | null
}

export function ToolCallMessage({ message, isLoading = false, localPath }: Props) {
  // Presence is the *existence* of a result entry, not its payload: a result
  // may arrive with its body left on the server, to be fetched only if the row
  // is opened.
  const hasResult = message.resultEntryId !== undefined
  // 活动流状态：工具刚开始跑（还没有 result 条目）时显示「正在…」，
  // 拿到 result 后显示「已…」并附上本次耗时；被中断且没有 result 的行
  // 退回中性文案，避免出现虚假的「已…」。
  const activityState: "pending" | "done" | "neutral" = !hasResult ? (isLoading ? "pending" : "neutral") : "done"
  const isPending = activityState === "pending"
  const durationMs = useMemo(() => {
    if (!hasResult || !message.resultTimestamp) return null
    const start = Date.parse(message.timestamp)
    const end = Date.parse(message.resultTimestamp)
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null
    return end - start
  }, [hasResult, message.resultTimestamp, message.timestamp])

  const label = useMemo(() => {
    const prefix = activityState === "pending" ? "正在" : activityState === "done" ? "已" : ""
    let text: string

    if (message.toolKind === "skill") {
      text = message.input.skill ? `${prefix}读取技能 – ${message.input.skill}` : `${prefix}读取技能`
    } else if (message.toolKind === "glob") {
      const scope = message.input.pattern === "**/*" ? "（所有目录）" : `（匹配 ${message.input.pattern}）`
      text = `${prefix}搜索文件${scope}`
    } else if (message.toolKind === "grep") {
      const pattern = message.input.pattern
      const outputMode = message.input.outputMode
      if (outputMode === "count") {
        text = `${prefix}统计 \`${pattern}\` 出现次数`
      } else if (activityState === "pending") {
        text = `正在搜索 \`${pattern}\``
      } else if (outputMode === "content") {
        text = `${prefix}在文本中查找 \`${pattern}\``
      } else {
        text = `${prefix}在文件中查找 \`${pattern}\``
      }
    } else if (message.toolKind === "bash") {
      const command = message.input.description || (message.input.command ? formatBashCommandTitle(message.input.command) : "Bash")
      if (activityState === "pending") {
        text = `正在运行 ${command}`
      } else if (activityState === "done" && durationMs !== null) {
        text = `已在 ${formatActivityDuration(durationMs)} 内运行 ${command}`
      } else if (activityState === "done") {
        text = `已运行 ${command}`
      } else {
        text = command
      }
    } else if (message.toolKind === "web_search") {
      text = `${prefix}搜索 ${message.input.query || "网页"}`
    } else if (message.toolKind === "read_file") {
      text = `${prefix}读取 ${stripWorkspacePath(message.input.filePath, localPath)}`
    } else if (message.toolKind === "write_file") {
      text = `${prefix}写入 ${stripWorkspacePath(message.input.filePath, localPath)}`
    } else if (message.toolKind === "edit_file") {
      text = `${prefix}编辑 ${stripWorkspacePath(message.input.filePath, localPath)}`
    } else if (message.toolKind === "delete_file") {
      text = `${prefix}删除 ${stripWorkspacePath(message.input.filePath, localPath)}`
    } else if (message.toolKind === "mcp_generic") {
      text = `${prefix}调用 ${toTitleCase(message.input.tool)}（来自 ${toTitleCase(message.input.server)}）`
    } else if (message.toolKind === "subagent_task") {
      const agent = message.input.subagentType || message.toolName
      text = `${prefix}运行 ${agent}`
    } else if (message.toolKind === "web_fetch") {
      const url = message.input.url || "网页"
      text = `${prefix}抓取 ${url}`
    } else if (message.toolKind === "task_output") {
      text = `${prefix}查看子任务输出（${message.input.taskId}）`
    } else if (message.toolKind === "task_stop") {
      text = `${prefix}停止子任务（${message.input.taskId}）`
    } else if (message.toolKind === "notify") {
      text = `${prefix}发送通知`
    } else if (message.toolKind === "cron_create") {
      text = `${prefix}创建定时任务 \`${message.input.cron}\``
    } else if (message.toolKind === "cron_delete") {
      text = `${prefix}删除定时任务（${message.input.cronId}）`
    } else if (message.toolKind === "cron_list") {
      text = `${prefix}列出定时任务`
    } else if (message.toolKind === "kill_shell") {
      text = `${prefix}终止 Shell 进程`
    } else if (message.toolKind === "enter_plan_mode") {
      text = `${prefix}进入计划模式`
    } else if (message.toolKind === "notebook_edit") {
      text = `${prefix}编辑笔记本 ${message.input.notebookPath ? stripWorkspacePath(message.input.notebookPath, localPath) : ""}`.trim()
    } else {
      text = message.toolName
    }

    // 非 bash 工具在完成且耗时 ≥1s 时补一个轻量耗时后缀。
    if (activityState === "done" && durationMs !== null && durationMs >= 1000 && message.toolKind !== "bash") {
      text += `（${formatActivityDuration(durationMs)}）`
    }
    return text
  }, [activityState, durationMs, message, localPath])

  const isAgent = message.toolKind === "subagent_task"

  // Warm the payload on hover so the body is usually already there by the time
  // the row is clicked. Pointer-only by nature; touch falls through to the
  // fetch the expanded view issues on mount.
  const prefetchPayloads = useToolPayloadPrefetch()
  const prefetchOwnPayloads = () => {
    if (!message.inputTrimmed && !message.resultTrimmed) return
    prefetchPayloads([
      message.inputTrimmed ? message.id : undefined,
      message.resultTrimmed ? message.resultEntryId : undefined,
    ])
  }

  return (
    <MetaRow className="w-full" onPointerEnter={prefetchOwnPayloads}>
      {/* Creating the element is free; `ExpandableRow` only mounts it — and so
          only runs the work inside it — once the row is opened. */}
      <ExpandableRow expandedContent={<ToolCallExpandedContent message={message} />}>
        <div className="w-5 h-5 relative flex items-center justify-center">
          {(() => {
            if (message.isError) {
              return <X className="size-4 text-destructive" />
            }
            if (isAgent) {
              return <UserRound className="size-4 text-muted-icon" />
            }
            const Icon = getToolIcon(message.toolName)

            return <Icon className="size-4 text-muted-icon" />
          })()}
        </div>
        <MetaLabel className="text-left transition-opacity duration-200 truncate">
          <AnimatedShinyText
            animate={isPending}
            shimmerWidth={Math.max(20, (label?.length ?? 33) * 3)}
          >
            {label}
          </AnimatedShinyText>
        </MetaLabel>
      </ExpandableRow>
    </MetaRow>
  )
}
