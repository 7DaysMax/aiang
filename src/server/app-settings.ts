import { randomUUID } from "node:crypto"
import { watch, type FSWatcher } from "node:fs"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import path from "node:path"
import { getSettingsFilePath, LOG_PREFIX } from "../shared/branding"
import { formatDisplayPath } from "./paths"
import {
  mergeProviderDefaultsPatch,
  normalizeProviderDefaults,
  type ProviderPreferenceInput,
} from "../shared/provider-preferences"
import {
  normalizeModelProfiles,
  normalizeThirdPartyAccess,
} from "../shared/model-profile"
import {
  DEFAULT_NEW_PROJECTS_DIRECTORY,
  DEFAULT_BEAUTIFUL_UI_PREFERENCES,
  type AppSettingsPatch,
  type AppSettingsSnapshot,
  type AppThemePreference,
  type ChatSoundId,
  type ChatSoundPreference,
  type DefaultProviderPreference,
  type EditorPreset,
  type VisionServiceSettings,
  type BeautifulUiPreferences,
} from "../shared/types"

interface AppSettingsFile {
  analyticsEnabled?: unknown
  analyticsUserId?: unknown
  browserSettingsMigrated?: unknown
  deepseekApiKey?: unknown
  theme?: unknown
  chatSoundPreference?: unknown
  chatSoundId?: unknown
  terminal?: {
    scrollbackLines?: unknown
    minColumnWidth?: unknown
    webglRenderer?: unknown
  }
  editor?: {
    preset?: unknown
    commandTemplate?: unknown
  }
  beautifulUi?: {
    loading?: unknown
    thinking?: unknown
    taskRows?: unknown
    promptBar?: unknown
    codeBlock?: unknown
  }
  defaultProvider?: unknown
  providerDefaults?: {
    claude?: ProviderPreferenceInput
    codex?: ProviderPreferenceInput
    cursor?: ProviderPreferenceInput
    pi?: ProviderPreferenceInput
  }
  newSidebarEnabled?: unknown
  newProjectsDirectory?: unknown
  setupShown?: unknown
  setupCompleted?: unknown
  setupDismissed?: unknown
  dockMetrics?: {
    balance?: unknown
    cacheHitRate?: unknown
    averageCacheHitRate?: unknown
    sessionTokens?: unknown
    serviceStatus?: unknown
  }
  visionService?: unknown
  memoryEnabled?: unknown
  memoryMaxChats?: unknown
  thirdPartyAccess?: unknown
  activeModelProfileId?: unknown
  modelProfiles?: unknown
}

// devbox is a server-runtime fact (the --cloud flag), not settings state.
interface AppSettingsState extends Omit<AppSettingsSnapshot, "devbox"> {
  analyticsUserId: string
}

interface NormalizedAppSettings {
  payload: AppSettingsState
  warning: string | null
  shouldWrite: boolean
}

const DEFAULT_TERMINAL_SCROLLBACK = 1_000
const MIN_TERMINAL_SCROLLBACK = 500
const MAX_TERMINAL_SCROLLBACK = 5_000
const DEFAULT_TERMINAL_MIN_COLUMN_WIDTH = 450
const MIN_TERMINAL_MIN_COLUMN_WIDTH = 250
const MAX_TERMINAL_MIN_COLUMN_WIDTH = 900
const DEFAULT_EDITOR_PRESET: EditorPreset = "cursor"
const DEFAULT_CHAT_SOUND_PREFERENCE: ChatSoundPreference = "always"
/** 底部栏指标默认全部开启。 */
const DEFAULT_DOCK_METRICS = {
  balance: true,
  cacheHitRate: true,
  averageCacheHitRate: true,
  sessionTokens: true,
  serviceStatus: false,
} as const
const DEFAULT_CHAT_SOUND_ID: ChatSoundId = "funk"

function createAnalyticsUserId() {
  return `anon_${randomUUID()}`
}

function getDefaultEditorCommandTemplate(preset: EditorPreset) {
  switch (preset) {
    case "vscode":
      return "code {path}"
    case "xcode":
      return "xed {path}"
    case "windsurf":
      return "windsurf {path}"
    case "custom":
    case "cursor":
    default:
      return "cursor {path}"
  }
}

