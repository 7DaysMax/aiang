import { create } from "zustand"
import {
  chatModeToFlags,
  type AgentProvider,
  type ChatMode,
  type ChatProviderPreferences,
  type ClaudeModelOptions,
  type CodexModelOptions,
  type CursorModelOptions,
  type DefaultProviderPreference,
  type PiModelOptions,
  type ProviderPreference,
  type ProviderModelOptionsByProvider,
} from "../../shared/types"
import {
  CHAT_COLLABORATION_STORAGE_KEY,
  CHAT_IMPLEMENTATION_PROVIDER_STORAGE_KEY,
  CHAT_REVIEW_PROVIDER_STORAGE_KEY,
} from "../lib/storageKeys"
import {
  createDefaultProviderDefaults,
  normalizeClaudePreference,
  normalizeCodexPreference,
  normalizeCursorPreference,
  normalizePiPreference,
  normalizeProviderDefaults,
  normalizeProviderPreference,
  PROVIDER_NORMALIZERS,
  type ProviderModelOptionsInput,
  type ProviderPreferenceInput,
} from "../../shared/provider-preferences"

export type { ChatProviderPreferences, DefaultProviderPreference, ProviderPreference }
// The normalizers live in shared/provider-preferences (also used by the server's
// settings-file normalization); re-exported here for existing importers/tests.
export {
  createDefaultProviderDefaults,
  normalizeClaudePreference,
  normalizeCodexPreference,
  normalizeCursorPreference,
  normalizePiPreference,
  normalizeProviderDefaults,
  normalizeProviderPreference,
}

export type ComposerState = {
  [TProvider in AgentProvider]: {
    provider: TProvider
    model: string
    modelOptions: ProviderModelOptionsByProvider[TProvider]
    planMode: boolean
    autoPlan: boolean
  }
}[AgentProvider]

export const NEW_CHAT_COMPOSER_ID = "__new__"

export function normalizeDefaultProvider(value?: string): DefaultProviderPreference {
  if (value === "claude" || value === "codex" || value === "cursor" || value === "pi" || value === "deepseek" || value === "reasonix" || value === "youmi") return value
  if (value === "last_used") return value
  return "last_used"
}

function composerStateForProvider(provider: AgentProvider, value?: ProviderPreferenceInput): ComposerState {
  // The normalizer record is keyed by provider, so the provider tag always matches
  // its normalized modelOptions shape; TS can't prove that across the union.
  return { provider, ...normalizeProviderPreference(provider, value) } as ComposerState
}

type PersistedComposerState = ProviderPreferenceInput & { provider: AgentProvider }

type LegacyPersistedChatPreferencesState = Partial<{
  defaultProvider: string
  providerDefaults: Partial<Record<AgentProvider, ProviderPreferenceInput>>
  composerState: PersistedComposerState
  liveProvider: AgentProvider
  livePreferences: Partial<Record<"claude" | "codex", ProviderPreferenceInput>>
}>

type PersistedChatPreferencesState = LegacyPersistedChatPreferencesState & Partial<{
  chatStates: Record<string, PersistedComposerState | ComposerState>
  legacyComposerState: PersistedComposerState | ComposerState | null
}>

