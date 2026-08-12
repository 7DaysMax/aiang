import { describe, expect, test } from "bun:test"
import { PassThrough } from "node:stream"
import {
  buildReasonixConfig,
  normalizeReasonixToolCall,
  parseReasonixSessionUpdate,
  startReasonixSession,
  type ReasonixChildProcess,
} from "./reasonix-agent"
import type { HarnessEvent } from "./harness-types"
import { AsyncQueue } from "./async-queue"

function transcriptEntries(events: HarnessEvent[]) {
  return events.flatMap((event) => (event.type === "transcript" && event.entry ? [event.entry] : []))
}

function makeContext() {
  const items: HarnessEvent[] = []
  return {
    sessionId: "sess-1",
    queue: { push(event: HarnessEvent) { items.push(event) } } as unknown as AsyncQueue<HarnessEvent>,
    status: { usage: null, turnStart: Date.now() },
    messageSeq: 0,
    items,
  }
}

describe("normalizeReasonixToolCall", () => {
  test("write_file maps onto Write with path/content", () => {
    const tool = normalizeReasonixToolCall("write_file", { path: "/repo/a.txt", content: "hello" }, "call-1")
    expect(tool).toMatchObject({
      toolKind: "write_file",
      toolId: "call-1",
      input: { filePath: "/repo/a.txt", content: "hello" },
    })
  })

  test("bash maps onto Bash and normalizes timeout", () => {
    const tool = normalizeReasonixToolCall("bash", { command: "ls", timeout: 30 }, "call-2")
    expect(tool).toMatchObject({ toolKind: "bash", input: { command: "ls", timeoutMs: 30 } })
  })

  test("read_file / edit_file / glob / grep map onto Read / Edit / Glob / Grep", () => {
    expect(normalizeReasonixToolCall("read_file", { path: "/repo/b.txt" }, "c")?.toolKind).toBe("read_file")
    expect(normalizeReasonixToolCall("edit_file", { path: "/repo/b.txt", old_string: "a", new_string: "b" }, "c")?.toolKind).toBe("edit_file")
    expect(normalizeReasonixToolCall("glob", { pattern: "**/*.ts" }, "c")?.toolKind).toBe("glob")
    expect(normalizeReasonixToolCall("grep", { pattern: "x" }, "c")?.toolKind).toBe("grep")
  })

  test("unknown tool names fall through to null (dropped, not crashed)", () => {
    expect(normalizeReasonixToolCall("mystery_tool", { foo: "bar" }, "c")).toBeNull()
  })
})

describe("buildReasonixConfig", () => {
  test("writes an explicit DeepSeek provider with a 1M window", () => {
    const flash = buildReasonixConfig("deepseek-v4-flash")
    expect(flash).toContain('default_model = "deepseek"')
    expect(flash).toContain('base_url = "https://api.deepseek.com"')
    expect(flash).toContain('models = ["deepseek-v4-flash"]')
    expect(flash).toContain('api_key_env = "DEEPSEEK_API_KEY"')
    expect(flash).toContain("context_window = 1000000")
    expect(flash).toContain("system_prompt")
    const pro = buildReasonixConfig("deepseek-v4-pro")
    expect(pro).toContain('models = ["deepseek-v4-pro"]')
  })

  test("registers the vision MCP plugin when 识图服务 is enabled", () => {
    const previousEnabled = process.env.AIANG_VISION_ENABLED
    const previousKey = process.env.AIANG_VISION_API_KEY
    const previousRuntime = process.env.AIANG_VISION_RUNTIME
    process.env.AIANG_VISION_ENABLED = "true"
    process.env.AIANG_VISION_API_KEY = "sk-vision"
    process.env.AIANG_VISION_RUNTIME = "/custom/bun"
    try {
      const config = buildReasonixConfig("deepseek-v4-flash")
      expect(config).toContain("[[plugins]]")
      expect(config).toContain('name    = "youmi_vision"')
      expect(config).toContain('command = "/custom/bun"')
      expect(config).toContain("vision-mcp-server.mjs")
      expect(config).toContain("describe_image")
    } finally {
      if (previousEnabled === undefined) delete process.env.AIANG_VISION_ENABLED
      else process.env.AIANG_VISION_ENABLED = previousEnabled
      if (previousKey === undefined) delete process.env.AIANG_VISION_API_KEY
      else process.env.AIANG_VISION_API_KEY = previousKey
      if (previousRuntime === undefined) delete process.env.AIANG_VISION_RUNTIME
      else process.env.AIANG_VISION_RUNTIME = previousRuntime
    }
  })

  test("omits the MCP plugin when 识图服务 is disabled", () => {
    const previousEnabled = process.env.AIANG_VISION_ENABLED
    process.env.AIANG_VISION_ENABLED = "false"
    try {
      const config = buildReasonixConfig("deepseek-v4-flash")
      expect(config).not.toContain("[[plugins]]")
    } finally {
      if (previousEnabled === undefined) delete process.env.AIANG_VISION_ENABLED
      else process.env.AIANG_VISION_ENABLED = previousEnabled
    }
  })
})