function clampNumber(value: unknown, fallback: number, min: number, max: number) {
  const numberValue = typeof value === "number" ? value : Number(value)
  if (!Number.isFinite(numberValue)) return fallback
  return Math.min(max, Math.max(min, Math.round(numberValue)))
}

function normalizeTheme(value: unknown): AppThemePreference {
  return value === "light" || value === "dark" || value === "system" ? value : "system"
}

function normalizeChatSoundPreference(value: unknown): ChatSoundPreference {
  return value === "never" || value === "unfocused" || value === "always" ? value : DEFAULT_CHAT_SOUND_PREFERENCE
}

function normalizeChatSoundId(value: unknown): ChatSoundId {
  switch (value) {
    case "blow":
    case "bottle":
    case "frog":
    case "funk":
    case "glass":
    case "ping":
    case "pop":
    case "purr":
    case "tink":
      return value
    default:
      return DEFAULT_CHAT_SOUND_ID
  }
}

function normalizeDefaultProvider(value: unknown): DefaultProviderPreference {
  return value === "claude" || value === "codex" || value === "cursor" || value === "pi" || value === "deepseek" || value === "reasonix" || value === "youmi" || value === "last_used"
    ? value
    : "last_used"
}

function normalizeEditorPreset(value: unknown): EditorPreset {
  return value === "vscode" || value === "xcode" || value === "windsurf" || value === "custom" || value === "cursor"
    ? value
    : DEFAULT_EDITOR_PRESET
}

function normalizeEditorCommandTemplate(value: unknown, preset: EditorPreset) {
  const trimmed = typeof value === "string" ? value.trim() : ""
  return trimmed || getDefaultEditorCommandTemplate(preset)
}

function normalizeDockMetrics(value: unknown): AppSettingsSnapshot["dockMetrics"] {
  const record = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
  return {
    balance: record?.balance === undefined ? DEFAULT_DOCK_METRICS.balance : record.balance === true,
    cacheHitRate: record?.cacheHitRate === undefined ? DEFAULT_DOCK_METRICS.cacheHitRate : record.cacheHitRate === true,
    averageCacheHitRate: record?.averageCacheHitRate === undefined
      ? DEFAULT_DOCK_METRICS.averageCacheHitRate
      : record.averageCacheHitRate === true,
    sessionTokens: record?.sessionTokens === undefined ? DEFAULT_DOCK_METRICS.sessionTokens : record.sessionTokens === true,
    serviceStatus: record?.serviceStatus === undefined ? DEFAULT_DOCK_METRICS.serviceStatus : record.serviceStatus === true,
  }
}

function normalizeBeautifulUi(value: unknown): BeautifulUiPreferences {
  const record = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
  return {
    loading: record?.loading === "Dots" || record?.loading === "Orbit" || record?.loading === "Surfer"
      ? record.loading
      : DEFAULT_BEAUTIFUL_UI_PREFERENCES.loading,
    thinking: record?.thinking === "Steps" || record?.thinking === "Search" || record?.thinking === "Coding"
      ? record.thinking
      : DEFAULT_BEAUTIFUL_UI_PREFERENCES.thinking,
    taskRows: record?.taskRows === "Capsules" ? "Capsules" : DEFAULT_BEAUTIFUL_UI_PREFERENCES.taskRows,
    promptBar: record?.promptBar === "Pill" ? "Pill" : DEFAULT_BEAUTIFUL_UI_PREFERENCES.promptBar,
    codeBlock: record?.codeBlock === "Diff" ? "Diff" : DEFAULT_BEAUTIFUL_UI_PREFERENCES.codeBlock,
  }
}

/** 识图服务默认值：千问 VL（DashScope 兼容模式），Key/模型留空由用户填写。 */
const DEFAULT_VISION_SERVICE = {
  enabled: false,
  provider: "qwen",
  apiKey: "",
  baseUrl: "",
  model: "",
} as const

