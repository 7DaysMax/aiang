import {
  chatModeFromFlags,
  CLAUDE_CONTEXT_WINDOW_OPTIONS,
  CLAUDE_REASONING_OPTIONS,
  DEEPSEEK_REASONING_OPTIONS,
  getCodexReasoningOptions,
  normalizeClaudeContextWindow,
  normalizeClaudeFastMode,
  normalizeCodexModelId,
  normalizeCodexReasoningEffort,
  normalizeDeepSeekModelId,
  normalizeDeepSeekReasoningEffort,
  PI_REASONING_OPTIONS,
  supportsClaudeMaxReasoningEffort,
  type AgentProvider,
  type ChatMode,
  type ChatProviderPreferences,
  type ClaudeContextWindow,
  type ProviderCatalogEntry,
  type ProviderModelOption,
} from "../../shared/types"
import { assertNever } from "../../shared/assert"
import { NEW_CHAT_COMPOSER_ID, type ComposerState } from "../stores/chatPreferencesStore"

/**
 * Canonical composer semantics — the single source of truth for what the
 * user can change about the current chat's harness/model/plan-mode and what
 * the effective selection is. ChatInput and the command palette both derive
 * from this module so their rules can never drift:
 *
 * - The harness (provider) can always be changed. On a chat with a live
 *   session, picking a different harness stages a mid-conversation switch:
 *   the next send carries the new provider and the server performs the
 *   handoff (fresh session + handoff context). The staged switch is only
 *   honored when it was explicit (`providerSwitchRequested`) — a chat state
 *   passively seeded from defaults must never switch a running chat.
 * - Models must come from the selected provider's catalog entry (which
 *   includes runtime-discovered models, e.g. Cursor's CLI catalog).
 * - Plan mode is only available when the provider supports it.
 * - Changing model normalizes dependent options (Claude context window /
 *   fast mode, Codex reasoning effort).
 */

/** Applies a model change to a composer state, normalizing dependent options. */
export function applyModelToComposerState(
  state: ComposerState,
  model: string,
  modelOption?: ProviderModelOption,
): ComposerState {
  if (state.provider === "codex") {
    const normalizedModel = normalizeCodexModelId(model)
    return {
      ...state,
      model: normalizedModel,
      modelOptions: {
        ...state.modelOptions,
        reasoningEffort: normalizeCodexReasoningEffort(
          normalizedModel,
          state.modelOptions.reasoningEffort,
          modelOption,
        ),
      },
    }
  }
  if (state.provider === "deepseek" || state.provider === "reasonix" || state.provider === "youmi") {
    const normalizedModel = normalizeDeepSeekModelId(model)
    return {
      ...state,
      model: normalizedModel,
      modelOptions: {
        ...state.modelOptions,
        reasoningEffort: normalizeDeepSeekReasoningEffort(state.modelOptions.reasoningEffort),
        fastMode: false,
      },
    }
  }
  if (state.provider !== "claude") return { ...state, model }
  // Claude 入口的 DeepSeek V4：思考档位走官方 low/high/max，切模型时不要丢 max。
  if (model.startsWith("deepseek-")) {
    return {
      ...state,
      model,
      modelOptions: {
        ...state.modelOptions,
        reasoningEffort: normalizeDeepSeekReasoningEffort(state.modelOptions.reasoningEffort),
        contextWindow: "200k",
        fastMode: false,
      },
    }
  }
  return {
    ...state,
    model,
    modelOptions: {
      ...state.modelOptions,
      contextWindow: normalizeClaudeContextWindow(model, state.modelOptions.contextWindow),
      fastMode: normalizeClaudeFastMode(model, state.modelOptions.fastMode),
      // 从 DeepSeek 切回 Claude 时，若当前是 max 且目标模型不支持，夹回 high。
      reasoningEffort: !supportsClaudeMaxReasoningEffort(model) && state.modelOptions.reasoningEffort === "max"
        ? "high"
        : state.modelOptions.reasoningEffort,
    },
  }
}

/**
 * The effective composer state for a chat: when the chat's session has locked
 * a provider that differs from the stored composer state, fall back to that
 * provider's saved defaults (keeping plan mode).
 */