describe("parseReasonixSessionUpdate", () => {
  test("thought and message chunks become thinking / assistant_text deltas", () => {
    const ctx = makeContext()
    parseReasonixSessionUpdate({ sessionUpdate: "agent_thought_chunk", content: { type: "text", text: "用户" } }, ctx)
    parseReasonixSessionUpdate({ sessionUpdate: "agent_message_chunk", content: { type: "text", text: "我来" } }, ctx)
    const entries = transcriptEntries(ctx.items)
    expect(entries[0]).toMatchObject({ kind: "thinking", text: "用户" })
    expect(entries[1]).toMatchObject({ kind: "assistant_text", text: "我来" })
  })

  test("chunks of one message share a messageId base; tool calls rotate it", () => {
    const ctx = makeContext()
    parseReasonixSessionUpdate({ sessionUpdate: "agent_thought_chunk", content: { type: "text", text: "想" } }, ctx)
    parseReasonixSessionUpdate({ sessionUpdate: "agent_thought_chunk", content: { type: "text", text: "法" } }, ctx)
    parseReasonixSessionUpdate({ sessionUpdate: "agent_message_chunk", content: { type: "text", text: "正" } }, ctx)
    parseReasonixSessionUpdate({ sessionUpdate: "agent_message_chunk", content: { type: "text", text: "文" } }, ctx)
    const entries = transcriptEntries(ctx.items)
    // thinking 与正文共享基座，正文带 ...000000000001 后缀：前端据此合并成
    // 一个思考卡片 + 一个正文气泡，且正文不再重复渲染模型头部。
    expect(entries[0].messageId).toBe("reasonix-0-000000000000")
    expect(entries[1].messageId).toBe("reasonix-0-000000000000")
    expect(entries[2].messageId).toBe("reasonix-0-000000000001")
    expect(entries[3].messageId).toBe("reasonix-0-000000000001")

    parseReasonixSessionUpdate({
      sessionUpdate: "tool_call",
      toolCallId: "call_00_abc",
      title: "read_file",
      kind: "read",
      status: "pending",
      rawInput: { path: "/tmp/a.txt" },
      locations: [{ path: "/tmp/a.txt" }],
    }, ctx)
    parseReasonixSessionUpdate({ sessionUpdate: "agent_message_chunk", content: { type: "text", text: "之后" } }, ctx)
    const afterTool = transcriptEntries(ctx.items)
    // tool 边界轮换序号：工具后的正文是新消息，前端不跟工具前的正文粘一起。
    expect(afterTool[afterTool.length - 1]?.messageId).toBe("reasonix-1-000000000001")
  })

  test("tool_call becomes a tool_call entry with rawInput", () => {
    const ctx = makeContext()
    parseReasonixSessionUpdate({
      sessionUpdate: "tool_call",
      toolCallId: "call_00_abc",
      title: "write_file",
      kind: "edit",
      status: "pending",
      rawInput: { path: "/tmp/hello.txt", content: "hello" },
      locations: [{ path: "/tmp/hello.txt" }],
    }, ctx)
    const entries = transcriptEntries(ctx.items)
    expect(entries[0]).toMatchObject({
      kind: "tool_call",
      tool: { toolKind: "write_file", toolId: "call_00_abc", input: { filePath: "/tmp/hello.txt", content: "hello" } },
    })
  })

  test("tool_call_update completed becomes a tool_result entry", () => {
    const ctx = makeContext()
    parseReasonixSessionUpdate({
      sessionUpdate: "tool_call_update",
      toolCallId: "call_00_abc",
      status: "completed",
      content: [{ type: "content", content: { type: "text", text: "wrote 14 bytes" } }],
    }, ctx)
    const entries = transcriptEntries(ctx.items)
    expect(entries[0]).toMatchObject({ kind: "tool_result", toolId: "call_00_abc", content: "wrote 14 bytes" })
  })

  test("failed tool results carry isError", () => {
    const ctx = makeContext()
    parseReasonixSessionUpdate({
      sessionUpdate: "tool_call_update",
      toolCallId: "call_00_bad",
      status: "failed",
      content: [{ type: "content", content: { type: "text", text: "command not found" } }],
    }, ctx)
    const entries = transcriptEntries(ctx.items)
    expect(entries[0]).toMatchObject({ kind: "tool_result", toolId: "call_00_bad", isError: true })
  })

  test("available_commands_update is ignored", () => {
    const ctx = makeContext()
    parseReasonixSessionUpdate({ sessionUpdate: "available_commands_update", availableCommands: [] }, ctx)
    expect(ctx.items).toHaveLength(0)
  })
})