function normalizeVisionService(value: unknown): VisionServiceSettings {
  const record = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
  return {
    enabled: record?.enabled === undefined ? DEFAULT_VISION_SERVICE.enabled : record.enabled === true,
    provider: record?.provider === "glm" ? "glm" : "qwen",
    apiKey: typeof record?.apiKey === "string" ? record.apiKey.trim() : "",
    baseUrl: typeof record?.baseUrl === "string" ? record.baseUrl.trim() : "",
    model: typeof record?.model === "string" ? record.model.trim() : "",
  }
}

function toFilePayload(state: AppSettingsState) {
  return {
    analyticsEnabled: state.analyticsEnabled,
    analyticsUserId: state.analyticsUserId,
    browserSettingsMigrated: state.browserSettingsMigrated,
    deepseekApiKey: state.deepseekApiKey,
    theme: state.theme,
    chatSoundPreference: state.chatSoundPreference,
    chatSoundId: state.chatSoundId,
    terminal: state.terminal,
    editor: state.editor,
    beautifulUi: state.beautifulUi,
    defaultProvider: state.defaultProvider,
    providerDefaults: state.providerDefaults,
    newSidebarEnabled: state.newSidebarEnabled,
    newProjectsDirectory: state.newProjectsDirectory,
    setupShown: state.setupShown,
    setupCompleted: state.setupCompleted,
    setupDismissed: state.setupDismissed,
    dockMetrics: state.dockMetrics,
    visionService: state.visionService,
    memoryEnabled: state.memoryEnabled,
    memoryMaxChats: state.memoryMaxChats,
    thirdPartyAccess: state.thirdPartyAccess,
    activeModelProfileId: state.activeModelProfileId,
    modelProfiles: state.modelProfiles,
  }
}

function toSnapshot(state: AppSettingsState, devbox = false): AppSettingsSnapshot {
  return {
    devbox,
    analyticsEnabled: state.analyticsEnabled,
    browserSettingsMigrated: state.browserSettingsMigrated,
    deepseekApiKey: state.deepseekApiKey,
    theme: state.theme,
    chatSoundPreference: state.chatSoundPreference,
    chatSoundId: state.chatSoundId,
    terminal: state.terminal,
    editor: state.editor,
    beautifulUi: state.beautifulUi,
    defaultProvider: state.defaultProvider,
    providerDefaults: state.providerDefaults,
    newSidebarEnabled: state.newSidebarEnabled,
    newProjectsDirectory: state.newProjectsDirectory,
    setupShown: state.setupShown,
    setupCompleted: state.setupCompleted,
    setupDismissed: state.setupDismissed,
    dockMetrics: state.dockMetrics,
    visionService: state.visionService,
    memoryEnabled: state.memoryEnabled,
    memoryMaxChats: state.memoryMaxChats,
    thirdPartyAccess: state.thirdPartyAccess,
    activeModelProfileId: state.activeModelProfileId,
    modelProfiles: state.modelProfiles,
    warning: state.warning,
    filePathDisplay: state.filePathDisplay,
  }
}

