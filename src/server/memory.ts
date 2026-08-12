import { existsSync, readFileSync } from "node:fs"
import { homedir } from "node:os"
import { getSettingsFilePath } from "../shared/branding"
import type { TranscriptEntry } from "../shared/types"

/** 记忆缓存有效期：60 秒内不重复读盘（避免每次 turn 都扫全量对话）。 */
const MEMORY_CACHE_TTL_MS = 60_000
/** 每个历史对话最多提取的消息条数（用户/助手各计，按时间顺序取尾部）。 */
const MEMORY_ENTRIES_PER_CHAT = 4
/** 单条消息最长保留字符数。 */
const MEMORY_ENTRY_MAX_CHARS = 400
/** 记忆总预算（字符），超出截断。 */
const MEMORY_TOTAL_MAX_CHARS = 6000
const MEMORY_MAX_CHATS_LIMIT = 20
const MEMORY_DEFAULT_MAX_CHATS = 5

let memoryCache: { builtAt: number; hint: string } | null = null

export interface MemorySettings {
  enabled: boolean
  maxChats: number
}

/** 事件存储的最小读取接口（memory 不依赖 EventStore 具体实现，便于测试）。 */
export interface MemoryStoreLike {
  listProjects(): Array<{ id: string }>
  listChatsByProject(projectId: string): Array<{ id: string; title: string; lastMessageAt?: number }>
  getMessages(chatId: string): TranscriptEntry[]
}

/** 读取会话记忆设置（env 覆盖 > 设置文件，与 resolveVisionSettings 同款直读模式）。 */
export function resolveMemorySettings(): MemorySettings {
  let enabled = false
  let maxChats = MEMORY_DEFAULT_MAX_CHATS
  try {
    const settingsPath = getSettingsFilePath(homedir())
    if (existsSync(settingsPath)) {
      const parsed = JSON.parse(readFileSync(settingsPath, "utf8")) as {
        memoryEnabled?: unknown
        memoryMaxChats?: unknown
      }
      enabled = parsed.memoryEnabled === true
      if (typeof parsed.memoryMaxChats === "number" && Number.isFinite(parsed.memoryMaxChats)) {
        maxChats = Math.min(MEMORY_MAX_CHATS_LIMIT, Math.max(1, Math.round(parsed.memoryMaxChats)))
      }
    }
  } catch {
    // 设置文件损坏时按默认值处理，绝不阻塞聊天。
  }
  return { enabled, maxChats }
}

function truncate(text: string, max: number): string {
  const cleaned = text.replace(/\s+/g, " ").trim()
  return cleaned.length > max ? `${cleaned.slice(0, max)}…` : cleaned
}

/** 把若干历史对话压缩成记忆文本（纯函数）。 */
export function buildMemoryText(
  chats: Array<{ title: string; entries: TranscriptEntry[] }>,
  maxChats = MEMORY_DEFAULT_MAX_CHATS,
  totalMaxChars = MEMORY_TOTAL_MAX_CHARS,
): string {
  const blocks: string[] = []
  let budget = totalMaxChars
  for (const chat of chats.slice(0, maxChats)) {
    if (budget <= 0) break
    const lines: string[] = []
    for (const entry of chat.entries) {
      if (entry.hidden) continue
      if (entry.kind === "user_prompt" && typeof entry.content === "string") {
        lines.push(`用户：${truncate(entry.content, MEMORY_ENTRY_MAX_CHARS)}`)
      } else if (entry.kind === "assistant_text" && typeof entry.text === "string") {
        lines.push(`助手：${truncate(entry.text, MEMORY_ENTRY_MAX_CHARS)}`)
      }
      if (lines.length >= MEMORY_ENTRIES_PER_CHAT) break
    }
    if (lines.length === 0) continue
    const block = `[会话] ${truncate(chat.title, 80)}\n${lines.join("\n")}`
    if (block.length >= budget) {
      blocks.push(`${block.slice(0, budget)}…`)
      break
    }
    blocks.push(block)
    budget -= block.length
  }
  return blocks.join("\n\n")
}

/** 包装成 agent 可读的 system 提示块；记忆为空时返回空串（不注入）。 */
export function buildMemorySystemHint(memoryText: string): string {
  const trimmed = memoryText.trim()
  if (!trimmed) return ""
  return [
    "<system-message>",
    "以下是你在本机其他会话中的历史对话记忆（实验功能），仅作为背景参考：",
    trimmed,
    "不要臆测用户没有提到的内容；只有与当前任务相关时才参考这些记忆。",
    "</system-message>",
  ].join("\n")
}

/** 从事件存储读取最近的历史对话并生成记忆提示（60s 缓存；未启用或出错时返回空串）。 */
export async function loadMemorySystemHint(store: MemoryStoreLike): Promise<string> {
  const settings = resolveMemorySettings()
  if (!settings.enabled) return ""
  if (memoryCache && Date.now() - memoryCache.builtAt < MEMORY_CACHE_TTL_MS) {
    return memoryCache.hint
  }
  try {
    const chats: Array<{ id: string; title: string; lastMessageAt?: number }> = []
    for (const project of store.listProjects()) {
      for (const chat of store.listChatsByProject(project.id)) {
        chats.push(chat)
      }
    }
    chats.sort((a, b) => (b.lastMessageAt ?? 0) - (a.lastMessageAt ?? 0))
    const text = buildMemoryText(
      chats.slice(0, settings.maxChats).map((chat) => ({
        title: chat.title,
        entries: store.getMessages(chat.id),
      })),
      settings.maxChats,
    )
    const hint = buildMemorySystemHint(text)
    memoryCache = { builtAt: Date.now(), hint }
    return hint
  } catch {
    // 记忆失败只影响增强，绝不影响主流程。
    return ""
  }
}

/** 测试辅助：清空进程内缓存。 */
export function resetMemoryCacheForTests() {
  memoryCache = null
}
