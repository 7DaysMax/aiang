import { afterEach, describe, expect, test } from "bun:test"
import {
  migrateChatPreferencesState,
  NEW_CHAT_COMPOSER_ID,
  useChatPreferencesStore,
} from "./chatPreferencesStore"

const INITIAL_STATE = useChatPreferencesStore.getInitialState()

afterEach(() => {
  useChatPreferencesStore.setState(INITIAL_STATE)
})

describe("migrateChatPreferencesState", () => {
  test("state persisted before Auto Plan existed migrates to Full Access", () => {
    const migrated = migrateChatPreferencesState({
      defaultProvider: "last_used",
      providerDefaults: {
        // No autoPlan key at all — exactly what an older Kanna wrote.
        claude: {
          model: "opus",
          modelOptions: { reasoningEffort: "high", contextWindow: "1m", fastMode: false },
          planMode: false,
        },
      },
    } as never)

    expect(migrated.providerDefaults.claude.autoPlan).toBe(false)
    // Auto Plan is Claude-only; the other harnesses are pinned to false.
    expect(migrated.providerDefaults.codex.autoPlan).toBe(false)
    expect(migrated.providerDefaults.cursor.autoPlan).toBe(false)
    expect(migrated.providerDefaults.pi.autoPlan).toBe(false)
  })

  test("preserves max effort for versioned Opus Claude models", () => {
    const migrated = migrateChatPreferencesState({
      defaultProvider: "last_used",
      providerDefaults: {
        claude: {
          model: "claude-opus-4-8",
          modelOptions: { reasoningEffort: "max", contextWindow: "1m", fastMode: false },
          planMode: false,
          autoPlan: false,
        },
      },
    })

    expect(migrated.providerDefaults.claude).toEqual({
      // The version-pinned id folds into the alias while keeping max effort.
      model: "opus",
      modelOptions: { reasoningEffort: "max", contextWindow: "1m", fastMode: false },
      planMode: false,
      autoPlan: false,
    })
  })

  test("normalizes provider defaults and legacy composer state", () => {
    const migrated = migrateChatPreferencesState({
      defaultProvider: "last_used",
      providerDefaults: {
        claude: {
          model: "opus",
          modelOptions: { reasoningEffort: "low", contextWindow: "1m", fastMode: false },
          planMode: true,
          autoPlan: false,
        },
        codex: {
          model: "gpt-5.3-codex",
          modelOptions: { reasoningEffort: "minimal", fastMode: true },
          planMode: false,
          autoPlan: false,
        },
      },
      composerState: {
        provider: "claude",
        model: "sonnet",
        modelOptions: { reasoningEffort: "max", contextWindow: "1m", fastMode: false },
        planMode: false,
        autoPlan: false,
      },
    })

    expect(migrated).toEqual({
      defaultProvider: "last_used",
      providerDefaults: {
        claude: {
          model: "opus",
          modelOptions: { reasoningEffort: "low", contextWindow: "1m", fastMode: false },
          planMode: true,
          autoPlan: false,
        },
        codex: {
          model: "gpt-5.3-codex",
          modelOptions: { reasoningEffort: "high", fastMode: true },
          planMode: false,
          autoPlan: false,
        },
        cursor: {
          model: "composer-2.5",
          modelOptions: { fastMode: false },
          planMode: false,
          autoPlan: false,
        },
        deepseek: {
          model: "deepseek-v4-flash",
          modelOptions: { reasoningEffort: "high", fastMode: false },
          planMode: false,
          autoPlan: false,
        },
        reasonix: {
          model: "deepseek-v4-flash",
          modelOptions: { reasoningEffort: "high", fastMode: false },
          planMode: false,
          autoPlan: false,
        },
        youmi: {
          model: "deepseek-v4-flash",
          modelOptions: { reasoningEffort: "max", fastMode: false },
          planMode: false,
          autoPlan: false,
        },
        pi: {
          model: "~anthropic/claude-fable-latest",
          modelOptions: { reasoningEffort: "medium" },
          planMode: false,
          autoPlan: false,
        },
      },
      chatStates: {},
      legacyComposerState: {
        provider: "claude",
        model: "sonnet",
        modelOptions: { reasoningEffort: "high", contextWindow: "1m", fastMode: false },
        planMode: false,
        autoPlan: false,
      },
    })
  })

  // Models without a context window selector store the default *preference*
  // (the effective window is clamped at usage time via resolveClaudeContextWindow),
  // so a stale clamp never carries over when switching to a supporting model.
  test("resets Claude context window to the default preference for unsupported models during migration", () => {
    const migrated = migrateChatPreferencesState({
      defaultProvider: "last_used",
      providerDefaults: {
        claude: {
          model: "haiku",
          modelOptions: { reasoningEffort: "low", contextWindow: "1m" as never, fastMode: false },
          planMode: false,
          autoPlan: false,
        },
      },
      chatStates: {
        chatA: {
          provider: "claude",
          model: "haiku",
          modelOptions: { reasoningEffort: "high", contextWindow: "1m" as never, fastMode: false },
          planMode: false,
          autoPlan: false,
        },
      },
    })

    expect(migrated.providerDefaults.claude.modelOptions).toEqual({ reasoningEffort: "low", contextWindow: "1m", fastMode: false })
    expect(migrated.chatStates.chatA).toEqual({
      provider: "claude",
      model: "haiku",
      modelOptions: { reasoningEffort: "high", contextWindow: "1m", fastMode: false },
      planMode: false,
      autoPlan: false,
    })
  })

  test("preserves persisted official Codex defaults for the runtime catalog", () => {
    const migrated = migrateChatPreferencesState({
      defaultProvider: "last_used",
      providerDefaults: {
        codex: {
          model: "gpt-5-codex",
          modelOptions: { reasoningEffort: "low", fastMode: true },
          planMode: false,
          autoPlan: false,
        },
      },
    })

    expect(migrated.providerDefaults.codex).toEqual({
      model: "gpt-5-codex",
      modelOptions: { reasoningEffort: "low", fastMode: true },
      planMode: false,
      autoPlan: false,
    })
  })

  test("preserves persisted official Codex composer states", () => {
    const migrated = migrateChatPreferencesState({
      defaultProvider: "codex",
      providerDefaults: {
        codex: {
          model: "gpt-5.3-codex-spark",
          modelOptions: { reasoningEffort: "low", fastMode: true },
          planMode: true,
          autoPlan: false,
        },
      },
      chatStates: {
        chatA: {
          provider: "codex",
          model: "gpt-5.4",
          modelOptions: { reasoningEffort: "medium", fastMode: false },
          planMode: false,
          autoPlan: false,
        },
      },
      legacyComposerState: {
        provider: "codex",
        model: "gpt-5.3-codex",
        modelOptions: { reasoningEffort: "xhigh", fastMode: true },
        planMode: true,
        autoPlan: false,
      },
    })

    expect(migrated.providerDefaults.codex).toEqual({
      model: "gpt-5.3-codex-spark",
      modelOptions: { reasoningEffort: "low", fastMode: true },
      planMode: true,
      autoPlan: false,
    })
    expect(migrated.chatStates.chatA).toEqual({
      provider: "codex",
      model: "gpt-5.4",
      modelOptions: { reasoningEffort: "medium", fastMode: false },
      planMode: false,
      autoPlan: false,
    })
    expect(migrated.legacyComposerState).toEqual({
      provider: "codex",
      model: "gpt-5.3-codex",
      modelOptions: { reasoningEffort: "xhigh", fastMode: true },
      planMode: true,
      autoPlan: false,
    })
  })

  test("preserves persisted GPT-5.6 defaults and Ultra", () => {
    const migrated = migrateChatPreferencesState({
      defaultProvider: "codex",
      providerDefaults: {
        codex: {
          model: "gpt-5.6-terra",
          modelOptions: { reasoningEffort: "ultra", fastMode: true },
          planMode: true,
          autoPlan: false,
        },
      },
    })

    expect(migrated.providerDefaults.codex).toEqual({
      model: "gpt-5.6-terra",
      modelOptions: { reasoningEffort: "ultra", fastMode: true },
      planMode: true,
      autoPlan: false,
    })
  })
})