function normalizeAppSettings(
  value: unknown,
  filePath = getSettingsFilePath(homedir())
): NormalizedAppSettings {
  const source = value && typeof value === "object" && !Array.isArray(value)
    ? value as AppSettingsFile
    : null
  const warnings: string[] = []

  if (value !== undefined && value !== null && !source) {
    warnings.push("Settings file must contain a JSON object")
  }

  const analyticsEnabled = typeof source?.analyticsEnabled === "boolean" ? source.analyticsEnabled : true
  if (source?.analyticsEnabled !== undefined && typeof source.analyticsEnabled !== "boolean") {
    warnings.push("analyticsEnabled must be a boolean")
  }

  const rawAnalyticsUserId = typeof source?.analyticsUserId === "string" ? source.analyticsUserId.trim() : ""
  if (source?.analyticsUserId !== undefined && typeof source.analyticsUserId !== "string") {
    warnings.push("analyticsUserId must be a string")
  }
  const analyticsUserId = rawAnalyticsUserId || createAnalyticsUserId()
  if (!rawAnalyticsUserId && source?.analyticsUserId !== undefined) {
    warnings.push("analyticsUserId must be a non-empty string")
  }

  const rawDeepSeekApiKey = typeof source?.deepseekApiKey === "string" ? source.deepseekApiKey.trim() : ""
  if (source?.deepseekApiKey !== undefined && typeof source.deepseekApiKey !== "string") {
    warnings.push("deepseekApiKey must be a string")
  }

  const rawVisionService = normalizeVisionService(source?.visionService)
  if (
    source?.visionService !== undefined
    && (!source.visionService || typeof source.visionService !== "object" || Array.isArray(source.visionService))
  ) {
    warnings.push("visionService must be an object")
  }

  // New Sidebar ships enabled; an explicit false opts back into the legacy sidebar.
  const newSidebarEnabled = typeof source?.newSidebarEnabled === "boolean"
    ? source.newSidebarEnabled
    : true
  if (source?.newSidebarEnabled !== undefined && typeof source.newSidebarEnabled !== "boolean") {
    warnings.push("newSidebarEnabled must be a boolean")
  }

  // Labs: 会话记忆默认关闭；最多参考对话数限制在 1-20。
  const memoryEnabled = source?.memoryEnabled === true
  if (source?.memoryEnabled !== undefined && typeof source.memoryEnabled !== "boolean") {
    warnings.push("memoryEnabled must be a boolean")
  }
  const memoryMaxChats = clampNumber(source?.memoryMaxChats, 5, 1, 20)
  if (source?.memoryMaxChats !== undefined && typeof source.memoryMaxChats !== "number") {
    warnings.push("memoryMaxChats must be a number")
  }

  const thirdPartyAccess = normalizeThirdPartyAccess(source?.thirdPartyAccess)
  if (source?.thirdPartyAccess !== undefined && source.thirdPartyAccess !== "official" && source.thirdPartyAccess !== "relay") {
    warnings.push("thirdPartyAccess must be official or relay")
  }
  const modelProfiles = normalizeModelProfiles(source?.modelProfiles)
  if (source?.modelProfiles !== undefined && !Array.isArray(source.modelProfiles)) {
    warnings.push("modelProfiles must be an array")
  }
  const rawActiveProfileId = typeof source?.activeModelProfileId === "string"
    ? source.activeModelProfileId.trim()
    : ""
  const activeModelProfileId = rawActiveProfileId && modelProfiles.some((profile) => profile.id === rawActiveProfileId)
    ? rawActiveProfileId
    : (modelProfiles[0]?.id ?? null)

  const rawNewProjectsDirectory = typeof source?.newProjectsDirectory === "string"
    ? source.newProjectsDirectory.trim()
    : ""
  const newProjectsDirectory = rawNewProjectsDirectory || DEFAULT_NEW_PROJECTS_DIRECTORY
  if (source?.newProjectsDirectory !== undefined && !rawNewProjectsDirectory) {
    warnings.push("newProjectsDirectory must be a non-empty string")
  }

  const editorPreset = normalizeEditorPreset(source?.editor?.preset)
  const state: AppSettingsState = {
    analyticsEnabled,
    analyticsUserId,
    browserSettingsMigrated: source?.browserSettingsMigrated === true,
    deepseekApiKey: rawDeepSeekApiKey,
    theme: normalizeTheme(source?.theme),
    chatSoundPreference: normalizeChatSoundPreference(source?.chatSoundPreference),
    chatSoundId: normalizeChatSoundId(source?.chatSoundId),
    terminal: {
      scrollbackLines: clampNumber(source?.terminal?.scrollbackLines, DEFAULT_TERMINAL_SCROLLBACK, MIN_TERMINAL_SCROLLBACK, MAX_TERMINAL_SCROLLBACK),
      minColumnWidth: clampNumber(source?.terminal?.minColumnWidth, DEFAULT_TERMINAL_MIN_COLUMN_WIDTH, MIN_TERMINAL_MIN_COLUMN_WIDTH, MAX_TERMINAL_MIN_COLUMN_WIDTH),
      webglRenderer: source?.terminal?.webglRenderer === true,
    },
    editor: {
      preset: editorPreset,
      commandTemplate: normalizeEditorCommandTemplate(source?.editor?.commandTemplate, editorPreset),
    },
    beautifulUi: normalizeBeautifulUi(source?.beautifulUi),
    defaultProvider: normalizeDefaultProvider(source?.defaultProvider),
    providerDefaults: normalizeProviderDefaults(source?.providerDefaults),
    newSidebarEnabled,
    newProjectsDirectory,
    // Onboarding markers default to false so a machine that has never run the
    // wizard still gets it; once set they stay set for every browser.
    setupShown: source?.setupShown === true,
    setupCompleted: source?.setupCompleted === true,
    setupDismissed: source?.setupDismissed === true,
    dockMetrics: normalizeDockMetrics(source?.dockMetrics),
    visionService: rawVisionService,
    memoryEnabled,
    memoryMaxChats,
    thirdPartyAccess,
    activeModelProfileId,
    modelProfiles,
    warning: null,
    filePathDisplay: formatDisplayPath(filePath),
  }

  const shouldWrite = JSON.stringify(source ? toComparablePayload(source) : null) !== JSON.stringify(toFilePayload(state))
  state.warning = warnings.length > 0
    ? `Some settings were reset to defaults: ${warnings.join("; ")}`
    : null

  return {
    payload: state,
    warning: state.warning,
    shouldWrite,
  }
}

