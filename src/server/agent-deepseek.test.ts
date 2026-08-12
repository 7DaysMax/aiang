import { describe, expect, mock, test } from "bun:test"
import type { TranscriptEntry } from "../shared/types"

// Aiang DeepSeek 通道 = vendored ccb 引擎（claude-code-best）。这里把 key 解析
// mock 掉，让 "未配置 API Key" 的失败路径可确定性地测试，不依赖本机
// ~/.aiang 配置；其它导出（failedDeepSeekTurn 等）保持真实实现。
const actualDeepseek = await import("./deepseek-agent")
mock.module("./deepseek-agent", () => ({
  ...actualDeepseek,
  resolveDeepSeekApiKey: () => null,
}))

const { AgentCoordinator } = await import("./agent")
const { MISSING_DEEPSEEK_KEY_MESSAGE } = actualDeepseek

async function waitFor(condition: () => boolean, timeoutMs = 2000) {
  const start = Date.now()
  while (!condition()) {
    if (Date.now() - start > timeoutMs) throw new Error("Timed out waiting for condition")
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

function createFakeChat(id: string, projectId: string, title = "New Chat") {
  return {
    id,
    projectId,
    title,
    provider: null as "claude" | "codex" | "deepseek" | null,
    planMode: false,
    autoPlan: false,
    sessionToken: null as string | null,
    pendingForkSessionToken: null as string | null,
  }
}

/** agent.test.ts createFakeStore 的同款实现，但 recordTurnFailed 记录失败原因。 */
function createFakeStore(options?: {
  chats?: ReturnType<typeof createFakeChat>[]
  projects?: { id: string; localPath: string }[]
}) {
  const chats = options?.chats ?? [createFakeChat("chat-1", "project-1")]
  const projects = options?.projects ?? [{ id: "project-1", localPath: "/tmp/project" }]
  const chatsById = new Map(chats.map((entry) => [entry.id, entry]))
  const projectsById = new Map(projects.map((entry) => [entry.id, entry]))
  const chat = chats[0]!
  function requireChat(chatId: string) {
    const found = chatsById.get(chatId)
    if (!found) throw new Error(`Chat not found: ${chatId}`)
    return found
  }
  return {
    chat,
    turnFinishedCount: 0,
    turnFailedCount: 0,
    failureReasons: [] as string[],
    messages: [] as TranscriptEntry[],
    queuedMessages: [] as any[],
    requireChat,
    getChat(chatId: string) {
      return chatsById.get(chatId) ?? null
    },
    getProject(projectId: string) {
      return projectsById.get(projectId) ?? null
    },
    getTranscriptPath(chatId: string) {
      return `/tmp/transcripts/${chatId}.jsonl`
    },
    getMessages() {
      return this.messages
    },
    async setChatProvider(chatId: string, provider: "claude" | "codex" | "deepseek") {
      requireChat(chatId).provider = provider
    },
    async setPlanMode(chatId: string, planMode: boolean) {
      requireChat(chatId).planMode = planMode
    },
    async setAutoPlan(chatId: string, autoPlan: boolean) {
      requireChat(chatId).autoPlan = autoPlan
    },
    async renameChat(chatId: string, title: string) {
      requireChat(chatId).title = title
    },
    async appendMessage(_chatId: string, entry: TranscriptEntry) {
      this.messages.push(entry)
    },
    async recordTurnStarted() {},
    async recordTurnFinished() {
      this.turnFinishedCount += 1
    },
    async recordTurnFailed(_chatId: string, reason: string) {
      this.turnFailedCount += 1
      this.failureReasons.push(reason)
    },
    async recordTurnCancelled() {},
    async setSessionToken(chatId: string, sessionToken: string | null) {
      requireChat(chatId).sessionToken = sessionToken
    },
    async setPendingForkSessionToken(chatId: string, pendingForkSessionToken: string | null) {
      requireChat(chatId).pendingForkSessionToken = pendingForkSessionToken
    },
    async createChat() {
      return chat
    },
    async forkChat() {
      return {
        ...chat,
        id: "chat-fork-1",
        title: "Fork: New Chat",
        sessionToken: null,
        pendingForkSessionToken: chat.sessionToken ?? chat.pendingForkSessionToken,
      }
    },
    async enqueueMessage(_chatId: string, message: any) {
      const queuedMessage = {
        id: message.id ?? crypto.randomUUID(),
        content: message.content,
        attachments: message.attachments ?? [],
        createdAt: message.createdAt ?? Date.now(),
        provider: message.provider,
        model: message.model,
        modelOptions: message.modelOptions,
        planMode: message.planMode,
      }
      this.queuedMessages.push(queuedMessage)
      return queuedMessage
    },
    getQueuedMessages() {
      return [...this.queuedMessages]
    },
    getQueuedMessage(_chatId: string, queuedMessageId: string) {
      return this.queuedMessages.find((entry) => entry.id === queuedMessageId) ?? null
    },
    async removeQueuedMessage(_chatId: string, queuedMessageId: string) {
      this.queuedMessages = this.queuedMessages.filter((entry) => entry.id !== queuedMessageId)
    },
  }
}

describe("AgentCoordinator deepseek integration", () => {
  test("missing API key records a friendly error result instead of throwing", async () => {
    const store = createFakeStore()
    const coordinator = new AgentCoordinator({
      store: store as never,
      onStateChange: () => {},
    })

    await coordinator.send({
      type: "chat.send",
      projectId: "project-1",
      provider: "deepseek",
      content: "你好",
    })

    await waitFor(() => store.failureReasons.length > 0)

    expect(store.failureReasons).toEqual([MISSING_DEEPSEEK_KEY_MESSAGE])
    expect(store.messages.some(
      (entry) => entry.kind === "result" && entry.result === MISSING_DEEPSEEK_KEY_MESSAGE
    )).toBe(true)
    expect(store.messages.some(
      (entry) => entry.kind === "result" && entry.result === "Agent session was not initialized"
    )).toBe(false)
  })
})