// ---- 子进程集成测试（fake reasonix acp）----

interface FakeProc extends ReasonixChildProcess {
  stdin: PassThrough
  stdout: PassThrough
  stderr: PassThrough
  send: (message: Record<string, unknown>) => void
  sent: Array<Record<string, unknown>>
}

function fakeReasonixProcess(): FakeProc {
  const stdin = new PassThrough()
  const stdout = new PassThrough()
  const stderr = new PassThrough()
  const sent: Array<Record<string, unknown>> = []
  const proc = {
    stdin,
    stdout,
    stderr,
    sent,
    kill() { return true },
    once() { return this },
    send(message: Record<string, unknown>) {
      stdout.write(JSON.stringify(message) + "\n")
    },
    sentRequests() {
      const parsed: Array<Record<string, unknown>> = []
      for (const line of (stdin.read()?.toString() ?? "").split("\n")) {
        if (!line.trim()) continue
        try { parsed.push(JSON.parse(line)) } catch { /* partial read */ }
      }
      return parsed
    },
  } as unknown as FakeProc
  // 捕获 stdin 内容
  const chunks: string[] = []
  stdin.on("data", (chunk) => chunks.push(String(chunk)))
  Object.defineProperty(proc, "stdinText", { get: () => chunks.join("") })
  return proc
}

async function collectStream(handle: ReturnType<typeof startReasonixSession> extends Promise<infer T> ? T : never) {
  const events: HarnessEvent[] = []
  for await (const event of handle.stream) {
    events.push(event)
    if (event.type === "transcript" && event.entry?.kind === "result") break
  }
  return events
}