function toComparablePayload(source: AppSettingsFile) {
  return {
    analyticsEnabled: source.analyticsEnabled,
    analyticsUserId: typeof source.analyticsUserId === "string" ? source.analyticsUserId.trim() : source.analyticsUserId,
    browserSettingsMigrated: source.browserSettingsMigrated,
    deepseekApiKey: typeof source.deepseekApiKey === "string" ? source.deepseekApiKey.trim() : source.deepseekApiKey,
    theme: source.theme,
    chatSoundPreference: source.chatSoundPreference,
    chatSoundId: source.chatSoundId,
    terminal: source.terminal,
    editor: source.editor,
    beautifulUi: source.beautifulUi,
    defaultProvider: source.defaultProvider,
    providerDefaults: source.providerDefaults,
    newSidebarEnabled: source.newSidebarEnabled,
    newProjectsDirectory: typeof source.newProjectsDirectory === "string"
      ? source.newProjectsDirectory.trim()
      : source.newProjectsDirectory,
    setupShown: source.setupShown,
    setupCompleted: source.setupCompleted,
    setupDismissed: source.setupDismissed,
    dockMetrics: source.dockMetrics,
    visionService: source.visionService,
    memoryEnabled: source.memoryEnabled,
    memoryMaxChats: source.memoryMaxChats,
    thirdPartyAccess: source.thirdPartyAccess,
    activeModelProfileId: source.activeModelProfileId,
    modelProfiles: source.modelProfiles,
  }
}

function applyPatch(state: AppSettingsState, patch: AppSettingsPatch): AppSettingsState {
  return normalizeAppSettings({
    ...toFilePayload(state),
    ...patch,
    terminal: {
      ...state.terminal,
      ...patch.terminal,
    },
    editor: {
      ...state.editor,
      ...patch.editor,
    },
    beautifulUi: {
      ...state.beautifulUi,
      ...patch.beautifulUi,
    },
    providerDefaults: mergeProviderDefaultsPatch(state.providerDefaults, patch.providerDefaults),
    dockMetrics: {
      ...state.dockMetrics,
      ...patch.dockMetrics,
    },
    visionService: {
      ...state.visionService,
      ...patch.visionService,
    },
  }, state.filePathDisplay).payload
}

export async function readAppSettingsSnapshot(filePath = getSettingsFilePath(homedir())) {
  try {
    const text = await readFile(filePath, "utf8")
    if (!text.trim()) {
      const normalized = normalizeAppSettings(undefined, filePath)
      return {
        ...toSnapshot(normalized.payload),
        warning: "Settings file was empty. Using defaults.",
      } satisfies AppSettingsSnapshot
    }

    return toSnapshot(normalizeAppSettings(JSON.parse(text), filePath).payload)
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") {
      return toSnapshot(normalizeAppSettings(undefined, filePath).payload)
    }
    if (error instanceof SyntaxError) {
      return {
        ...toSnapshot(normalizeAppSettings(undefined, filePath).payload),
        warning: "Settings file is invalid JSON. Using defaults.",
      } satisfies AppSettingsSnapshot
    }
    throw error
  }
}

