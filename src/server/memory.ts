import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { getMemoriesDir, getSettingsFilePath } from "../shared/branding"
import type { TranscriptEntry } from "../shared/types"
import { asRecord, asString } from "../shared/json"

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
/** 每个项目最多保留的回合摘要条数。 */
const MEMORY_MAX_PROJECT_NOTES = 12

let memoryCache: { key: string; builtAt: number; hint: string } | null = null

export interface MemorySettings {
  enabled: boolean
  maxChats: number
}

/** 事件存储的最小读取接口（memory 不依赖 EventStore 具体实现，便于测试）。 */
export interface MemoryStoreLike {
  listProjects(): Array<{ id: string }>
  listChatsByProject(projectId: string): Array<{ id: string; title: string; lastMessageAt?: number }>
  getMessages(chatId: string): TranscriptEntry[]
  getChat?(chatId: string): { id: string; projectId: string; title: string } | null | undefined
}

export interface TurnMemoryNote {
  at: number
  chatId: string
  title: string
  user: string
  assistant: string
  files: string[]
}

interface ProjectMemoryFile {
  version: 1
  projectId: string
  notes: TurnMemoryNote[]
}

export interface LoadMemoryOptions {
  projectId?: string
  excludeChatId?: string
  memoriesDir?: string
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

function safeProjectFileName(projectId: string): string {
  return projectId.replace(/[^a-zA-Z0-9._-]/g, "_") || "project"
}

export function projectMemoryFilePath(projectId: string, memoriesDir?: string): string {
  return join(memoriesDir ?? getMemoriesDir(homedir()), `${safeProjectFileName(projectId)}.json`)
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

export function buildProjectMemoryText(notes: TurnMemoryNote[], maxNotes = MEMORY_MAX_PROJECT_NOTES): string {
  const blocks: string[] = []
  for (const note of notes.slice(-maxNotes)) {
    const lines = [
      `[回合] ${truncate(note.title, 80)}`,
      `用户：${truncate(note.user, MEMORY_ENTRY_MAX_CHARS)}`,
    ]
    if (note.assistant) lines.push(`结论：${truncate(note.assistant, MEMORY_ENTRY_MAX_CHARS)}`)
    if (note.files.length > 0) lines.push(`文件：${note.files.slice(0, 8).join(", ")}`)
    blocks.push(lines.join("\n"))
  }
  return blocks.join("\n\n")
}

/** 包装成 agent 可读的 system 提示块；记忆为空时返回空串（不注入）。 */
export function buildMemorySystemHint(memoryText: string): string {
  const trimmed = memoryText.trim()
  if (!trimmed) return ""
  return [
    "<system-message>",
    "以下是本机记忆（实验功能），仅作为背景参考：",
    trimmed,
    "不要臆测用户没有提到的内容；只有与当前任务相关时才参考这些记忆。",
    "</system-message>",
  ].join("\n")
}

function toolFilePath(entry: TranscriptEntry): string | null {
  if (entry.kind !== "tool_call") return null
  const tool = asRecord((entry as { tool?: unknown }).tool)
  if (!tool) return null
  const name = asString(tool.toolName) ?? asString(tool.toolKind) ?? ""
  if (!/^(Write|Edit|write_file|edit_file)$/i.test(name)) return null
  const input = asRecord(tool.input) ?? {}
  const path = asString(input.file_path) ?? asString(input.path)
  return path && path.trim() ? path.trim() : null
}

/** 从一轮 transcript 抽出一条项目记忆（纯函数；没有用户话则返回 null）。 */
export function extractTurnMemory(
  entries: TranscriptEntry[],
  meta: { chatId: string; title: string; at?: number },
): TurnMemoryNote | null {
  let lastUserIndex = -1
  for (let i = entries.length - 1; i >= 0; i--) {
    if (entries[i]?.kind === "user_prompt" && !entries[i]?.hidden) {
      lastUserIndex = i
      break
    }
  }
  if (lastUserIndex < 0) return null
  const userEntry = entries[lastUserIndex]
  const user = userEntry && userEntry.kind === "user_prompt" && typeof userEntry.content === "string"
    ? userEntry.content
    : ""
  if (!user.trim()) return null

  const assistantParts: string[] = []
  const files: string[] = []
  for (let i = lastUserIndex + 1; i < entries.length; i++) {
    const entry = entries[i]
    if (!entry || entry.hidden) continue
    if (entry.kind === "user_prompt") break
    if (entry.kind === "assistant_text" && typeof entry.text === "string" && entry.text.trim()) {
      assistantParts.push(entry.text.trim())
    }
    const filePath = toolFilePath(entry)
    if (filePath && !files.includes(filePath)) files.push(filePath)
  }

  return {
    at: meta.at ?? Date.now(),
    chatId: meta.chatId,
    title: meta.title,
    user: truncate(user, MEMORY_ENTRY_MAX_CHARS),
    assistant: truncate(assistantParts.join(" ").trim(), MEMORY_ENTRY_MAX_CHARS),
    files: files.slice(0, 12),
  }
}

export function readProjectMemoryNotes(projectId: string, memoriesDir?: string): TurnMemoryNote[] {
  try {
    const filePath = projectMemoryFilePath(projectId, memoriesDir)
    if (!existsSync(filePath)) return []
    const parsed = JSON.parse(readFileSync(filePath, "utf8")) as Partial<ProjectMemoryFile>
    if (!Array.isArray(parsed.notes)) return []
    return parsed.notes.filter((note): note is TurnMemoryNote => {
      return Boolean(note && typeof note === "object" && typeof note.user === "string")
    })
  } catch {
    return []
  }
}

export function appendProjectMemoryNote(
  projectId: string,
  note: TurnMemoryNote,
  memoriesDir?: string,
  maxNotes = MEMORY_MAX_PROJECT_NOTES,
): TurnMemoryNote[] {
  const existing = readProjectMemoryNotes(projectId, memoriesDir)
  const notes = [...existing, note].slice(-maxNotes)
  const root = memoriesDir ?? getMemoriesDir(homedir())
  mkdirSync(root, { recursive: true })
  const payload: ProjectMemoryFile = { version: 1, projectId, notes }
  writeFileSync(projectMemoryFilePath(projectId, memoriesDir), `${JSON.stringify(payload, null, 2)}\n`, "utf8")
  memoryCache = null
  return notes
}

/** 回合成功结束后写入项目记忆。失败只吞掉，绝不影响主流程。 */
export function persistTurnMemoryFromChat(
  store: MemoryStoreLike,
  chatId: string,
  memoriesDir?: string,
): void {
  try {
    if (!resolveMemorySettings().enabled) return
    const chat = store.getChat?.(chatId)
    if (!chat) return
    const note = extractTurnMemory(store.getMessages(chatId), {
      chatId,
      title: chat.title || "未命名会话",
    })
    if (!note) return
    appendProjectMemoryNote(chat.projectId, note, memoriesDir)
  } catch {
    // 记忆失败只影响增强，绝不影响主流程。
  }
}

/** 从事件存储读取最近的历史对话并生成记忆提示（60s 缓存；未启用或出错时返回空串）。 */
export async function loadMemorySystemHint(
  store: MemoryStoreLike,
  options: LoadMemoryOptions = {},
): Promise<string> {
  const settings = resolveMemorySettings()
  if (!settings.enabled) return ""
  const cacheKey = `${options.projectId ?? ""}:${options.excludeChatId ?? ""}:${options.memoriesDir ?? ""}`
  if (memoryCache && memoryCache.key === cacheKey && Date.now() - memoryCache.builtAt < MEMORY_CACHE_TTL_MS) {
    return memoryCache.hint
  }
  try {
    const sections: string[] = []
    if (options.projectId) {
      const projectText = buildProjectMemoryText(readProjectMemoryNotes(options.projectId, options.memoriesDir))
      if (projectText) {
        sections.push(`项目记忆（本仓库近期回合摘要）：\n${projectText}`)
      }
    }

    const chats: Array<{ id: string; title: string; lastMessageAt?: number }> = []
    for (const project of store.listProjects()) {
      for (const chat of store.listChatsByProject(project.id)) {
        if (chat.id === options.excludeChatId) continue
        chats.push(chat)
      }
    }
    chats.sort((a, b) => (b.lastMessageAt ?? 0) - (a.lastMessageAt ?? 0))
    const recentText = buildMemoryText(
      chats.slice(0, settings.maxChats).map((chat) => ({
        title: chat.title,
        entries: store.getMessages(chat.id),
      })),
      settings.maxChats,
    )
    if (recentText) {
      sections.push(`其他会话片段：\n${recentText}`)
    }

    const hint = buildMemorySystemHint(sections.join("\n\n"))
    memoryCache = { key: cacheKey, builtAt: Date.now(), hint }
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