export function getEffectiveComposerState(
  composerState: ComposerState,
  activeProvider: AgentProvider | null,
  providerDefaults: ChatProviderPreferences
): ComposerState {
  if (!activeProvider || composerState.provider === activeProvider) {
    return composerState
  }

  switch (activeProvider) {
    case "claude":
      return {
        provider: "claude",
        model: providerDefaults.claude.model,
        modelOptions: { ...providerDefaults.claude.modelOptions },
        planMode: composerState.planMode,
        autoPlan: composerState.autoPlan,
      }
    case "codex":
      return {
        provider: "codex",
        model: providerDefaults.codex.model,
        modelOptions: { ...providerDefaults.codex.modelOptions },
        planMode: composerState.planMode,
        autoPlan: composerState.autoPlan,
      }
    case "cursor":
      return {
        provider: "cursor",
        model: providerDefaults.cursor.model,
        modelOptions: { ...providerDefaults.cursor.modelOptions },
        planMode: composerState.planMode,
        autoPlan: composerState.autoPlan,
      }
    case "pi":
      return {
        provider: "pi",
        model: providerDefaults.pi.model,
        modelOptions: { ...providerDefaults.pi.modelOptions },
        planMode: composerState.planMode,
        autoPlan: composerState.autoPlan,
      }
    case "deepseek":
      return {
        provider: "deepseek",
        model: providerDefaults.deepseek.model,
        modelOptions: { ...providerDefaults.deepseek.modelOptions },
        planMode: composerState.planMode,
        autoPlan: composerState.autoPlan,
      }
    case "reasonix":
      return {
        provider: "reasonix",
        model: providerDefaults.reasonix.model,
        modelOptions: { ...providerDefaults.reasonix.modelOptions },
        planMode: composerState.planMode,
        autoPlan: composerState.autoPlan,
      }
    case "youmi":
      return {
        provider: "youmi",
        model: providerDefaults.youmi.model,
        modelOptions: { ...providerDefaults.youmi.modelOptions },
        planMode: composerState.planMode,
        autoPlan: composerState.autoPlan,
      }
    default:
      return assertNever(activeProvider)
  }
}

export interface ComposerView {
  /** Chat-preferences store key: the chat id, or the shared new-chat composer. */
  composerChatId: string
  /** The provider of the chat's live/last session, when it has started. */
  activeProvider: AgentProvider | null
  /**
   * True when the user explicitly staged a different harness on a started
   * chat — the next send switches providers (with a server-side handoff).
   */
  providerSwitchPending: boolean
  /** The harness can always be changed; started chats switch on next send. */
  canChangeProvider: boolean
  selectedProvider: AgentProvider
  /** Effective preferences — render/submit from this. */
  effectiveState: ComposerState
  /** Catalog entry for the selected provider (models incl. runtime-discovered). */
  providerConfig: ProviderCatalogEntry | undefined
  /** The only models that may be selected for this chat. */
  models: ProviderModelOption[]
  supportsPlanMode: boolean
  /** Whether the provider offers the third "Auto Plan" mode (Claude only). */
  supportsAutoPlanMode: boolean
}

export function deriveComposerView(args: {
  chatId: string | null
  activeProvider: AgentProvider | null
  availableProviders: ProviderCatalogEntry[]
  composerState: ComposerState
  providerDefaults: ChatProviderPreferences
  /** The user explicitly picked this chat's composer provider (vs. seeded state). */
  providerSwitchRequested?: boolean
}): ComposerView {
  const composerChatId = args.chatId ?? NEW_CHAT_COMPOSER_ID
  const providerSwitchPending = Boolean(args.providerSwitchRequested)
    && args.activeProvider !== null
    && args.composerState.provider !== args.activeProvider
  // Without an explicit switch, a stored state whose provider disagrees with
  // the chat's session (e.g. seeded from defaults) defers to the session's
  // provider — same fallback as before switching existed.
  const requestedState = providerSwitchPending
    ? args.composerState
    : getEffectiveComposerState(args.composerState, args.activeProvider, args.providerDefaults)
  const selectedProvider = requestedState.provider
  const providerConfig = args.availableProviders.find((provider) => provider.id === selectedProvider)
    ?? args.availableProviders[0]
  const selectedModelOption = providerConfig?.id === selectedProvider
    ? providerConfig.models.find((model) => model.id === requestedState.model)
    : undefined
  // Codex's runtime catalog is account-scoped and can retire models. Render
  // and submit its live default when a persisted choice disappeared;
  // the store itself remains untouched until the user makes a selection.
  const effectiveState = selectedProvider === "codex"
    && providerConfig?.id === selectedProvider
    && providerConfig.models.length > 0
    && !selectedModelOption
    ? applyModelToComposerState(
      requestedState,
      providerConfig.defaultModel,
      providerConfig.models.find((model) => model.id === providerConfig.defaultModel),
    )
    : requestedState

  return {
    composerChatId,
    activeProvider: args.activeProvider,
    providerSwitchPending,
    canChangeProvider: true,
    selectedProvider,
    effectiveState,
    providerConfig,
    models: providerConfig?.models ?? [],
    supportsPlanMode: providerConfig?.supportsPlanMode ?? false,
    supportsAutoPlanMode: providerConfig?.supportsAutoPlanMode ?? false,
  }
}

