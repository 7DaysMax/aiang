import type { ProcessedToolCall } from "./types"
import TaskRows, { type TaskRow } from "@/components/primitives/TaskRows"
import { DEFAULT_BEAUTIFUL_UI_PREFERENCES } from "@/shared/types"
import { useAppSettingsStore } from "../../stores/appSettingsStore"

interface Props {
  message: Extract<ProcessedToolCall, { toolKind: "todo_write" }>
}

export function TodoWriteMessage({ message }: Props) {
  const taskRowsVariant = useAppSettingsStore(
    (store) => store.settings?.beautifulUi?.taskRows ?? DEFAULT_BEAUTIFUL_UI_PREFERENCES.taskRows,
  )
  const todos = message.input.todos
  if (!todos.length) return null
  const rows: TaskRow[] = todos.map((todo, index) => ({
    key: `${index}-${todo.content}`,
    label: todo.status === "in_progress" && todo.activeForm ? todo.activeForm : todo.content,
    amount: todo.status === "completed" ? "done" : todo.status === "in_progress" ? "now" : "queued",
    status: todo.status === "completed" ? "done" : todo.status === "in_progress" ? "running" : "pending",
    step: index + 1,
    details: todo.activeForm && todo.activeForm !== todo.content
      ? [
          { label: todo.content, meta: "task" },
          { label: todo.activeForm, meta: todo.status === "in_progress" ? "now" : "form" },
        ]
      : [{ label: todo.content, meta: todo.status === "completed" ? "done" : todo.status === "in_progress" ? "now" : "queued" }],
  }))
  return (
    <div className="w-full">
      <TaskRows variant={taskRowsVariant} rows={rows} labels={{ completed: "已完成", failed: "失败" }} />
    </div>
  )
}
