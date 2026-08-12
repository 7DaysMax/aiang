import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import type {
  HydratedBashToolCall,
  HydratedGrepToolCall,
  HydratedReadFileToolCall,
  HydratedSkillToolCall,
} from "../../../shared/types"
import { ToolCallMessage } from "./ToolCallMessage"
import { ReadResultImages } from "./ToolCallExpandedContent"

describe("ToolCallMessage", () => {
  test("renders a pending bash call as 正在运行", () => {
    const message: HydratedBashToolCall = {
      id: "bash-pending",
      kind: "tool",
      toolKind: "bash",
      toolName: "Bash",
      toolId: "tool-1",
      input: { command: "cd /tmp && bunx tsc --noEmit" },
      timestamp: new Date().toISOString(),
    }

    const html = renderToStaticMarkup(<ToolCallMessage message={message} isLoading />)

    expect(html).toContain("正在运行 cd /tmp &amp;&amp; bunx tsc --noEmit")
  })

  test("renders a finished bash call with its duration", () => {
    const message: HydratedBashToolCall = {
      id: "bash-done",
      kind: "tool",
      toolKind: "bash",
      toolName: "Bash",
      toolId: "tool-2",
      input: { command: "cd /tmp && ls" },
      timestamp: "2026-08-07T10:00:00.000Z",
      resultEntryId: "result-2",
      resultTimestamp: "2026-08-07T10:00:03.250Z",
    }

    const html = renderToStaticMarkup(<ToolCallMessage message={message} />)

    expect(html).toContain("已在 3.3s 内运行 cd /tmp &amp;&amp; ls")
  })

  test("renders a pending grep call as 正在搜索", () => {
    const message: HydratedGrepToolCall = {
      id: "grep-pending",
      kind: "tool",
      toolKind: "grep",
      toolName: "Grep",
      toolId: "tool-4",
      input: { pattern: "status.*no_repo" },
      timestamp: new Date().toISOString(),
    }

    const html = renderToStaticMarkup(<ToolCallMessage message={message} isLoading />)

    expect(html).toContain("正在搜索 `status.*no_repo`")
  })

  test("renders a finished read call as 已读取 with a duration suffix", () => {
    const message: HydratedReadFileToolCall = {
      id: "read-done",
      kind: "tool",
      toolKind: "read_file",
      toolName: "Read",
      toolId: "tool-3",
      input: { filePath: "/Users/eason/Desktop/Youmi/aiang/src/client/components/chat-ui/GitPanel.tsx" },
      timestamp: "2026-08-07T10:00:00.000Z",
      resultEntryId: "result-3",
      resultTimestamp: "2026-08-07T10:00:02.000Z",
    }

    const html = renderToStaticMarkup(
      <ToolCallMessage message={message} localPath="/Users/eason/Desktop/Youmi/aiang" />
    )

    expect(html).toContain("已读取 src/client/components/chat-ui/GitPanel.tsx（2s）")
  })

  test("renders read result image blocks as inline images", () => {
    const html = renderToStaticMarkup(
      <ReadResultImages
        images={[
          {
            type: "image",
            data: "ZmFrZS1pbWFnZS1kYXRh",
            mimeType: "image/png",
          },
        ]}
      />
    )

    expect(html).toContain("data:image/png;base64,ZmFrZS1pbWFnZS1kYXRh")
    expect(html).toContain("alt=\"Read result 1\"")
  })

  test("renders the user-facing skill label", () => {
    const message: HydratedSkillToolCall = {
      id: "skill-1",
      kind: "tool",
      toolKind: "skill",
      toolName: "Skill",
      toolId: "tool-1",
      input: { skill: "shadcn" },
      timestamp: new Date().toISOString(),
    }

    const html = renderToStaticMarkup(<ToolCallMessage message={message} />)

    expect(html).toContain("读取技能 – shadcn")
  })

  test("renders WebFetch / TaskOutput / cron tools with Chinese labels", () => {
    const fetchCall: import("../../../shared/types").HydratedWebFetchToolCall = {
      id: "fetch-1",
      kind: "tool",
      toolKind: "web_fetch",
      toolName: "WebFetch",
      toolId: "tool-1",
      input: { url: "https://example.com" },
      timestamp: new Date().toISOString(),
    }
    const fetchHtml = renderToStaticMarkup(<ToolCallMessage message={fetchCall} />)
    expect(fetchHtml).toContain("抓取 https://example.com")

    const taskOutput: import("../../../shared/types").HydratedTaskOutputToolCall = {
      id: "taskout-1",
      kind: "tool",
      toolKind: "task_output",
      toolName: "TaskOutput",
      toolId: "tool-2",
      input: { taskId: "task-9" },
      timestamp: new Date().toISOString(),
    }
    const taskHtml = renderToStaticMarkup(<ToolCallMessage message={taskOutput} />)
    expect(taskHtml).toContain("查看子任务输出（task-9）")

    const cron: import("../../../shared/types").HydratedCronCreateToolCall = {
      id: "cron-1",
      kind: "tool",
      toolKind: "cron_create",
      toolName: "CronCreate",
      toolId: "tool-3",
      input: { cron: "0 9 * * *", command: "npm test" },
      timestamp: new Date().toISOString(),
    }
    const cronHtml = renderToStaticMarkup(<ToolCallMessage message={cron} />)
    expect(cronHtml).toContain("创建定时任务 `0 9 * * *`")
  })
})