/** True when the model id is selectable for this chat (present in the provider catalog). */
export function isModelSelectable(view: ComposerView, modelId: string): boolean {
  return view.models.some((model) => model.id === modelId)
}

export interface ComposerOptionChoice {
  id: string
  label: string
  description?: string
  disabled?: boolean
}

export interface ComposerOptionControls {
  /** Reasoning-effort selector, or null when the provider has none (e.g. cursor). */
  reasoning: { options: ComposerOptionChoice[]; selectedId: string | undefined } | null
  /** Claude context-window selector, or null when the model has a single window. */
  contextWindow: { options: ComposerOptionChoice[]; selectedId: ClaudeContextWindow } | null
  /** Fast-mode toggle, or null when the selected model doesn't support it. */
  fastMode: { enabled: boolean } | null
  /**
   * Mode selector, or null when the provider has no modes (cursor, pi).
   * `options` is in display order — it is also the Shift+Tab cycle order, so
   * codex cycles between two entries and claude between three.
   */
  mode: { selected: ChatMode; options: ChatMode[] } | null
}

/** Labels/descriptions for each mode, shared by the picker and command palette. */
export const CHAT_MODE_LABELS: Record<ChatMode, { label: string; description: string }> = {
  "full-access": { label: "完全访问", description: "无需审批，直接执行" },
  "plan": { label: "计划模式", description: "先审阅计划，再执行" },
  "auto-plan": { label: "自动计划", description: "由智能体决定何时先做计划" },
}

/**
 * Which per-model/provider option controls are available for a composer state
 * and what their current values are. This is the single availability registry
 * consumed by ChatPreferenceControls (chat input + provider defaults in
 * settings) and the command palette.
 */
export function deriveComposerOptionControls(
  state: ComposerState,
  providerConfig: ProviderCatalogEntry | undefined
): ComposerOptionControls {
  const selectedModelOption = providerConfig?.models.find((candidate) => candidate.id === state.model)
  const modelOptions = state.modelOptions as {
    reasoningEffort?: string
    contextWindow?: ClaudeContextWindow
    fastMode?: boolean
  }

  const reasoning = state.provider === "cursor" || !providerConfig?.efforts?.length
    ? null
    : {
      options: (
        state.provider === "claude"
          ? (state.model.startsWith("deepseek-")
              // Claude 入口里的 DeepSeek V4 模型只认官方 low/high/max。
              ? [...DEEPSEEK_REASONING_OPTIONS]
              : CLAUDE_REASONING_OPTIONS.map((option) => ({
                ...option,
                disabled: option.id === "max" && !supportsClaudeMaxReasoningEffort(state.model),
              })))
          : state.provider === "pi"
            ? [...PI_REASONING_OPTIONS]
            : state.provider === "deepseek" || state.provider === "reasonix" || state.provider === "youmi"
              ? [...DEEPSEEK_REASONING_OPTIONS]
              : [...(selectedModelOption?.supportedReasoningEfforts ?? getCodexReasoningOptions(state.model))]
      ) as ComposerOptionChoice[],
      selectedId: modelOptions.reasoningEffort,
    }

  const contextWindowOptions = state.provider === "claude"
    ? (selectedModelOption?.contextWindowOptions ?? [])
    : []
  const contextWindow = contextWindowOptions.length > 1
    ? {
      options: contextWindowOptions.map((option) => ({ ...option }) as ComposerOptionChoice),
      selectedId: modelOptions.contextWindow ?? CLAUDE_CONTEXT_WINDOW_OPTIONS[0].id,
    }
    : null

  const fastMode = selectedModelOption?.supportsFastMode
    ? { enabled: Boolean(modelOptions.fastMode) }
    : null

  const modeOptions: ChatMode[] = providerConfig?.supportsAutoPlanMode
    ? ["full-access", "plan", "auto-plan"]
    : ["full-access", "plan"]
  // A composer state seeded from another harness can carry autoPlan into a
  // provider that has no Auto Plan (see getEffectiveComposerState), so clamp
  // the selection to what this provider actually offers.
  const selectedMode = chatModeFromFlags(state.planMode, state.autoPlan)
  const mode = providerConfig?.supportsPlanMode
    ? {
      selected: modeOptions.includes(selectedMode) ? selectedMode : "full-access" as ChatMode,
      options: modeOptions,
    }
    : null

  return { reasoning, contextWindow, fastMode, mode }
}
