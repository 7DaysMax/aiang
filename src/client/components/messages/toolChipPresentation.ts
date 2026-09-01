import type { ProcessedToolCall } from "./types"
import { formatActivityDuration, formatBashCommandTitle, toTitleCase } from "../../lib/formatters"
import type { DiffChipFile, DiffChipLine } from "../bui/DiffChips"
import type { ToolChipDetailLine } from "../bui/ToolChipRow"
import type { ToolChipIconKind } from "../bui/ToolChipIcons"

function basename(path: string | undefined): string {
  if (!path) return ""
  return path.split(/[\\/]/).pop() || path
}

function countLines(text: string | undefined): number {
  if (!text) return 0
  return text.replace(/\n$/, "").split("\n").length
}

function codePreview(text: string | undefined, limit = 2): ToolChipDetailLine[] {
  if (!text) return []
  return text
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .slice(0, limit)
    .map((line) => ({ text: `+ ${line}`, tone: "add" as const }))
}

function previewLines(text: string | undefined, tone: DiffChipLine["tone"], limit = 4): DiffChipLine[] {
  if (!text) return []
  return text
    .split("\n")
    .slice(0, limit)
    .map((line) => ({ text: line || " ", tone }))
}

function proseLines(text: string | undefined, limit = 2): ToolChipDetailLine[] {
  if (!text) return []
  return text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, limit)
    .map((line) => ({ text: line }))
}

function resultText(message: ProcessedToolCall): string {
  const result = message.result
  if (typeof result === "string") return result
  if (result && typeof result === "object" && "content" in result && typeof result.content === "string") {
    return result.content
  }
  if (typeof message.rawResult === "string") return message.rawResult
  return ""
}

function isReadImage(message: ProcessedToolCall): boolean {
  if (message.toolKind !== "read_file") return false
  const result = message.result
  if (result && typeof result === "object" && "blocks" in result && Array.isArray(result.blocks)) {
    return result.blocks.some((block) => block && typeof block === "object" && "type" in block && block.type === "image")
  }
  return false
}

function summarizePayload(payload: unknown): string | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null
  const record = payload as Record<string, unknown>
  for (const key of ["code", "script", "command", "query", "expression", "input", "text", "content", "source", "prompt", "url", "path", "file"]) {
    const value = record[key]
    if (typeof value === "string" && value.trim()) {
      const oneLine = value.trim().replace(/\s+/g, " ")
      return oneLine.length > 72 ? `${oneLine.slice(0, 69)}…` : oneLine
    }
  }
  return null
}

export type ToolChipPresentation = {
  icon: ToolChipIconKind
  label: string
  chip: string | null
  chipMono: boolean
  detail: ToolChipDetailLine[]
  detailMono: boolean
}

