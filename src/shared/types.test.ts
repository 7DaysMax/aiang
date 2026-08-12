import { describe, expect, test } from "bun:test"
import {
  PROVIDERS,
  deriveClaudeModelLabel,
  deriveModelLabel,
  getCodexReasoningOptions,
  resolveModelLabel,
  normalizeClaudeModelId,
  normalizeCodexModelId,
  normalizeCursorModelId,
  normalizeDeepSeekModelId,
  normalizeCodexReasoningEffort,
  isCodexReasoningEffort,
  supportsClaudeMaxReasoningEffort,
} from "./types"

describe("shared model normalization", () => {
  test("uses the full Claude Code harness label", () => {
    expect(PROVIDERS.find((provider) => provider.id === "claude")?.label).toBe("Claude Code")
  })

  test("derives fallback Claude model labels from model ids", () => {
    expect(deriveClaudeModelLabel("fable")).toBe("Fable")
    expect(deriveClaudeModelLabel("claude-opus-4-8")).toBe("Opus")
    expect(deriveClaudeModelLabel("claude-haiku-4-5-20251001")).toBe("Haiku")
  })

  test("normalizes Claude aliases via the provider catalog", () => {
    expect(normalizeClaudeModelId("fable")).toBe("fable")
    expect(normalizeClaudeModelId("opus")).toBe("opus")
    expect(normalizeClaudeModelId("sonnet")).toBe("sonnet")
    expect(normalizeClaudeModelId("haiku")).toBe("haiku")
  })

  test("migrates persisted version-pinned Claude ids into their family alias", () => {
    // Settings/chats written before the alias-keyed catalog stored ids like
    // "claude-opus-4-8"; they fold into the family alias on normalization.
    expect(normalizeClaudeModelId("claude-opus-4-8")).toBe("opus")
    expect(normalizeClaudeModelId("claude-opus-4-8[1m]")).toBe("opus")
    expect(normalizeClaudeModelId("claude-sonnet-4-6")).toBe("sonnet")
    expect(normalizeClaudeModelId("claude-haiku-4-5-20251001")).toBe("haiku")
    expect(normalizeClaudeModelId("claude-fable-5")).toBe("fable")
    // The static catalog is only a cold-start picker (the real list is
    // runtime-discovered), so unknown ids pass through for the harness to
    // validate; only empty input falls back.
    expect(normalizeClaudeModelId("claude-mystery-9")).toBe("claude-mystery-9")
    expect(normalizeClaudeModelId("")).toBe("opus")
    expect(normalizeClaudeModelId(undefined)).toBe("opus")
  })

  test("passes Cursor model ids through and folds -fast back into the base id", () => {
    // The real Cursor list is runtime-discovered (cursor-agent --list-models),
    // so unknown ids are preserved rather than clamped to the static catalog.
    expect(normalizeCursorModelId()).toBe("composer-2.5")
    expect(normalizeCursorModelId("  ")).toBe("composer-2.5")
    expect(normalizeCursorModelId("composer-2.5-fast")).toBe("composer-2.5")
    expect(normalizeCursorModelId("gpt-5.3-codex-high")).toBe("gpt-5.3-codex-high")
    expect(normalizeCursorModelId("gpt-5.3-codex-high-fast")).toBe("gpt-5.3-codex-high")
  })

  test("migrates legacy DeepSeek model ids to the V4 catalog", () => {
    expect(normalizeDeepSeekModelId()).toBe("deepseek-v4-flash")
    expect(normalizeDeepSeekModelId("deepseek-chat")).toBe("deepseek-v4-flash")
    expect(normalizeDeepSeekModelId("deepseek-reasoner")).toBe("deepseek-v4-pro")
    expect(normalizeDeepSeekModelId("deepseek-v4-pro")).toBe("deepseek-v4-pro")
    expect(normalizeDeepSeekModelId("")).toBe("deepseek-v4-flash")
  })

  test("normalizes legacy Codex aliases and defaults to the latest catalog model", () => {
    expect(normalizeCodexModelId()).toBe("deepseek-v4-flash")
    expect(normalizeCodexModelId("gpt-5.6")).toBe("deepseek-v4-flash")
    expect(normalizeCodexModelId("deepseek-chat")).toBe("deepseek-v4-flash")
    expect(normalizeCodexModelId("deepseek-reasoner")).toBe("deepseek-v4-pro")
    expect(normalizeCodexModelId("deepseek-v4-pro")).toBe("deepseek-v4-pro")
    expect(normalizeCodexModelId("not-a-real-model")).toBe("deepseek-v4-flash")
  })

  test("exposes Codex engine model reasoning efforts (DeepSeek V4 tiers)", () => {
    expect(getCodexReasoningOptions("deepseek-v4-flash").map((option) => option.id)).toEqual([
      "low", "high", "max",
    ])
    expect(getCodexReasoningOptions("deepseek-v4-pro").map((option) => option.id)).toEqual([
      "low", "high", "max",
    ])
  })

  test("preserves all supported Codex engine model and reasoning combinations", () => {
    const combinations = [
      ["deepseek-v4-flash", ["low", "high", "max"]],
      ["deepseek-v4-pro", ["low", "high", "max"]],
    ] as const

    expect(combinations.reduce((count, [, efforts]) => count + efforts.length, 0)).toBe(6)
    for (const [model, efforts] of combinations) {
      for (const effort of efforts) {
        expect(normalizeCodexReasoningEffort(model, effort)).toBe(effort)
      }
    }
  })

  test("normalizes unsupported Codex engine reasoning efforts", () => {
    expect(normalizeCodexReasoningEffort("deepseek-v4-flash", "medium")).toBe("high")
    expect(normalizeCodexReasoningEffort("deepseek-v4-flash", "minimal")).toBe("high")
    expect(normalizeCodexReasoningEffort("deepseek-v4-flash", "unknown")).toBe("high")
    expect(normalizeCodexReasoningEffort("deepseek-v4-pro", "max")).toBe("max")
  })

  test("recognizes public and legacy Codex reasoning values", () => {
    expect(isCodexReasoningEffort("max")).toBe(true)
    expect(isCodexReasoningEffort("ultra")).toBe(true)
    expect(isCodexReasoningEffort("minimal")).toBe(true)
    expect(getCodexReasoningOptions("deepseek-v4-flash").find((option) => option.id === "high")?.label).toBe("High")
    expect(getCodexReasoningOptions("deepseek-v4-pro").find((option) => option.id === "max")?.label).toBe("Max")
  })

  test("uses declarative metadata for Claude max-effort support", () => {
    expect(supportsClaudeMaxReasoningEffort("claude-opus-4-8")).toBe(true)
    expect(supportsClaudeMaxReasoningEffort("opus")).toBe(true)
    expect(supportsClaudeMaxReasoningEffort("fable")).toBe(false)
    expect(supportsClaudeMaxReasoningEffort("claude-sonnet-4-6")).toBe(false)
  })

  test("derives display labels from bare model ids", () => {
    expect(deriveModelLabel("lab/kimi-k2.5:nitro")).toBe("Kimi K2.5")
    expect(deriveModelLabel("gpt-5.6-sol")).toBe("GPT 5.6 Sol")
    expect(deriveModelLabel("openai/gpt-5.6")).toBe("GPT 5.6")
    expect(deriveModelLabel("anthropic/claude-sonnet-5")).toBe("Sonnet 5")
    expect(deriveModelLabel("claude-fable-5")).toBe("Fable 5")
    expect(deriveModelLabel("deepseek/deepseek-v4-pro")).toBe("Deepseek Pro")
    expect(deriveModelLabel("z-ai/glm-5.2")).toBe("GLM 5.2")
    // A dashed "4-8" reads as a dotted version, with or without a "[1m]" marker.
    expect(deriveModelLabel("claude-opus-4-8[1m]")).toBe("Opus 4.8")
    expect(deriveModelLabel("claude-opus-4-8")).toBe("Opus 4.8")
    // A trailing build/date stamp is dropped rather than joined into the version.
    expect(deriveModelLabel("claude-haiku-4-5-20251001")).toBe("Haiku 4.5")
  })

  test("resolves model labels via catalog id, alias, or derived fallback", () => {
    const claudeModels = PROVIDERS.find((provider) => provider.id === "claude")?.models
    expect(resolveModelLabel(claudeModels, "opus")).toBe("Opus")
    // Version-pinned ids (old transcripts, SDK init messages) keep their
    // derived versioned label rather than collapsing to the alias label.
    expect(resolveModelLabel(claudeModels, "claude-opus-4-8")).toBe("Opus 4.8")
    expect(resolveModelLabel(claudeModels, "claude-opus-4-8[1m]")).toBe("Opus 4.8")
    expect(resolveModelLabel(claudeModels, "some-new-model")).toBe("Some New Model")
    expect(resolveModelLabel(undefined, "gpt-5.6-sol")).toBe("GPT 5.6 Sol")
  })

  test("resolves [1m]-suffixed deepseek ids to the catalog label", () => {
    const deepseekModels = PROVIDERS.find((provider) => provider.id === "deepseek")?.models
    // ccb 引擎的 SDK 通道上报 deepseek-v4-flash[1m]，目录匹配前应剥掉窗口标记。
    expect(resolveModelLabel(deepseekModels, "deepseek-v4-flash[1m]")).toBe("DeepSeek Flash")
    expect(resolveModelLabel(deepseekModels, "deepseek-v4-pro[1m]")).toBe("DeepSeek Pro")
    expect(resolveModelLabel(deepseekModels, "deepseek-v4-flash")).toBe("DeepSeek Flash")
  })
})