function readCollaborationByChatId(): Record<string, boolean> {
  try {
    if (typeof localStorage === "undefined") return {}
    const raw = localStorage.getItem(CHAT_COLLABORATION_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {}
    const next: Record<string, boolean> = {}
    for (const [chatId, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === "boolean") next[chatId] = value
    }
    return next
  } catch {
    return {}
  }
}

function writeCollaborationByChatId(value: Record<string, boolean>) {
  try {
    if (typeof localStorage === "undefined") return
    localStorage.setItem(CHAT_COLLABORATION_STORAGE_KEY, JSON.stringify(value))
  } catch {
    // quota / private mode — keep the in-memory map either way
  }
}

function withCollaborationValue(
  current: Record<string, boolean>,
  chatId: string,
  enabled: boolean,
): Record<string, boolean> | null {
  if (enabled) {
    if (current[chatId] === true) return null
    return { ...current, [chatId]: true }
  }
  if (!(chatId in current)) return null
  const { [chatId]: _removed, ...rest } = current
  return rest
}

function readProviderByChatId(storageKey: string): Record<string, AgentProvider> {
  try {
    if (typeof localStorage === "undefined") return {}
    const raw = localStorage.getItem(storageKey)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {}
    const next: Record<string, AgentProvider> = {}
    for (const [chatId, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === "string" && value.length > 0) next[chatId] = value as AgentProvider
    }
    return next
  } catch {
    return {}
  }
}

function writeProviderByChatId(storageKey: string, value: Record<string, AgentProvider>) {
  try {
    if (typeof localStorage === "undefined") return
    localStorage.setItem(storageKey, JSON.stringify(value))
  } catch {
    // quota / private mode — keep the in-memory map either way
  }
}

function withProviderValue(
  current: Record<string, AgentProvider>,
  chatId: string,
  provider: AgentProvider,
): Record<string, AgentProvider> {
  if (current[chatId] === provider) return current
  return { ...current, [chatId]: provider }
}

function logChatPreferences(message: string, details?: unknown) {
  if (details === undefined) {
    console.info(`[chat-preferences] ${message}`)
    return
  }

  console.info(`[chat-preferences] ${message}`, details)
}

function composerFromProviderDefaults(
  provider: AgentProvider,
  providerDefaults: ChatProviderPreferences
): ComposerState {
  return composerStateForProvider(provider, providerDefaults[provider])
}

function cloneComposerState(state: ComposerState): ComposerState {
  return { ...state, modelOptions: { ...state.modelOptions } } as ComposerState
}

function sameComposerState(left: ComposerState | undefined, right: ComposerState): boolean {
  if (!left || left.provider !== right.provider) return false
  if (left.model !== right.model || left.planMode !== right.planMode) return false
  if (left.autoPlan !== right.autoPlan) return false

  const leftOptions: Record<string, unknown> = { ...left.modelOptions }
  const rightOptions: Record<string, unknown> = { ...right.modelOptions }
  const keys = new Set([...Object.keys(leftOptions), ...Object.keys(rightOptions)])
  return [...keys].every((key) => leftOptions[key] === rightOptions[key])
}

function normalizeComposerState(
  value: PersistedComposerState | undefined,
  providerDefaults: ChatProviderPreferences,
  legacyLiveProvider?: AgentProvider,
  legacyLivePreferences?: LegacyPersistedChatPreferencesState["livePreferences"]
): ComposerState {
  // Persisted data is untrusted: only dispatch on providers we actually know.
  const provider = value?.provider
  if (provider && provider in PROVIDER_NORMALIZERS) {
    return composerStateForProvider(provider, value)
  }

  if (legacyLiveProvider === "claude" || legacyLiveProvider === "codex") {
    return composerStateForProvider(legacyLiveProvider, legacyLivePreferences?.[legacyLiveProvider])
  }

  return composerFromProviderDefaults("deepseek", providerDefaults)
}

function normalizePersistedComposerState(
  value: PersistedComposerState | ComposerState | undefined,
  providerDefaults: ChatProviderPreferences
): ComposerState | null {
  if (!value) return null
  return normalizeComposerState(value, providerDefaults)
}

function normalizeChatStates(
  value: Record<string, PersistedComposerState | ComposerState> | undefined,
  providerDefaults: ChatProviderPreferences
): Record<string, ComposerState> {
  if (!value) return {}

  return Object.fromEntries(
    Object.entries(value).map(([chatId, composerState]) => [
      chatId,
      normalizeComposerState(composerState, providerDefaults),
    ])
  )
}

function createComposerStateForNewChat(args: {
  defaultProvider: DefaultProviderPreference
  providerDefaults: ChatProviderPreferences
  sourceState?: ComposerState | null
  legacyComposerState?: ComposerState | null
}): ComposerState {
  if (args.defaultProvider === "last_used") {
    if (args.sourceState) {
      return cloneComposerState(args.sourceState)
    }

    if (args.legacyComposerState) {
      return cloneComposerState(args.legacyComposerState)
    }

    return composerFromProviderDefaults("deepseek", args.providerDefaults)
  }

  return composerFromProviderDefaults(args.defaultProvider, args.providerDefaults)
}

function getStoredComposerState(
  state: Pick<ChatPreferencesState, "chatStates" | "defaultProvider" | "providerDefaults" | "legacyComposerState">,
  chatId: string
): ComposerState {
  const existingState = state.chatStates[chatId]
  if (existingState) {
    return existingState
  }

  return createComposerStateForNewChat({
    defaultProvider: state.defaultProvider,
    providerDefaults: state.providerDefaults,
    legacyComposerState: state.legacyComposerState,
  })
}

function withChatComposerState(
  state: Pick<ChatPreferencesState, "chatStates" | "defaultProvider" | "providerDefaults" | "legacyComposerState">,
  chatId: string,
  transform: (composerState: ComposerState) => ComposerState
) {
  const currentComposerState = getStoredComposerState(state, chatId)
  return {
    chatStates: {
      ...state.chatStates,
      [chatId]: transform(currentComposerState),
    },
  }
}

interface ChatPreferencesState {
  defaultProvider: DefaultProviderPreference
  providerDefaults: ChatProviderPreferences
  chatStates: Record<string, ComposerState>
  /**
   * Chats where the user explicitly picked a different harness than the
   * chat's current provider — the switch (with server-side handoff) applies
   * on the next send. Deliberately not persisted: chat states seeded from
   * defaults must never read as an intentional switch.
   */
  pendingProviderSwitches: Record<string, true>
  /**
   * Per-chat 协作验收开关。存在 localStorage，刷新后仍在。
   * Cursor 引擎即使这里为 true 也不会发出 collaboration 标志。
   */
  collaborationByChatId: Record<string, boolean>
  /** Per-chat 协作实现引擎（谁动手）。缺省 = 主引擎。 */
  implementationProviderByChatId: Record<string, AgentProvider>
  /** Per-chat 协作验收引擎（谁验收）。缺省 = 主引擎。 */
  reviewProviderByChatId: Record<string, AgentProvider>
  legacyComposerState: ComposerState | null
  setDefaultProvider: (provider: DefaultProviderPreference) => void
  syncProviderDefaults: (defaultProvider: DefaultProviderPreference, providerDefaults: ChatProviderPreferences) => void
  setProviderDefaultModel: (provider: AgentProvider, model: string) => void
  setProviderDefaultModelOptions: <TProvider extends AgentProvider>(
    provider: TProvider,
    modelOptions: Partial<ProviderModelOptionsByProvider[TProvider]>
  ) => void
  setProviderDefaultMode: (provider: AgentProvider, mode: ChatMode) => void
  getComposerState: (chatId: string) => ComposerState
  getChatCollaboration: (chatId: string) => boolean
  setChatCollaboration: (chatId: string, enabled: boolean) => void
  copyChatCollaboration: (fromChatId: string, toChatId: string) => void
  getChatImplementationProvider: (chatId: string) => AgentProvider | null
  setChatImplementationProvider: (chatId: string, provider: AgentProvider) => void
  clearChatImplementationProvider: (chatId: string) => void
  getChatReviewProvider: (chatId: string) => AgentProvider | null
  setChatReviewProvider: (chatId: string, provider: AgentProvider) => void
  clearChatReviewProvider: (chatId: string) => void
  initializeComposerForChat: (chatId: string, options?: { sourceState?: ComposerState | null; sourceChatId?: string }) => void
  setComposerState: (chatId: string, composerState: ComposerState) => void
  setChatComposerProvider: (chatId: string, provider: AgentProvider) => void
  setChatComposerModel: (chatId: string, model: string) => void
  setChatComposerModelOptions: (
    chatId: string,
    modelOptions: Partial<ClaudeModelOptions> | Partial<CodexModelOptions> | Partial<CursorModelOptions> | Partial<PiModelOptions>
  ) => void
  setChatComposerMode: (chatId: string, mode: ChatMode) => void
  /**
   * Clears plan mode while leaving `autoPlan` untouched — used when a plan is
   * approved, so an Auto Plan user returns to Auto Plan rather than dropping
   * to Full Access.
   */
  clearChatComposerPlanMode: (chatId: string) => void
  resetChatComposerFromProvider: (chatId: string, provider: AgentProvider) => void
  markPendingProviderSwitch: (chatId: string) => void
  clearPendingProviderSwitch: (chatId: string) => void
}

export function migrateChatPreferencesState(
  persistedState: PersistedChatPreferencesState | undefined
): Pick<ChatPreferencesState, "defaultProvider" | "providerDefaults" | "chatStates" | "legacyComposerState"> {
  const providerDefaults = normalizeProviderDefaults(persistedState?.providerDefaults)
  const legacyComposerState = normalizePersistedComposerState(
    persistedState?.legacyComposerState ?? persistedState?.composerState,
    providerDefaults
  )
  const legacyLiveComposerState = persistedState?.liveProvider
    ? normalizeComposerState(
      undefined,
      providerDefaults,
      persistedState.liveProvider,
      persistedState?.livePreferences
    )
    : null

  return {
    defaultProvider: normalizeDefaultProvider(persistedState?.defaultProvider),
    providerDefaults,
    chatStates: normalizeChatStates(persistedState?.chatStates, providerDefaults),
    legacyComposerState: legacyComposerState ?? legacyLiveComposerState,
  }
}

export const useChatPreferencesStore = create<ChatPreferencesState>()(
  (set, get) => ({
    defaultProvider: "last_used",
    providerDefaults: createDefaultProviderDefaults(),
    chatStates: {},
    pendingProviderSwitches: {},
    collaborationByChatId: readCollaborationByChatId(),
    implementationProviderByChatId: readProviderByChatId(CHAT_IMPLEMENTATION_PROVIDER_STORAGE_KEY),
    reviewProviderByChatId: readProviderByChatId(CHAT_REVIEW_PROVIDER_STORAGE_KEY),
    legacyComposerState: null,
    setDefaultProvider: (defaultProvider) => set({ defaultProvider }),
    syncProviderDefaults: (defaultProvider, providerDefaults) =>
      set((state) => {
        const oldNewChatFallback = createComposerStateForNewChat({
          defaultProvider: state.defaultProvider,
          providerDefaults: state.providerDefaults,
          legacyComposerState: state.legacyComposerState,
        })
        const nextNewChatFallback = createComposerStateForNewChat({
          defaultProvider,
          providerDefaults,
          legacyComposerState: state.legacyComposerState,
        })
        const chatStates = Object.fromEntries(
          Object.entries(state.chatStates).map(([chatId, composerState]) => [
            chatId,
            sameComposerState(composerState, oldNewChatFallback) ? nextNewChatFallback : composerState,
          ])
        )

        return {
          defaultProvider,
          providerDefaults,
          chatStates,
        }
      }),
      setProviderDefaultModel: (provider, model) =>
        set((state) => ({
          providerDefaults: {
            ...state.providerDefaults,
            [provider]: normalizeProviderPreference(provider, { ...state.providerDefaults[provider], model }),
          },
        })),
      setProviderDefaultModelOptions: (provider, modelOptions) =>
        set((state) => ({
          providerDefaults: {
            ...state.providerDefaults,
            [provider]: normalizeProviderPreference(provider, {
              ...state.providerDefaults[provider],
              modelOptions: {
                ...state.providerDefaults[provider].modelOptions,
                ...modelOptions,
              } as ProviderModelOptionsInput,
            }),
          },
        })),
      setProviderDefaultMode: (provider, mode) =>
        set((state) => ({
          providerDefaults: {
            ...state.providerDefaults,
            [provider]: {
              ...state.providerDefaults[provider],
              ...chatModeToFlags(mode, state.providerDefaults[provider].autoPlan),
            },
          },
        })),
      getComposerState: (chatId) => cloneComposerState(getStoredComposerState(get(), chatId)),
      getChatCollaboration: (chatId) => Boolean(get().collaborationByChatId[chatId]),
      setChatCollaboration: (chatId, enabled) =>
        set((state) => {
          const next = withCollaborationValue(state.collaborationByChatId, chatId, enabled)
          if (!next) return state
          writeCollaborationByChatId(next)
          return { collaborationByChatId: next }
        }),
      copyChatCollaboration: (fromChatId, toChatId) =>
        set((state) => {
          const collaborationByChatId = withCollaborationValue(
            state.collaborationByChatId,
            toChatId,
            Boolean(state.collaborationByChatId[fromChatId]),
          ) ?? state.collaborationByChatId
          const implementationProvider = state.implementationProviderByChatId[fromChatId]
          const implementationProviderByChatId = implementationProvider
            ? withProviderValue(state.implementationProviderByChatId, toChatId, implementationProvider)
            : state.implementationProviderByChatId
          const reviewProvider = state.reviewProviderByChatId[fromChatId]
          const reviewProviderByChatId = reviewProvider
            ? withProviderValue(state.reviewProviderByChatId, toChatId, reviewProvider)
            : state.reviewProviderByChatId

          if (collaborationByChatId === state.collaborationByChatId
            && implementationProviderByChatId === state.implementationProviderByChatId
            && reviewProviderByChatId === state.reviewProviderByChatId) return state
          if (collaborationByChatId !== state.collaborationByChatId) {
            writeCollaborationByChatId(collaborationByChatId)
          }
          if (implementationProviderByChatId !== state.implementationProviderByChatId) {
            writeProviderByChatId(CHAT_IMPLEMENTATION_PROVIDER_STORAGE_KEY, implementationProviderByChatId)
          }
          if (reviewProviderByChatId !== state.reviewProviderByChatId) {
            writeProviderByChatId(CHAT_REVIEW_PROVIDER_STORAGE_KEY, reviewProviderByChatId)
          }
          return { collaborationByChatId, implementationProviderByChatId, reviewProviderByChatId }
        }),
      getChatImplementationProvider: (chatId) => get().implementationProviderByChatId[chatId] ?? null,
      setChatImplementationProvider: (chatId, provider) =>
        set((state) => {
          const next = withProviderValue(state.implementationProviderByChatId, chatId, provider)
          if (next === state.implementationProviderByChatId) return state
          writeProviderByChatId(CHAT_IMPLEMENTATION_PROVIDER_STORAGE_KEY, next)
          return { implementationProviderByChatId: next }
        }),
      clearChatImplementationProvider: (chatId) =>
        set((state) => {
          if (!(chatId in state.implementationProviderByChatId)) return state
          const { [chatId]: _removed, ...rest } = state.implementationProviderByChatId
          writeProviderByChatId(CHAT_IMPLEMENTATION_PROVIDER_STORAGE_KEY, rest)
          return { implementationProviderByChatId: rest }
        }),
      getChatReviewProvider: (chatId) => get().reviewProviderByChatId[chatId] ?? null,
      setChatReviewProvider: (chatId, provider) =>
        set((state) => {
          const next = withProviderValue(state.reviewProviderByChatId, chatId, provider)
          if (next === state.reviewProviderByChatId) return state
          writeProviderByChatId(CHAT_REVIEW_PROVIDER_STORAGE_KEY, next)
          return { reviewProviderByChatId: next }
        }),
      clearChatReviewProvider: (chatId) =>
        set((state) => {
          if (!(chatId in state.reviewProviderByChatId)) return state
          const { [chatId]: _removed, ...rest } = state.reviewProviderByChatId
          writeProviderByChatId(CHAT_REVIEW_PROVIDER_STORAGE_KEY, rest)
          return { reviewProviderByChatId: rest }
        }),
      initializeComposerForChat: (chatId, options) =>
        set((state) => {
          if (state.chatStates[chatId]) {
            return state
          }

          const composerState = createComposerStateForNewChat({
            defaultProvider: state.defaultProvider,
            providerDefaults: state.providerDefaults,
            sourceState: options?.sourceState,
            legacyComposerState: state.legacyComposerState,
          })

          logChatPreferences("initializeComposerForChat", { chatId, composerState })

          const sourceChatId = options?.sourceChatId
          const collaborationByChatId = sourceChatId
            ? withCollaborationValue(
              state.collaborationByChatId,
              chatId,
              Boolean(state.collaborationByChatId[sourceChatId]),
            ) ?? state.collaborationByChatId
            : state.collaborationByChatId
          if (collaborationByChatId !== state.collaborationByChatId) {
            writeCollaborationByChatId(collaborationByChatId)
          }

          // 分支/新对话从源对话继承实现引擎。
          const sourceImplementationProvider = sourceChatId
            ? (state.implementationProviderByChatId[sourceChatId] ?? null)
            : null
          const implementationProviderByChatId = sourceImplementationProvider
            ? withProviderValue(state.implementationProviderByChatId, chatId, sourceImplementationProvider)
            : state.implementationProviderByChatId
          if (implementationProviderByChatId !== state.implementationProviderByChatId) {
            writeProviderByChatId(CHAT_IMPLEMENTATION_PROVIDER_STORAGE_KEY, implementationProviderByChatId)
          }

          // 分支/新对话从源对话继承验收引擎。
          const sourceReviewProvider = sourceChatId
            ? (state.reviewProviderByChatId[sourceChatId] ?? null)
            : null
          const reviewProviderByChatId = sourceReviewProvider
            ? withProviderValue(state.reviewProviderByChatId, chatId, sourceReviewProvider)
            : state.reviewProviderByChatId
          if (reviewProviderByChatId !== state.reviewProviderByChatId) {
            writeProviderByChatId(CHAT_REVIEW_PROVIDER_STORAGE_KEY, reviewProviderByChatId)
          }

          return {
            chatStates: {
              ...state.chatStates,
              [chatId]: composerState,
            },
            collaborationByChatId,
            implementationProviderByChatId,
            reviewProviderByChatId,
          }
        }),
      setComposerState: (chatId, composerState) =>
        set((state) => ({
          chatStates: {
            ...state.chatStates,
            // Claude/Codex states are re-normalized (model aliases, effort clamps);
            // Cursor/Pi states are historically stored as provided.
            [chatId]: composerState.provider === "claude" || composerState.provider === "codex"
              ? composerStateForProvider(composerState.provider, composerState)
              : cloneComposerState(composerState),
          },
        })),
      setChatComposerProvider: (chatId, provider) =>
        set((state) => withChatComposerState(state, chatId, () => composerFromProviderDefaults(provider, state.providerDefaults))),
      setChatComposerModel: (chatId, model) =>
        set((state) => withChatComposerState(state, chatId, (composerState) =>
          composerStateForProvider(composerState.provider, { ...composerState, model })
        )),
      setChatComposerModelOptions: (chatId, modelOptions) =>
        set((state) => withChatComposerState(state, chatId, (composerState) =>
          composerStateForProvider(composerState.provider, {
            ...composerState,
            modelOptions: { ...composerState.modelOptions, ...modelOptions } as ProviderModelOptionsInput,
          })
        )),
      setChatComposerMode: (chatId, mode) =>
        set((state) => withChatComposerState(state, chatId, (composerState) => ({
          ...composerState,
          ...chatModeToFlags(mode, composerState.autoPlan),
        }))),
      clearChatComposerPlanMode: (chatId) =>
        set((state) => withChatComposerState(state, chatId, (composerState) => ({
          ...composerState,
          planMode: false,
        }))),
      resetChatComposerFromProvider: (chatId, provider) =>
        set((state) => ({
          chatStates: {
            ...state.chatStates,
            [chatId]: composerFromProviderDefaults(provider, state.providerDefaults),
          },
        })),
      markPendingProviderSwitch: (chatId) =>
        set((state) => (
          state.pendingProviderSwitches[chatId]
            ? state
            : { pendingProviderSwitches: { ...state.pendingProviderSwitches, [chatId]: true } }
        )),
      clearPendingProviderSwitch: (chatId) =>
        set((state) => {
          if (!state.pendingProviderSwitches[chatId]) return state
          const { [chatId]: _cleared, ...rest } = state.pendingProviderSwitches
          return { pendingProviderSwitches: rest }
        }),
  })
)