export function getToolChipPresentation(
  message: ProcessedToolCall,
  {
    pending,
    done,
    durationMs,
    error = false,
  }: {
    pending: boolean
    done: boolean
    durationMs: number | null
    error?: boolean
  },
): ToolChipPresentation {
  const duration = done && durationMs !== null && (message.toolKind === "bash" || durationMs >= 1000)
    ? formatActivityDuration(durationMs)
    : null
  const output = resultText(message)

  switch (message.toolKind) {
    case "bash": {
      const command = message.input.command ? formatBashCommandTitle(message.input.command) : "Bash"
      const label = message.input.description || "运行"
      const outputLines = proseLines(output)
      const detail = outputLines.length > 0
        ? outputLines.map((line, index) => (
          index === 0 && done && !error
            ? { text: line.text.startsWith("✓") ? line.text : `✓ ${line.text}` }
            : line
        ))
        : duration
          ? [{ text: `✓ ${duration}` }]
          : pending
            ? [{ text: "running…" }]
            : []
      return { icon: "run", label, chip: command, chipMono: true, detail, detailMono: true }
    }
    case "write_file": {
      const lines = countLines(message.input.content)
      return {
        icon: "write",
        label: lines > 0 ? `写入 ${lines} 行` : "写入",
        chip: basename(message.input.filePath),
        chipMono: true,
        detail: codePreview(message.input.content),
        detailMono: true,
      }
    }
    case "edit_file": {
      const add = countLines(message.input.newString)
      return {
        icon: "write",
        label: add > 0 ? `编辑 ${add} 行` : "编辑",
        chip: basename(message.input.filePath),
        chipMono: true,
        detail: codePreview(message.input.newString),
        detailMono: true,
      }
    }
    case "delete_file":
      return {
        icon: "write",
        label: "删除",
        chip: basename(message.input.filePath),
        chipMono: true,
        detail: proseLines(message.input.content),
        detailMono: true,
      }
    case "read_file": {
      const image = isReadImage(message)
      return {
        icon: "read",
        label: image ? "读取图片" : "读取",
        chip: basename(message.input.filePath),
        chipMono: true,
        detail: proseLines(output),
        detailMono: false,
      }
    }
    case "grep":
      return {
        icon: "search",
        label: "搜索",
        chip: message.input.pattern,
        chipMono: true,
        detail: proseLines(output),
        detailMono: true,
      }
    case "glob":
      return {
        icon: "search",
        label: "匹配",
        chip: message.input.pattern === "**/*" ? "所有目录" : message.input.pattern,
        chipMono: true,
        detail: proseLines(output),
        detailMono: true,
      }
    case "web_search":
      return {
        icon: "search",
        label: "搜索网页",
        chip: message.input.query || "网页",
        chipMono: false,
        detail: proseLines(output),
        detailMono: false,
      }
    case "web_fetch":
      return {
        icon: "web",
        label: "抓取",
        chip: message.input.url || "网页",
        chipMono: true,
        detail: proseLines(output),
        detailMono: false,
      }
    case "skill":
      return {
        icon: "skill",
        label: "读取技能",
        chip: message.input.skill || null,
        chipMono: true,
        detail: proseLines(output),
        detailMono: false,
      }
    case "subagent_task":
      return {
        icon: "task",
        label: "运行",
        chip: message.input.subagentType || message.toolName,
        chipMono: false,
        detail: proseLines(output),
        detailMono: false,
      }
    case "task_output":
      return {
        icon: "task",
        label: "查看子任务输出",
        chip: message.input.taskId,
        chipMono: true,
        detail: proseLines(message.input.output || output),
        detailMono: true,
      }
    case "task_stop":
      return {
        icon: "task",
        label: "停止子任务",
        chip: message.input.taskId,
        chipMono: true,
        detail: [],
        detailMono: false,
      }
    case "notify":
      return {
        icon: "generic",
        label: "发送通知",
        chip: null,
        chipMono: false,
        detail: proseLines(message.input.message),
        detailMono: false,
      }
    case "cron_create":
      return {
        icon: "clock",
        label: "创建定时任务",
        chip: message.input.cron,
        chipMono: true,
        detail: proseLines(message.input.command),
        detailMono: true,
      }
    case "cron_delete":
      return {
        icon: "clock",
        label: "删除定时任务",
        chip: message.input.cronId,
        chipMono: true,
        detail: [],
        detailMono: true,
      }
    case "cron_list":
      return { icon: "clock", label: "列出定时任务", chip: null, chipMono: true, detail: proseLines(output), detailMono: true }
    case "kill_shell":
      return { icon: "run", label: "终止 Shell", chip: null, chipMono: true, detail: [], detailMono: true }
    case "enter_plan_mode":
      return { icon: "think", label: "进入计划模式", chip: null, chipMono: false, detail: proseLines(message.input.plan), detailMono: false }
    case "notebook_edit":
      return {
        icon: "write",
        label: "编辑笔记本",
        chip: basename(message.input.notebookPath),
        chipMono: true,
        detail: codePreview(message.input.newSource),
        detailMono: true,
      }
    case "mcp_generic": {
      const toolLabel = toTitleCase(message.input.tool)
      const preview = summarizePayload(message.input.payload)
      return {
        icon: "generic",
        label: `调用 ${toolLabel}`,
        chip: preview || toTitleCase(message.input.server),
        chipMono: Boolean(preview),
        detail: proseLines(output),
        detailMono: true,
      }
    }
    default: {
      const preview = message.toolKind === "unknown_tool" ? summarizePayload(message.input.payload) : null
      return {
        icon: "generic",
        label: message.toolName,
        chip: preview,
        chipMono: Boolean(preview),
        detail: proseLines(output),
        detailMono: false,
      }
    }
  }
}

export function collectToolDiffChips(messages: ProcessedToolCall[]): DiffChipFile[] {
  const files: DiffChipFile[] = []
  for (const message of messages) {
    if (message.toolKind === "write_file") {
      const path = message.input.filePath
      files.push({
        file: basename(path),
        path,
        add: countLines(message.input.content),
        del: 0,
        lines: previewLines(message.input.content, "add"),
      })
    } else if (message.toolKind === "edit_file") {
      const path = message.input.filePath
      const oldLines = previewLines(message.input.oldString, "del", 2)
      const newLines = previewLines(message.input.newString, "add", 3)
      files.push({
        file: basename(path),
        path,
        add: countLines(message.input.newString),
        del: countLines(message.input.oldString),
        lines: oldLines.length + newLines.length > 0
          ? [...oldLines, ...newLines]
          : undefined,
      })
    } else if (message.toolKind === "delete_file") {
      const path = message.input.filePath
      files.push({
        file: basename(path),
        path,
        add: 0,
        del: Math.max(1, countLines(message.input.content)),
        lines: previewLines(message.input.content, "del"),
      })
    }
  }
  return files
}
