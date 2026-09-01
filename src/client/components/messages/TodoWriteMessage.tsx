import type { ProcessedToolCall } from "./types"
import { TaskList } from "../bui/TaskList"

interface Props {
  message: Extract<ProcessedToolCall, { toolKind: "todo_write" }>
}

export function TodoWriteMessage({ message }: Props) {
  const todos = message.input.todos
  if (!todos.length) return null
  return (
    <div className="w-full">
      <TaskList items={todos} />
    </div>
  )
}
