import { mkdirSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import {
  agentsMdPath,
  createAgent,
  installSkill,
  isCompleteModelMessage,
  isEventMessage,
  listInstalledSkills,
  removeSkill,
  userText,
  type Agent,
  type OmniMessage,
  type Session,
  type ThinkingLevelName,
} from "@prismshadow/penguin-core"
import { librarySkill } from "@prismshadow/penguin-skills"
import { normalizeToolCall } from "../shared/tools"
import type { NormalizedToolCall } from "../shared/types"
import { asRecord, asString } from "../shared/json"
import type { HarnessEvent, HarnessToolRequest } from "./harness-types"
import { AsyncQueue } from "./async-queue"
import { timestamped } from "./transcript"
import {
  applyYoumiPluginsToAgent,
  YOUMI_PLUGIN_SKILL_PREFIX,
  type YoumiPluginApplyResult,
} from "./youmi-plugin-runtime"

/**
 * Youmi engine — PenguinHarness（@prismshadow/penguin-core）驱动的编程 Agent。
 *
 * 模型始终是 DeepSeek（V4 Flash/Pro + 设置里的 DEEPSEEK_API_KEY）。
 * 「打平 Claude」指 Agent 能力对标，不切换到 Anthropic 模型。
 * 数据落在 ~/.aiang/youmi（PENGUIN_HOME），不污染 ~/.penguin。
 * 思考档位 DeepSeek max → Penguin xhigh。
 */

export const YOUMI_CONTEXT_WINDOW_TOKENS = 1_000_000
export const YOUMI_AGENT_ID = "youmi_coding"
export const YOUMI_PROJECT_ID = "aiang_youmi"
export const YOUMI_CODING_SKILLS = ["software-engineering"] as const

/** Claude Code–style coding-agent operating contract injected into Penguin AGENTS.md. */
export const YOUMI_AGENTS_MD = `# Youmi Coding Agent

You are Youmi, a programming agent. Target parity with Claude Code agent capability — not chatty answers.

## Operating loop
1. Investigate with tools before editing (read / shell search).
2. Make the smallest correct change.
3. Verify with shell commands (run the project's tests or the command the user named).
4. If verification fails, iterate. Do not stop on speculation.

## Tools
- Prefer \`read_file\` / \`edit_file\` / \`write_file\` for code changes.
- Use the \`glob\` plugin to list files by pattern.
- Use the \`grep\` plugin to search file contents.
- Use the \`fetch_url\` plugin to read a public http(s) page.
- Use the \`now\` plugin for the current time.
- Use \`exec_command\` for tests, builds, and other shell work (Bash).
- Use \`run_subagent\` only for isolated subtasks.

## Quality bar
- Keep unrelated behavior intact (no collateral edits).
- Match acceptance criteria exactly.
- Reply briefly after the work is verified.
`

const YOUMI_TOOLS = [
  "Glob",
  "Grep",
  "Bash",
  "Read",
  "Write",
  "Edit",
  "Task",
  "Skill",
] as const

export function resolveYoumiHome(): string {
  const override = process.env.YOUMI_HOME?.replace(/^~(?=\/|$)/, homedir())
    ?? process.env.PENGUIN_HOME?.replace(/^~(?=\/|$)/, homedir())
  if (override) return override
  return join(process.env.AIANG_CONFIG_DIR ?? join(homedir(), ".aiang"), "youmi")
}

export function resolveYoumiDataRoot(home = resolveYoumiHome()): string {
  return join(home, "data")
}

/** DeepSeek 思考档位 → PenguinHarness ThinkingLevelName。 */
export function mapYoumiThinkingLevel(effort?: string | null): ThinkingLevelName {
  switch (effort) {
    case "low":
      return "low"
    case "high":
      return "high"
    case "max":
      return "xhigh"
    default:
      return "xhigh"
  }
}

export function normalizeYoumiModelId(model: string): string {
  if (model.includes("pro") || model.includes("reasoner")) return "deepseek-v4-pro"
  return "deepseek-v4-flash"
}

function unquoteShellToken(value: string): string {
  return value.replace(/^['"]|['"]$/g, "")
}

function tokenizeShell(command: string): string[] {
  const tokens: string[] = []
  const matched = command.match(/'[^']*'|"[^"]*"|\S+/g) ?? []
  for (const token of matched) tokens.push(unquoteShellToken(token))
  return tokens
}

function extractSearchPattern(command: string): string {
  const tokens = tokenizeShell(command)
  let index = 0
  if (tokens[0] === "sudo") index += 1
  if (tokens[index] === "git" && tokens[index + 1] === "grep") index += 2
  else index += 1
  const takesValue = new Set(["-A", "-B", "-C", "-I", "-e", "-g", "-u", "-m", "--glob", "--regexp", "--iglob", "-f", "--file"])
  for (let i = index; i < tokens.length; i++) {
    const token = tokens[i]!
    if (token.startsWith("-")) {
      if (token.includes("=")) continue
      if (takesValue.has(token)) i += 1
      continue
    }
    return token
  }
  return command
}

/**
 * Penguin 只有 exec_command。把常见的找文件 / 搜内容命令标成 Glob / Grep，
 * 对话里才能走出 DeepSeek Harness 那种 think → glob → bash 轨迹。
 */
export function classifyYoumiExecCommand(command: string): {
  toolName: "Glob" | "Grep" | "Bash"
  input: Record<string, unknown>
} {
  const trimmed = command.trim()
  if (!trimmed) return { toolName: "Bash", input: { command: "" } }
  const compact = trimmed.replace(/\\\n/g, " ").replace(/\s+/g, " ")

  const findName = compact.match(/\bfind\b[\s\S]*?-name\s+(\S+)/)
  if (findName?.[1]) {
    return { toolName: "Glob", input: { pattern: unquoteShellToken(findName[1]) } }
  }

  if (/\brg\b/.test(compact) && /(?:^|\s)(?:--files(?:-with-matches)?|-l)(?:\s|$)/.test(compact)) {
    const globFlag = compact.match(/(?:-g|--glob)\s+(\S+)/)
    return { toolName: "Glob", input: { pattern: globFlag?.[1] ? unquoteShellToken(globFlag[1]) : "**/*" } }
  }

  if (/^(?:sudo\s+)?(?:fd|git\s+ls-files)\b/.test(compact)) {
    const quoted = compact.match(/['"]([^'"]+)['"]/)
    return { toolName: "Glob", input: { pattern: quoted?.[1] ?? "**/*" } }
  }

  if (/^(?:sudo\s+)?(?:rg|grep|egrep|git\s+grep)\b/.test(compact)) {
    return { toolName: "Grep", input: { pattern: extractSearchPattern(compact) } }
  }

  return { toolName: "Bash", input: { command: trimmed } }
}

/** Penguin 工具名 → Kanna NormalizedToolCall。 */
export function normalizeYoumiToolCall(
  name: string,
  rawArguments: string,
  toolId: string,
): NormalizedToolCall | null {
  let parsed: Record<string, unknown> = {}
  try {
    const value = JSON.parse(rawArguments || "{}")
    parsed = asRecord(value) ?? {}
  } catch {
    parsed = {}
  }
  if (name === "exec_command" || name === "input_command") {
    const classified = classifyYoumiExecCommand(asString(parsed.command) ?? asString(parsed.cmd) ?? "")
    return normalizeToolCall({
      toolName: classified.toolName,
      toolId,
      input: classified.input,
    })
  }
  const toolName = youmiToolName(name)
  if (!toolName) return null
  return normalizeToolCall({
    toolName,
    toolId,
    input: translateYoumiToolInput(toolName, parsed),
  })
}

function youmiToolName(name: string): string | null {
  switch (name) {
    case "glob":
      return "Glob"
    case "grep":
      return "Grep"
    case "fetch_url":
      return "WebFetch"
    case "now":
      return "Now"
    case "read_file":
    case "read_image":
    case "describe_image":
      return "Read"
    case "write_file":
      return "Write"
    case "edit_file":
      return "Edit"
    case "run_subagent":
    case "input_subagent":
      return "Task"
    default:
      return name.length > 0 ? name : null
  }
}

function translateYoumiToolInput(toolName: string, input: Record<string, unknown>): Record<string, unknown> {
  switch (toolName) {
    case "Read":
      return { file_path: input.path ?? input.file_path, ...input }
    case "Write":
      return { file_path: input.path ?? input.file_path, content: input.content, ...input }
    case "Edit":
      return {
        file_path: input.path ?? input.file_path,
        old_string: input.old_string ?? input.oldString,
        new_string: input.new_string ?? input.newString,
        ...input,
      }
    case "Bash":
      return {
        command: input.command ?? input.cmd,
        ...input,
      }
    default:
      return input
  }
}

export interface YoumiSessionHandle {
  provider: "youmi"
  stream: AsyncIterable<HarnessEvent>
  interrupt: () => Promise<void>
  close: () => void
  sendPrompt: (content: string) => Promise<void>
  sessionId: string
}

export type StartYoumiSessionArgs = {
  cwd: string
  model: string
  effort?: string
  apiKey: string
  baseUrl?: string
  penguinProvider?: string
  onToolRequest?: (request: HarnessToolRequest) => Promise<unknown>
}

let ensureCodingSkillsPromise: Promise<void> | null = null
let lastYoumiPluginApply: YoumiPluginApplyResult = { tools: [], mcpServers: [], skills: [] }

async function syncYoumiPluginSkills(root: string, skills: YoumiPluginApplyResult["skills"]): Promise<void> {
  const installed = await listInstalledSkills(root, YOUMI_PROJECT_ID, YOUMI_AGENT_ID)
  const desired = new Set(skills.map((skill) => skill.name))
  for (const skill of installed) {
    if (!skill.name.startsWith(YOUMI_PLUGIN_SKILL_PREFIX)) continue
    if (desired.has(skill.name)) continue
    await removeSkill(root, YOUMI_PROJECT_ID, YOUMI_AGENT_ID, skill.name)
  }
  for (const skill of skills) {
    await installSkill(root, YOUMI_PROJECT_ID, YOUMI_AGENT_ID, {
      name: skill.name,
      content: skill.content,
    })
  }
}

async function ensureYoumiCodingAgent(root: string): Promise<Agent> {
  mkdirSync(root, { recursive: true })
  // createAgent 会 loadOrInit default_agent；我们用专用 youmi_coding agent。
  const agent = await createAgent({
    root,
    projectId: YOUMI_PROJECT_ID,
    agentId: YOUMI_AGENT_ID,
  })
  lastYoumiPluginApply = await applyYoumiPluginsToAgent(agent)
  await syncYoumiPluginSkills(root, lastYoumiPluginApply.skills)

  if (!ensureCodingSkillsPromise) {
    ensureCodingSkillsPromise = (async () => {
      const agentsPath = agentsMdPath(root, YOUMI_PROJECT_ID, YOUMI_AGENT_ID)
      mkdirSync(join(agentsPath, ".."), { recursive: true })
      writeFileSync(agentsPath, YOUMI_AGENTS_MD, "utf8")

      const installed = await listInstalledSkills(root, YOUMI_PROJECT_ID, YOUMI_AGENT_ID)
      const have = new Set(installed.map((skill) => skill.name))
      for (const name of YOUMI_CODING_SKILLS) {
        if (have.has(name)) continue
        const skill = librarySkill(name)
        if (!skill) continue
        await installSkill(root, YOUMI_PROJECT_ID, YOUMI_AGENT_ID, {
          name: skill.name,
          content: skill.content,
          icon: skill.icon,
          files: skill.files,
        })
      }
    })().catch((error) => {
      ensureCodingSkillsPromise = null
      throw error
    })
  }
  await ensureCodingSkillsPromise
  return agent
}

function payloadType(message: OmniMessage): string | undefined {
  return asString(asRecord(message.payload)?.type)
}

export async function startYoumiSession(args: StartYoumiSessionArgs): Promise<YoumiSessionHandle> {
  const home = resolveYoumiHome()
  const root = resolveYoumiDataRoot(home)
  process.env.PENGUIN_HOME = home

  const relay = Boolean(args.baseUrl)
  const modelId = relay ? args.model : normalizeYoumiModelId(args.model)
  const thinkingLevel = mapYoumiThinkingLevel(args.effort)
  const agent = await ensureYoumiCodingAgent(root)
  const session: Session = await agent.createSession({
    workspaceDir: args.cwd,
    provider: args.penguinProvider ?? "deepseek",
    modelId,
    thinkingLevel,
    apiKey: args.apiKey,
    ...(args.baseUrl ? { baseUrl: args.baseUrl } : {}),
  })

  const queue = new AsyncQueue<HarnessEvent>()
  const abortByTurn = { current: null as AbortController | null }
  let closed = false
  let messageSeq = 0
  let textBuffer = ""
  let thinkingBuffer = ""
  let thinkingMessageId: string | null = null
  let textMessageId: string | null = null

  const pluginDisplayTools = lastYoumiPluginApply.tools
    .map((name) => youmiToolName(name) ?? name)
    .filter((name): name is string => Boolean(name) && !(YOUMI_TOOLS as readonly string[]).includes(name))
  const tools = [...YOUMI_TOOLS, ...pluginDisplayTools]
  const slashCommands = [
    ...YOUMI_CODING_SKILLS,
    ...lastYoumiPluginApply.skills.map((skill) => skill.name),
  ]

  queue.push({
    type: "transcript",
    entry: timestamped({
      kind: "system_init",
      provider: "youmi",
      model: modelId,
      tools,
      agents: [],
      slashCommands,
      mcpServers: lastYoumiPluginApply.mcpServers.map((name) => ({ name, status: "configured" })),
    }),
  })

  const ensureThinkingId = () => {
    if (!thinkingMessageId) thinkingMessageId = `youmi-think-${++messageSeq}`
    return thinkingMessageId
  }

  const ensureTextId = () => {
    if (!textMessageId) textMessageId = `youmi-text-${++messageSeq}`
    return textMessageId
  }

  const pushDelta = (kind: "thinking" | "assistant_text", messageId: string, text: string) => {
    if (!text) return
    queue.push({
      type: "transcript",
      entry: timestamped({ kind, messageId, text }),
    })
  }

  const appendThinking = (chunk: string) => {
    if (!chunk) return
    thinkingBuffer += chunk
    pushDelta("thinking", ensureThinkingId(), chunk)
  }

  const appendText = (chunk: string) => {
    if (!chunk) return
    textBuffer += chunk
    pushDelta("assistant_text", ensureTextId(), chunk)
  }

  const settleStreamed = (kind: "thinking" | "text", full: string) => {
    if (kind === "thinking") {
      if (full && thinkingBuffer && full.startsWith(thinkingBuffer)) {
        appendThinking(full.slice(thinkingBuffer.length))
      } else if (full && !thinkingBuffer) {
        appendThinking(full)
      } else if (full && thinkingBuffer && !full.startsWith(thinkingBuffer) && !thinkingBuffer.startsWith(full)) {
        appendThinking(full)
      }
      thinkingBuffer = ""
      thinkingMessageId = null
      return
    }
    if (full && textBuffer && full.startsWith(textBuffer)) {
      appendText(full.slice(textBuffer.length))
    } else if (full && !textBuffer) {
      appendText(full)
    } else if (full && textBuffer && !full.startsWith(textBuffer) && !textBuffer.startsWith(full)) {
      appendText(full)
    }
    textBuffer = ""
    textMessageId = null
  }

  const closeOpenBlocks = () => {
    thinkingBuffer = ""
    textBuffer = ""
    thinkingMessageId = null
    textMessageId = null
  }

  const handleMessage = (message: OmniMessage) => {
    if (isEventMessage(message)) {
      const type = payloadType(message)
      if (type === "abort") closeOpenBlocks()
      return
    }

    const payload = asRecord(message.payload)
    if (!payload) return
    const type = asString(payload.type)

    if (type === "partial_text") {
      appendText(asString(payload.text) ?? "")
      return
    }
    if (type === "partial_thinking") {
      appendThinking(asString(payload.thinking) ?? "")
      return
    }

    if (isCompleteModelMessage(message)) {
      if (type === "text") {
        thinkingBuffer = ""
        thinkingMessageId = null
        settleStreamed("text", asString(payload.text) ?? "")
        return
      }
      if (type === "thinking") {
        settleStreamed("thinking", asString(payload.thinking) ?? "")
        return
      }
      if (type === "tool_call") {
        closeOpenBlocks()
        const tool = normalizeYoumiToolCall(
          asString(payload.name) ?? "unknown",
          asString(payload.arguments) ?? "{}",
          asString(payload.tool_call_id) ?? `youmi-tool-${++messageSeq}`,
        )
        if (tool) {
          queue.push({
            type: "transcript",
            entry: timestamped({ kind: "tool_call", tool }),
          })
        }
        return
      }
      if (type === "tool_call_output") {
        const toolId = asString(payload.tool_call_id) ?? ""
        queue.push({
          type: "transcript",
          entry: timestamped({
            kind: "tool_result",
            toolId,
            content: asString(payload.output) ?? "",
            isError: asString(payload.stop_reason) === "failed"
              || asString(payload.stop_reason) === "error",
          }),
        })
      }
    }
  }

  return {
    provider: "youmi",
    stream: queue,
    sessionId: session.sessionId,
    interrupt: async () => {
      abortByTurn.current?.abort()
    },
    close: () => {
      if (closed) return
      closed = true
      abortByTurn.current?.abort()
      try {
        session.dispose()
      } catch {
        // ignore dispose races
      }
      queue.finish()
    },
    sendPrompt: async (content: string) => {
      if (closed) return
      const startedAt = Date.now()
      const controller = new AbortController()
      abortByTurn.current = controller
      textBuffer = ""
      thinkingBuffer = ""
      thinkingMessageId = null
      textMessageId = null
      try {
        for await (const message of session.run([userText(content)], {
          signal: controller.signal,
          approve: async () => "allow",
        })) {
          if (closed) break
          handleMessage(message)
        }
        closeOpenBlocks()
        if (!closed) {
          messageSeq += 1
          queue.push({
            type: "transcript",
            entry: timestamped({
              kind: "result",
              subtype: controller.signal.aborted ? "error" : "success",
              isError: controller.signal.aborted,
              success: !controller.signal.aborted,
              result: controller.signal.aborted ? "interrupted" : "end_turn",
              durationMs: Date.now() - startedAt,
            }),
          })
        }
      } catch (error) {
        if (closed) return
        closeOpenBlocks()
        messageSeq += 1
        const message = error instanceof Error ? error.message : String(error)
        queue.push({
          type: "transcript",
          entry: timestamped({
            kind: "result",
            subtype: "error",
            isError: true,
            success: false,
            result: message || "Youmi 引擎运行失败",
            durationMs: Date.now() - startedAt,
          }),
        })
      } finally {
        if (abortByTurn.current === controller) {
          abortByTurn.current = null
        }
      }
    },
  }
}

/** 可读错误：缺依赖 / 初始化失败时给中文提示。 */
export function formatYoumiStartupError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  if (/DEEPSEEK_API_KEY|api.?key|credential|auth/i.test(message)) {
    return "Youmi 需要 DeepSeek API Key。请在「设置 → 模型服务」中填写，或设置环境变量 DEEPSEEK_API_KEY。"
  }
  if (/Cannot find module|ERR_MODULE_NOT_FOUND|penguin-core/i.test(message)) {
    return "Youmi 依赖未安装（@prismshadow/penguin-core）。请在项目目录执行 bun install 后重试。"
  }
  return message || "Youmi（PenguinHarness）启动失败"
}