describe("startReasonixSession", () => {
  test("runs the ACP handshake and forwards a full tool-using turn", async () => {
    const proc = fakeReasonixProcess()
    const spawnReasonix = () => proc

    // 响应逻辑：initialize / session/new / session/prompt
    let initialized = false
    const stdinHook = (proc as unknown as { stdin: PassThrough }).stdin
    stdinHook.on("data", (chunk: Buffer) => {
      for (const line of String(chunk).split("\n")) {
        if (!line.trim()) continue
        const message = JSON.parse(line) as { id?: number; method: string }
        if (message.id === 1) { // initialize
          proc.send({ jsonrpc: "2.0", id: 1, result: { protocolVersion: 1, agentCapabilities: {} } })
          initialized = true
        } else if (message.id === 2) { // session/new
          proc.send({ jsonrpc: "2.0", id: 2, result: { sessionId: "sess-1" } })
          // 推一个思考增量 + 工具调用事件
          proc.send({ jsonrpc: "2.0", method: "session/update", params: { sessionId: "sess-1", update: { sessionUpdate: "agent_thought_chunk", content: { type: "text", text: "先" } } } })
          proc.send({ jsonrpc: "2.0", method: "session/update", params: { sessionId: "sess-1", update: { sessionUpdate: "agent_thought_chunk", content: { type: "text", text: "写入" } } } })
          proc.send({ jsonrpc: "2.0", method: "session/update", params: { sessionId: "sess-1", update: { sessionUpdate: "tool_call", toolCallId: "call-1", title: "write_file", kind: "edit", status: "pending", rawInput: { path: "/tmp/hello.txt", content: "hello" } } } })
          proc.send({ jsonrpc: "2.0", method: "session/update", params: { sessionId: "sess-1", update: { sessionUpdate: "tool_call_update", toolCallId: "call-1", status: "completed", content: [{ type: "content", content: { type: "text", text: "wrote 14 bytes" } }] } } })
          proc.send({ jsonrpc: "2.0", method: "session/update", params: { sessionId: "sess-1", update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "完成" } } } })
        } else if (message.id === 3) { // session/prompt
          proc.send({ jsonrpc: "2.0", id: 3, result: { stopReason: "end_turn", transcriptPath: "/tmp/sess.jsonl" } })
        }
      }
    })

    const handle = await startReasonixSession({
      cwd: "/tmp/reasonix-test",
      model: "deepseek-v4-flash",
      apiKey: "sk-test",
      spawnReasonix,
      onToolRequest: async () => ({}),
    })
    await handle.sendPrompt("创建文件")
    const events = await collectStream(handle)
    const entries = transcriptEntries(events)

    const thinking = entries.filter((entry) => entry.kind === "thinking").map((entry) => entry.text).join("")
    expect(thinking).toBe("先写入")
    expect(entries.some((entry) => entry.kind === "tool_call")).toBe(true)
    expect(entries.some((entry) => entry.kind === "tool_result" && entry.toolId === "call-1" && entry.content === "wrote 14 bytes")).toBe(true)
    expect(entries.some((entry) => entry.kind === "assistant_text" && entry.text === "完成")).toBe(true)
    expect(entries.some((entry) => entry.kind === "result" && entry.result === "end_turn")).toBe(true)
    expect(initialized).toBe(true)
    handle.close()
  })

  test("auto-approves session/request_permission requests", async () => {
    const proc = fakeReasonixProcess()
    const spawnReasonix = () => proc
    let permissionReply: unknown = null
    const stdin = (proc as unknown as { stdin: PassThrough }).stdin
    stdin.on("data", (chunk: Buffer) => {
      for (const line of String(chunk).split("\n")) {
        if (!line.trim()) continue
        const message = JSON.parse(line) as { id?: number; method: string; result?: unknown }
        if (message.id === 1) {
          proc.send({ jsonrpc: "2.0", id: 1, result: { protocolVersion: 1 } })
        } else if (message.id === 2) {
          proc.send({ jsonrpc: "2.0", id: 2, result: { sessionId: "sess-1" } })
          proc.send({ jsonrpc: "2.0", id: 99, method: "session/request_permission", params: { toolCall: { toolCallId: "gate-1", title: "write_file /tmp/x" } } })
        } else if (message.id === 3) {
          proc.send({ jsonrpc: "2.0", id: 3, result: { stopReason: "end_turn" } })
        } else if (message.id === 99) {
          permissionReply = message.result
        }
      }
    })

    const handle = await startReasonixSession({
      cwd: "/tmp",
      model: "deepseek-v4-flash",
      apiKey: "sk-test",
      spawnReasonix,
      onToolRequest: async () => ({}),
    })
    await handle.sendPrompt("hi")
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(permissionReply).toMatchObject({ outcome: { outcome: "selected", optionId: "allow_once" } })
    handle.close()
  })
})