describe("chat preference store", () => {
  test("starts with the official Codex default model and effort", () => {
    expect(INITIAL_STATE.providerDefaults.codex).toEqual({
      model: "gpt-5.6-sol",
      modelOptions: { reasoningEffort: "low", fastMode: false },
      planMode: false,
      autoPlan: false,
    })
  })

  test("migrates stale DeepSeek Codex states to official model semantics", () => {
    const store = useChatPreferencesStore.getState()

    store.setComposerState("flash", {
      provider: "codex",
      model: "deepseek-v4-flash",
      modelOptions: { reasoningEffort: "minimal", fastMode: false },
      planMode: false,
      autoPlan: false,
    })
    store.setComposerState("pro", {
      provider: "codex",
      model: "deepseek-v4-pro",
      modelOptions: { reasoningEffort: "ultra", fastMode: false },
      planMode: false,
      autoPlan: false,
    })

    expect(useChatPreferencesStore.getState().getComposerState("flash")).toMatchObject({
      model: "gpt-5.6-sol",
      modelOptions: { reasoningEffort: "low" },
    })
    expect(useChatPreferencesStore.getState().getComposerState("pro")).toMatchObject({
      model: "gpt-5.6-sol",
      modelOptions: { reasoningEffort: "ultra" },
    })
  })

  test("clamps unsupported reasoning levels when switching Codex engine models", () => {
    const store = useChatPreferencesStore.getState()
    store.setComposerState("chat-a", {
      provider: "codex",
      model: "gpt-5.6-sol",
      modelOptions: { reasoningEffort: "ultra", fastMode: false },
      planMode: false,
      autoPlan: false,
    })

    store.setChatComposerModel("chat-a", "gpt-5.6-luna")

    expect(useChatPreferencesStore.getState().getComposerState("chat-a")).toMatchObject({
      model: "gpt-5.6-luna",
      modelOptions: { reasoningEffort: "max" },
    })
  })

  test("editing provider defaults does not change existing chat state", () => {
    useChatPreferencesStore.getState().setComposerState("chat-a", {
      provider: "codex",
      model: "gpt-5.3-codex",
      modelOptions: { reasoningEffort: "minimal", fastMode: true },
      planMode: true,
      autoPlan: false,
    })

    useChatPreferencesStore.getState().setProviderDefaultModel("codex", "deepseek-v4-pro")
    useChatPreferencesStore.getState().setProviderDefaultModelOptions("codex", {
      reasoningEffort: "low",
      fastMode: false,
    })
    useChatPreferencesStore.getState().setProviderDefaultMode("codex", "full-access")

    expect(useChatPreferencesStore.getState().getComposerState("chat-a")).toEqual({
      provider: "codex",
      model: "gpt-5.3-codex",
      modelOptions: { reasoningEffort: "high", fastMode: true },
      planMode: true,
      autoPlan: false,
    })
  })

  test("approving a plan returns an Auto Plan chat to Auto Plan, not Full Access", () => {
    const store = useChatPreferencesStore.getState()
    const modeOf = (chatId: string) => {
      const state = store.getComposerState(chatId)
      return { planMode: state.planMode, autoPlan: state.autoPlan }
    }

    store.setChatComposerMode("chat-a", "auto-plan")
    expect(modeOf("chat-a")).toEqual({ planMode: false, autoPlan: true })

    // Manually flipping to Plan Mode holds autoPlan underneath…
    store.setChatComposerMode("chat-a", "plan")
    expect(modeOf("chat-a")).toEqual({ planMode: true, autoPlan: true })

    // …so clearing plan mode on approval lands back in Auto Plan.
    store.clearChatComposerPlanMode("chat-a")
    expect(modeOf("chat-a")).toEqual({ planMode: false, autoPlan: true })

    // A chat that was never in Auto Plan lands in Full Access instead.
    store.setChatComposerMode("chat-b", "plan")
    store.clearChatComposerPlanMode("chat-b")
    expect(modeOf("chat-b")).toEqual({ planMode: false, autoPlan: false })
  })

  test("restores isolated composer state by chat id", () => {
    const store = useChatPreferencesStore.getState()

    store.setComposerState("chat-a", {
      provider: "claude",
      model: "sonnet",
      modelOptions: { reasoningEffort: "low", contextWindow: "1m", fastMode: false },
      planMode: false,
      autoPlan: false,
    })
    store.setComposerState("chat-b", {
      provider: "codex",
      model: "gpt-5.3-codex",
      modelOptions: { reasoningEffort: "minimal", fastMode: true },
      planMode: true,
      autoPlan: false,
    })
    store.setChatComposerMode("chat-a", "plan")

    expect(store.getComposerState("chat-a")).toEqual({
      provider: "claude",
      model: "sonnet",
      modelOptions: { reasoningEffort: "low", contextWindow: "1m", fastMode: false },
      planMode: true,
      autoPlan: false,
    })
    expect(store.getComposerState("chat-b")).toEqual({
      provider: "codex",
      model: "gpt-5.3-codex",
      modelOptions: { reasoningEffort: "high", fastMode: true },
      planMode: true,
      autoPlan: false,
    })
  })

  test("switching Claude chat model keeps the context window preference without clamping", () => {
    const store = useChatPreferencesStore.getState()

    store.setComposerState("chat-a", {
      provider: "claude",
      model: "opus",
      modelOptions: { reasoningEffort: "high", contextWindow: "1m", fastMode: false },
      planMode: false,
      autoPlan: false,
    })
    store.setChatComposerModel("chat-a", "haiku")

    // Stored preference stays "1m" — haiku is clamped to the standard window
    // at usage time, and switching back to Opus resumes the 1m preference.
    expect(store.getComposerState("chat-a")).toEqual({
      provider: "claude",
      model: "haiku",
      modelOptions: { reasoningEffort: "high", contextWindow: "1m", fastMode: false },
      planMode: false,
      autoPlan: false,
    })
  })

  test("changing the model or options of a Cursor chat keeps it on Cursor", () => {
    const store = useChatPreferencesStore.getState()

    store.setComposerState("chat-a", {
      provider: "cursor",
      model: "composer-2.5",
      modelOptions: { fastMode: true },
      planMode: false,
      autoPlan: false,
    })

    // Selecting the model must not silently convert the composer to Codex.
    store.setChatComposerModel("chat-a", "composer-2.5")
    expect(store.getComposerState("chat-a")).toEqual({
      provider: "cursor",
      model: "composer-2.5",
      modelOptions: { fastMode: true },
      planMode: false,
      autoPlan: false,
    })

    store.setChatComposerModelOptions("chat-a", { fastMode: false })
    expect(store.getComposerState("chat-a")).toEqual({
      provider: "cursor",
      model: "composer-2.5",
      modelOptions: { fastMode: false },
      planMode: false,
      autoPlan: false,
    })
  })

  test("resetChatComposerFromProvider copies provider defaults into the target chat", () => {
    useChatPreferencesStore.setState({
      ...INITIAL_STATE,
      providerDefaults: {
        ...INITIAL_STATE.providerDefaults,
        codex: {
          model: "gpt-5.3-codex",
          modelOptions: { reasoningEffort: "minimal", fastMode: true },
          planMode: true,
          autoPlan: false,
        },
      },
    })

    useChatPreferencesStore.getState().resetChatComposerFromProvider("chat-a", "codex")

    expect(useChatPreferencesStore.getState().getComposerState("chat-a")).toEqual({
      provider: "codex",
      model: "gpt-5.3-codex",
      modelOptions: { reasoningEffort: "high", fastMode: true },
      planMode: true,
      autoPlan: false,
    })
  })

  test("initializeComposerForChat uses explicit provider defaults for new chats", () => {
    useChatPreferencesStore.setState({
      ...INITIAL_STATE,
      defaultProvider: "codex",
      providerDefaults: {
        ...INITIAL_STATE.providerDefaults,
        codex: {
          model: "gpt-5.3-codex-spark",
          modelOptions: { reasoningEffort: "minimal", fastMode: true },
          planMode: true,
          autoPlan: false,
        },
      },
    })

    useChatPreferencesStore.getState().initializeComposerForChat("chat-a")

    expect(useChatPreferencesStore.getState().getComposerState("chat-a")).toEqual({
      provider: "codex",
      model: "gpt-5.3-codex-spark",
      modelOptions: { reasoningEffort: "high", fastMode: true },
      planMode: true,
      autoPlan: false,
    })
  })

  test("last_used falls back to provider defaults when no real last-used state exists", () => {
    useChatPreferencesStore.setState({
      ...INITIAL_STATE,
      defaultProvider: "last_used",
      providerDefaults: {
        ...INITIAL_STATE.providerDefaults,
        claude: {
          model: "opus",
          modelOptions: { reasoningEffort: "max", contextWindow: "1m", fastMode: false },
          planMode: true,
          autoPlan: false,
        },
      },
      legacyComposerState: null,
    })

    useChatPreferencesStore.getState().initializeComposerForChat("chat-a")

    expect(useChatPreferencesStore.getState().getComposerState("chat-a")).toEqual({
      provider: "deepseek",
      model: "deepseek-v4-flash",
      modelOptions: { reasoningEffort: "high", fastMode: false },
      planMode: false,
      autoPlan: false,
    })
  })

  test("syncProviderDefaults refreshes untouched new-chat state after settings hydration", () => {
    const store = useChatPreferencesStore.getState()

    store.initializeComposerForChat(NEW_CHAT_COMPOSER_ID)
    store.syncProviderDefaults("last_used", {
      ...INITIAL_STATE.providerDefaults,
      claude: {
        model: "opus",
        modelOptions: { reasoningEffort: "max", contextWindow: "1m", fastMode: false },
        planMode: true,
        autoPlan: false,
      },
    })

    expect(useChatPreferencesStore.getState().getComposerState(NEW_CHAT_COMPOSER_ID)).toEqual({
      provider: "deepseek",
      model: "deepseek-v4-flash",
      modelOptions: { reasoningEffort: "high", fastMode: false },
      planMode: false,
      autoPlan: false,
    })
  })

  test("syncProviderDefaults refreshes untouched routed chat state after settings hydration", () => {
    const store = useChatPreferencesStore.getState()

    store.initializeComposerForChat("chat-a")
    store.syncProviderDefaults("last_used", {
      ...INITIAL_STATE.providerDefaults,
      claude: {
        model: "opus",
        modelOptions: { reasoningEffort: "max", contextWindow: "1m", fastMode: false },
        planMode: true,
        autoPlan: false,
      },
    })

    expect(useChatPreferencesStore.getState().getComposerState("chat-a")).toEqual({
      provider: "deepseek",
      model: "deepseek-v4-flash",
      modelOptions: { reasoningEffort: "high", fastMode: false },
      planMode: false,
      autoPlan: false,
    })
  })

  test("syncProviderDefaults does not replace a changed new-chat state", () => {
    const store = useChatPreferencesStore.getState()

    store.setComposerState(NEW_CHAT_COMPOSER_ID, {
      provider: "codex",
      model: "gpt-5.5",
      modelOptions: { reasoningEffort: "low", fastMode: true },
      planMode: false,
      autoPlan: false,
    })
    store.syncProviderDefaults("last_used", {
      ...INITIAL_STATE.providerDefaults,
      claude: {
        model: "opus",
        modelOptions: { reasoningEffort: "max", contextWindow: "1m", fastMode: false },
        planMode: true,
        autoPlan: false,
      },
    })

    expect(useChatPreferencesStore.getState().getComposerState(NEW_CHAT_COMPOSER_ID)).toEqual({
      provider: "codex",
      model: "gpt-5.5",
      modelOptions: { reasoningEffort: "low", fastMode: true },
      planMode: false,
      autoPlan: false,
    })
  })

  test("initializeComposerForChat with last_used copies the provided source state", () => {
    useChatPreferencesStore.setState({
      ...INITIAL_STATE,
      defaultProvider: "last_used",
      chatStates: {
        [NEW_CHAT_COMPOSER_ID]: {
          provider: "codex",
          model: "deepseek-v4-pro",
          modelOptions: { reasoningEffort: "low", fastMode: false },
          planMode: true,
          autoPlan: false,
        },
      },
    })

    const sourceState = useChatPreferencesStore.getState().getComposerState(NEW_CHAT_COMPOSER_ID)
    useChatPreferencesStore.getState().initializeComposerForChat("chat-a", { sourceState })

    expect(useChatPreferencesStore.getState().getComposerState("chat-a")).toEqual({
      provider: "codex",
      model: "deepseek-v4-pro",
      modelOptions: { reasoningEffort: "low", fastMode: false },
      planMode: true,
      autoPlan: false,
    })
  })

  test("tracks collaboration roles per chat and copies them onto new chats", () => {
    const store = useChatPreferencesStore.getState()
    expect(store.getChatCollaboration(NEW_CHAT_COMPOSER_ID)).toBe(false)

    store.setChatCollaboration(NEW_CHAT_COMPOSER_ID, true)
    store.setChatImplementationProvider(NEW_CHAT_COMPOSER_ID, "deepseek")
    store.setChatReviewProvider(NEW_CHAT_COMPOSER_ID, "codex")
    expect(useChatPreferencesStore.getState().getChatCollaboration(NEW_CHAT_COMPOSER_ID)).toBe(true)

    store.initializeComposerForChat("chat-collab", { sourceChatId: NEW_CHAT_COMPOSER_ID })
    expect(useChatPreferencesStore.getState().getChatCollaboration("chat-collab")).toBe(true)
    expect(useChatPreferencesStore.getState().getChatImplementationProvider("chat-collab")).toBe("deepseek")
    expect(useChatPreferencesStore.getState().getChatReviewProvider("chat-collab")).toBe("codex")

    store.setChatCollaboration("chat-collab", false)
    expect(useChatPreferencesStore.getState().getChatCollaboration("chat-collab")).toBe(false)
    expect(useChatPreferencesStore.getState().getChatCollaboration(NEW_CHAT_COMPOSER_ID)).toBe(true)

    store.copyChatCollaboration(NEW_CHAT_COMPOSER_ID, "chat-copy")
    expect(useChatPreferencesStore.getState().getChatCollaboration("chat-copy")).toBe(true)
    expect(useChatPreferencesStore.getState().getChatImplementationProvider("chat-copy")).toBe("deepseek")
    expect(useChatPreferencesStore.getState().getChatReviewProvider("chat-copy")).toBe("codex")

    store.clearChatImplementationProvider("chat-copy")
    store.clearChatReviewProvider("chat-copy")
    expect(useChatPreferencesStore.getState().getChatImplementationProvider("chat-copy")).toBeNull()
    expect(useChatPreferencesStore.getState().getChatReviewProvider("chat-copy")).toBeNull()
  })
})