export class AppSettingsManager {
  readonly filePath: string
  private watcher: FSWatcher | null = null
  private state: AppSettingsState
  private readonly listeners = new Set<(snapshot: AppSettingsSnapshot) => void>()
  /** Server-computed snapshot fields — never read from or written to the file. */
  private readonly extras: { devbox: boolean }

  constructor(filePath = getSettingsFilePath(homedir()), extras: { devbox?: boolean } = {}) {
    this.filePath = filePath
    this.state = normalizeAppSettings(undefined, filePath).payload
    this.extras = { devbox: extras.devbox === true }
  }

  async initialize() {
    await mkdir(path.dirname(this.filePath), { recursive: true })
    await this.reload({ persistNormalized: true })
    this.startWatching()
  }

  dispose() {
    this.watcher?.close()
    this.watcher = null
    this.listeners.clear()
  }

  getSnapshot() {
    return toSnapshot(this.state, this.extras.devbox)
  }

  getState() {
    return this.state
  }

  onChange(listener: (snapshot: AppSettingsSnapshot) => void) {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  async reload(options?: { persistNormalized?: boolean }) {
    const nextState = await this.readState(options)
    this.setState(nextState)
  }

  async write(value: { analyticsEnabled: boolean }) {
    return this.writePatch({ analyticsEnabled: value.analyticsEnabled })
  }

  async writePatch(patch: AppSettingsPatch) {
    const nextState = {
      ...applyPatch(this.state, patch),
      warning: null,
      filePathDisplay: formatDisplayPath(this.filePath),
    }
    await mkdir(path.dirname(this.filePath), { recursive: true })
    await writeFile(this.filePath, `${JSON.stringify(toFilePayload(nextState), null, 2)}\n`, "utf8")
    this.setState(nextState)
    return toSnapshot(nextState, this.extras.devbox)
  }

  private async readState(options?: { persistNormalized?: boolean }) {
    const file = Bun.file(this.filePath)

    try {
      const text = await file.text()
      const hasText = text.trim().length > 0
      const normalized = normalizeAppSettings(hasText ? JSON.parse(text) : undefined, this.filePath)
      if (options?.persistNormalized && (!hasText || normalized.shouldWrite)) {
        await writeFile(this.filePath, `${JSON.stringify(toFilePayload(normalized.payload), null, 2)}\n`, "utf8")
      }
      return {
        ...normalized.payload,
        warning: !hasText ? "Settings file was empty. Using defaults." : normalized.warning,
      } satisfies AppSettingsState
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code !== "ENOENT" && !(error instanceof SyntaxError)) {
        throw error
      }

      const normalized = normalizeAppSettings(undefined, this.filePath)
      if (options?.persistNormalized) {
        await writeFile(this.filePath, `${JSON.stringify(toFilePayload(normalized.payload), null, 2)}\n`, "utf8")
      }
      return {
        ...normalized.payload,
        warning: error instanceof SyntaxError ? "Settings file is invalid JSON. Using defaults." : null,
      } satisfies AppSettingsState
    }
  }

  private setState(state: AppSettingsState) {
    this.state = state
    const snapshot = toSnapshot(state, this.extras.devbox)
    for (const listener of this.listeners) {
      listener(snapshot)
    }
  }

  private startWatching() {
    this.watcher?.close()
    try {
      this.watcher = watch(path.dirname(this.filePath), { persistent: false }, (_eventType, filename) => {
        if (filename && filename !== path.basename(this.filePath)) {
          return
        }
        void this.reload().catch((error: unknown) => {
          console.warn(`${LOG_PREFIX} Failed to reload settings:`, error)
        })
      })
    } catch (error) {
      console.warn(`${LOG_PREFIX} Failed to watch settings file:`, error)
      this.watcher = null
    }
  }
}
