import { describe, expect, test } from "bun:test"
import { hydrateToolResult, normalizeToolCall } from "./tools"

describe("normalizeToolCall", () => {
  test("maps AskUserQuestion input to typed questions", () => {
    const tool = normalizeToolCall({
      toolName: "AskUserQuestion",
      toolId: "tool-1",
      input: {
        questions: [
          {
            question: "Which runtime?",
            header: "Runtime",
            options: [{ label: "Codex", description: "Use Codex" }],
          },
        ],
      },
    })

    expect(tool.toolKind).toBe("ask_user_question")
    if (tool.toolKind !== "ask_user_question") throw new Error("unexpected tool kind")
    expect(tool.input.questions[0]?.question).toBe("Which runtime?")
  })

  test("maps Bash snake_case input to camelCase", () => {
    const tool = normalizeToolCall({
      toolName: "Bash",
      toolId: "tool-2",
      input: {
        command: "pwd",
        timeout: 5000,
        run_in_background: true,
      },
    })

    expect(tool.toolKind).toBe("bash")
    if (tool.toolKind !== "bash") throw new Error("unexpected tool kind")
    expect(tool.input.timeoutMs).toBe(5000)
    expect(tool.input.runInBackground).toBe(true)
  })

  test("maps unknown MCP tools to mcp_generic", () => {
    const tool = normalizeToolCall({
      toolName: "mcp__sentry__search_issues",
      toolId: "tool-3",
      input: { query: "regression" },
    })

    expect(tool.toolKind).toBe("mcp_generic")
    if (tool.toolKind !== "mcp_generic") throw new Error("unexpected tool kind")
    expect(tool.input.server).toBe("sentry")
    expect(tool.input.tool).toBe("search_issues")
  })

  test("maps WebFetch to web_fetch", () => {
    const tool = normalizeToolCall({
      toolName: "WebFetch",
      toolId: "tool-4",
      input: { url: "https://example.com", timeout_ms: 8000 },
    })

    expect(tool.toolKind).toBe("web_fetch")
    if (tool.toolKind !== "web_fetch") throw new Error("unexpected tool kind")
    expect(tool.input.url).toBe("https://example.com")
  })

  test("maps TaskOutput and TaskStop to their typed kinds", () => {
    const output = normalizeToolCall({
      toolName: "TaskOutput",
      toolId: "tool-5",
      input: { task_id: "task-1" },
    })
    expect(output.toolKind).toBe("task_output")
    if (output.toolKind !== "task_output") throw new Error("unexpected tool kind")
    expect(output.input.taskId).toBe("task-1")

    const stop = normalizeToolCall({
      toolName: "TaskStop",
      toolId: "tool-6",
      input: { task_id: "task-1" },
    })
    expect(stop.toolKind).toBe("task_stop")
    if (stop.toolKind !== "task_stop") throw new Error("unexpected tool kind")
    expect(stop.input.taskId).toBe("task-1")
  })

  test("maps cron tools, Notify, KillShell, EnterPlanMode, NotebookEdit, Delete", () => {
    const cases: Array<[string, Record<string, unknown>, import("./types").NormalizedToolCall["toolKind"]]> = [
      ["CronCreate", { cron: "0 9 * * *", command: "npm test" }, "cron_create"],
      ["CronDelete", { cron_id: "cron-1" }, "cron_delete"],
      ["CronList", { timezone: "Asia/Shanghai" }, "cron_list"],
      ["Notify", { message: "done" }, "notify"],
      ["KillShell", { signal: 9 }, "kill_shell"],
      ["EnterPlanMode", { plan: "step one" }, "enter_plan_mode"],
      ["NotebookEdit", { notebook_path: "a.ipynb", cell_id: "c1", new_source: "x" }, "notebook_edit"],
      ["Delete", { file_path: "old.ts" }, "delete_file"],
    ]

    for (const [toolName, input, expectedKind] of cases) {
      const tool = normalizeToolCall({ toolName, toolId: "tool-7", input })
      expect(tool.toolKind).toBe(expectedKind)
    }
  })
})

describe("hydrateToolResult", () => {
  test("hydrates AskUserQuestion answers", () => {
    const tool = normalizeToolCall({
      toolName: "AskUserQuestion",
      toolId: "tool-1",
      input: { questions: [] },
    })

    const result = hydrateToolResult(tool, JSON.stringify({ answers: { runtime: "codex" } }))
    expect(result).toEqual({ answers: { runtime: ["codex"] } })
  })

  test("hydrates AskUserQuestion multi-select answers", () => {
    const tool = normalizeToolCall({
      toolName: "AskUserQuestion",
      toolId: "tool-1",
      input: { questions: [] },
    })

    const result = hydrateToolResult(tool, JSON.stringify({ answers: { runtime: ["bun", "node"] } }))
    expect(result).toEqual({ answers: { runtime: ["bun", "node"] } })
  })

  test("hydrates ExitPlanMode decisions", () => {
    const tool = normalizeToolCall({
      toolName: "ExitPlanMode",
      toolId: "tool-2",
      input: { plan: "Do the thing" },
    })

    const result = hydrateToolResult(tool, { confirmed: true, clearContext: true })
    expect(result).toEqual({ confirmed: true, clearContext: true, message: undefined })
  })

  test("hydrates Read file text results", () => {
    const tool = normalizeToolCall({
      toolName: "Read",
      toolId: "tool-3",
      input: { file_path: "/tmp/example.ts" },
    })

    expect(hydrateToolResult(tool, "line 1\nline 2")).toBe("line 1\nline 2")
  })

  test("hydrates read image results with canonical image blocks intact", () => {
    const tool = normalizeToolCall({
      toolName: "Read",
      toolId: "tool-image",
      input: { file_path: "/tmp/example.png" },
    })

    expect(hydrateToolResult(tool, {
      content: [
        {
          type: "text",
          text: "Read image file [image/png]\n[Image: original 10x10, displayed at 10x10.]",
        },
        {
          type: "image",
          data: "ZmFrZS1pbWFnZS1kYXRh",
          mimeType: "image/png",
        },
      ],
    })).toEqual({
      content: "Read image file [image/png]\n[Image: original 10x10, displayed at 10x10.]",
      blocks: [
        {
          type: "text",
          text: "Read image file [image/png]\n[Image: original 10x10, displayed at 10x10.]",
        },
        {
          type: "image",
          data: "ZmFrZS1pbWFnZS1kYXRh",
          mimeType: "image/png",
        },
      ],
    })
  })

  test("hydrates Claude read image results with source.base64 into canonical image blocks", () => {
    const tool = normalizeToolCall({
      toolName: "Read",
      toolId: "tool-image-claude",
      input: { file_path: "/tmp/example.png" },
    })

    expect(hydrateToolResult(tool, {
      content: [
        {
          type: "image",
          source: {
            type: "base64",
            data: "ZmFrZS1pbWFnZS1kYXRh",
            media_type: "image/png",
          },
        },
      ],
    })).toEqual({
      content: "",
      blocks: [
        {
          type: "image",
          data: "ZmFrZS1pbWFnZS1kYXRh",
          mimeType: "image/png",
        },
      ],
    })
  })
})
