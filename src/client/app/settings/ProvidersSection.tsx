import { useEffect, useState } from "react"
import { History } from "lucide-react"
import {
  chatModeFromFlags,
  chatModeToFlags,
  DEFAULT_OPENAI_SDK_MODEL,
  DEFAULT_OPENROUTER_SDK_MODEL,
  type AgentProvider,
  type ChatMode,
  type DeepSeekConnectionTestResult,
  type DefaultProviderPreference,
  type LlmProviderKind,
} from "../../../shared/types"
import { isPlausibleApiKey } from "../../../shared/api-key"
import { EMPTY_MODEL_PROFILES } from "../../../shared/model-profile"
import { ChatPreferenceControls } from "../../components/chat-ui/ChatPreferenceControls"
import {
  AnthropicIcon,
  CursorIcon,
  LLM_PROVIDER_ICONS,
  OpenAIIcon,
  PROVIDER_ICONS,
  VISION_PROVIDER_ICONS,
} from "../../components/provider-icons"
import { Button } from "../../components/ui/button"
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogTitle } from "../../components/ui/dialog"
import { Input } from "../../components/ui/input"
import { cn } from "../../lib/utils"
import { useChatPreferencesStore } from "../../stores/chatPreferencesStore"
import { useAppSettingsStore } from "../../stores/appSettingsStore"
import { useCodexInstallStore } from "../../stores/codexInstallStore"
import { useAuthService, useProviderAuthStore } from "../../stores/providerAuthStore"
import { VISION_PROVIDER_PRESETS } from "../../../shared/vision"
import type { KannaState } from "../useKannaState"
import { BrandChoiceGrid, type BrandChoiceOption } from "./BrandChoiceGrid"
import { ModelProfilesPanel } from "./ModelProfilesPanel"
import { handleSettingsInputKeyDown, SettingsErrorBanner, SettingsRow } from "./shared"
import { SETTINGS_ROWS } from "./registry"

const QUICK_RESPONSE_PROVIDER_OPTIONS: Array<{ value: LlmProviderKind; label: string }> = [
  { value: "openai", label: "OpenAI" },
  { value: "openrouter", label: "OpenRouter" },
  { value: "custom", label: "自定义" },
]

const DEFAULT_ENGINE_OPTIONS: Array<BrandChoiceOption<DefaultProviderPreference>> = [
  { value: "last_used", label: "上次使用", icon: History, description: "沿用最近一次对话的引擎" },
  { value: "claude", label: "Claude", icon: PROVIDER_ICONS.claude, description: "原生 Claude Code" },
  { value: "cursor", label: "Cursor", icon: PROVIDER_ICONS.cursor, description: "原版 cursor-agent" },
  { value: "codex", label: "Codex", icon: PROVIDER_ICONS.codex, description: "原生 Codex CLI" },
  { value: "youmi", label: "Youmi", icon: PROVIDER_ICONS.youmi, description: "PenguinHarness" },
  { value: "deepseek", label: "ccb", icon: PROVIDER_ICONS.deepseek, description: "Claude Code 魔改" },
  { value: "reasonix", label: "Reasonix", icon: PROVIDER_ICONS.reasonix, description: "Reasonix 引擎" },
  { value: "pi", label: "Pi", icon: PROVIDER_ICONS.pi, description: "Pi 引擎" },
]

export function ProvidersSection({
  state,
}: {
  state: Pick<
    KannaState,
    | "socket"
    | "availableProviders"
    | "llmProvider"
    | "handleReadLlmProvider"
    | "handleWriteLlmProvider"
    | "handleValidateLlmProvider"
    | "handleWriteFaveModels"
    | "handleWriteAppSettings"
  >
}) {
  const llmProvider = state.llmProvider
  const handleReadLlmProvider = state.handleReadLlmProvider
  const handleWriteLlmProvider = state.handleWriteLlmProvider
  const handleValidateLlmProvider = state.handleValidateLlmProvider
  const handleWriteAppSettings = state.handleWriteAppSettings

  const deepseekApiKey = useAppSettingsStore((store) => store.settings?.deepseekApiKey ?? "")
  const modelProfiles = useAppSettingsStore((store) => store.settings?.modelProfiles ?? EMPTY_MODEL_PROFILES)
  const activeModelProfileId = useAppSettingsStore((store) => store.settings?.activeModelProfileId ?? null)
  const [deepseekApiKeyDraft, setDeepseekApiKeyDraft] = useState(deepseekApiKey)
  const visionService = useAppSettingsStore((store) => store.settings?.visionService)
  const [visionDraft, setVisionDraft] = useState({
    enabled: false,
    provider: "qwen" as "qwen" | "glm",
    apiKey: "",
    baseUrl: "",
    model: "",
  })
  const [visionTest, setVisionTest] = useState<{
    status: "idle" | "testing" | "done"
    ok?: boolean
    message?: string
  }>({ status: "idle" })
  const defaultProvider = useChatPreferencesStore((store) => store.defaultProvider)
  const providerDefaults = useChatPreferencesStore((store) => store.providerDefaults)
  const setDefaultProvider = useChatPreferencesStore((store) => store.setDefaultProvider)
  const setProviderDefaultModel = useChatPreferencesStore((store) => store.setProviderDefaultModel)
  const setProviderDefaultModelOptions = useChatPreferencesStore((store) => store.setProviderDefaultModelOptions)
  const setProviderDefaultMode = useChatPreferencesStore((store) => store.setProviderDefaultMode)

  const [providersError, setProvidersError] = useState<string | null>(null)
  const [llmProviderDraft, setLlmProviderDraft] = useState({
    provider: "openai" as LlmProviderKind,
    apiKey: "",
    model: "",
    baseUrl: "",
  })
  const [llmProviderError, setLlmProviderError] = useState<string | null>(null)
  const [llmValidationStatus, setLlmValidationStatus] = useState<"idle" | "valid" | "invalid">("idle")
  const [llmValidationError, setLlmValidationError] = useState<unknown | null>(null)
  const [llmValidationDialogOpen, setLlmValidationDialogOpen] = useState(false)
  const [deepseekTest, setDeepseekTest] = useState<{
    status: "idle" | "testing" | "done"
    result?: DeepSeekConnectionTestResult
    error?: string
  }>({ status: "idle" })

  useEffect(() => {
    setDeepseekApiKeyDraft(deepseekApiKey)
  }, [deepseekApiKey])

  useEffect(() => {
    if (!visionService) return
    setVisionDraft({
      enabled: visionService.enabled,
      provider: visionService.provider,
      apiKey: visionService.apiKey,
      baseUrl: visionService.baseUrl,
      model: visionService.model,
    })
  }, [visionService])

  // The section only mounts while its tab is selected and the socket is
  // connected, so a plain mount effect matches the old page-gated read.
  useEffect(() => {
    void handleReadLlmProvider()
  }, [handleReadLlmProvider])

  useEffect(() => {
    if (!llmProvider) return
    setLlmProviderDraft({
      provider: llmProvider.provider,
      apiKey: llmProvider.apiKey,
      model: llmProvider.model,
      baseUrl: llmProvider.baseUrl,
    })
  }, [llmProvider])

  useEffect(() => {
    setLlmValidationStatus("idle")
    setLlmValidationError(null)
  }, [llmProviderDraft.provider, llmProviderDraft.apiKey, llmProviderDraft.model, llmProviderDraft.baseUrl])

  function handleDeepSeekApiKeyChange() {
    const nextKey = deepseekApiKeyDraft.trim()
    if (nextKey === deepseekApiKey) return
    if (nextKey && !isPlausibleApiKey(nextKey)) {
      setProvidersError("API Key 格式看起来不对（可能粘贴了错误内容），请检查后重新粘贴。")
      return
    }
    void handleWriteAppSettings({ deepseekApiKey: nextKey }).catch((error) => {
      setProvidersError(error instanceof Error ? error.message : "Unable to save provider settings.")
    })
  }

  async function handleTestDeepSeekConnection() {
    setDeepseekTest({ status: "testing" })
    try {
      const result = await state.socket.command<DeepSeekConnectionTestResult>({ type: "deepseek.testConnection" })
      setDeepseekTest({ status: "done", result })
    } catch (error) {
      setDeepseekTest({ status: "done", error: error instanceof Error ? error.message : String(error) })
    }
  }

  function writeVisionSettings(next: Partial<typeof visionDraft>) {
    const merged = { ...visionDraft, ...next }
    setVisionDraft(merged)
    void handleWriteAppSettings({ visionService: merged }).catch((error) => {
      setProvidersError(error instanceof Error ? error.message : "Unable to save vision service settings.")
    })
  }

  async function handleTestVisionConnection() {
    if (!visionDraft.apiKey.trim()) {
      setVisionTest({ status: "done", ok: false, message: "请先填写 API Key。" })
      return
    }
    setVisionTest({ status: "testing" })
    try {
      const result = await state.socket.command<{ ok: boolean; message: string }>({
        type: "vision.testConnection",
        provider: visionDraft.provider,
        apiKey: visionDraft.apiKey.trim(),
        baseUrl: visionDraft.baseUrl.trim() || undefined,
        model: visionDraft.model.trim() || undefined,
      })
      setVisionTest({ status: "done", ok: result.ok, message: result.message })
    } catch (error) {
      setVisionTest({ status: "done", ok: false, message: error instanceof Error ? error.message : String(error) })
    }
  }

  function DeepSeekTestResultView({ result }: { result: DeepSeekConnectionTestResult }) {
    if (result.ok) {
      return (
        <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-2 text-xs">
          <p className="font-medium text-emerald-600 dark:text-emerald-400">✓ 连接成功，Key 有效</p>
          <p className="mt-0.5 text-muted-foreground">
            拉取到 {result.modelCount} 个模型
            {result.totalBalance ? ` · 余额 ${result.totalBalance}${result.currency ?? ""}` : ""}
          </p>
          <ul className="mt-1 max-h-32 space-y-0.5 overflow-y-auto font-mono text-foreground/80">
            {result.models.map((model) => (
              <li key={model.id}>{model.id}</li>
            ))}
          </ul>
        </div>
      )
    }
    const reason = result.error === "missing_key"
      ? "未配置 API Key，请先填写并保存。"
      : result.error === "invalid_key"
        ? "Key 格式看起来不对（可能粘贴了错误内容），请检查后重新粘贴。"
        : result.error === "unauthorized"
          ? "Key 无效（接口返回 401），请检查后重新粘贴。"
          : "无法连接 DeepSeek 服务（网络或端点异常），请稍后重试。"
    return (
      <div className="rounded-md border border-red-500/30 bg-red-500/10 p-2 text-xs">
        <p className="font-medium text-red-600 dark:text-red-400">✗ 检测失败：{reason}</p>
      </div>
    )
  }

  function handleDefaultProviderChange(nextValue: DefaultProviderPreference) {
    setDefaultProvider(nextValue)
    void handleWriteAppSettings({ defaultProvider: nextValue }).catch((error) => {
      setProvidersError(error instanceof Error ? error.message : "Unable to save provider settings.")
    })
  }

  function handleProviderDefaultModelChange(provider: AgentProvider, model: string) {
    setProviderDefaultModel(provider, model)
    void handleWriteAppSettings({ providerDefaults: { [provider]: { model } } }).catch((error) => {
      setProvidersError(error instanceof Error ? error.message : "Unable to save provider settings.")
    })
  }

  function handleProviderDefaultModeChange(provider: AgentProvider, mode: ChatMode) {
    setProviderDefaultMode(provider, mode)
    const flags = chatModeToFlags(mode, providerDefaults[provider].autoPlan)
    void handleWriteAppSettings({ providerDefaults: { [provider]: flags } }).catch((error) => {
      setProvidersError(error instanceof Error ? error.message : "Unable to save provider settings.")
    })
  }

  function handleProviderDefaultModelOptionsChange(
    provider: AgentProvider,
    change: { type: string; effort?: string; fastMode?: boolean },
  ) {
    if (change.type === "deepseekReasoningEffort" && change.effort) {
      const modelOptions = { reasoningEffort: change.effort as "low" | "high" | "max" }
      setProviderDefaultModelOptions(provider, modelOptions)
      void handleWriteAppSettings({ providerDefaults: { [provider]: { modelOptions } } }).catch((error) => {
        setProvidersError(error instanceof Error ? error.message : "Unable to save provider settings.")
      })
    }
    if (change.type === "fastMode" && typeof change.fastMode === "boolean") {
      const modelOptions = { fastMode: change.fastMode }
      setProviderDefaultModelOptions(provider, modelOptions)
      void handleWriteAppSettings({ providerDefaults: { [provider]: { modelOptions } } }).catch((error) => {
        setProvidersError(error instanceof Error ? error.message : "Unable to save provider settings.")
      })
    }
  }

  async function commitLlmProvider(nextValue = llmProviderDraft) {
    try {
      setLlmProviderError(null)
      await handleWriteLlmProvider(nextValue)
      const validation = await handleValidateLlmProvider(nextValue)
      setLlmValidationStatus(validation.ok ? "valid" : "invalid")
      setLlmValidationError(validation.error)
    } catch (error) {
      const fallbackError = error instanceof Error
        ? { name: error.name, message: error.message }
        : error
      setLlmValidationStatus("invalid")
      setLlmValidationError(fallbackError)
      setLlmProviderError(error instanceof Error ? error.message : "Unable to save Model Registry settings.")
    }
  }

  function handleLlmProviderSelection(nextProvider: LlmProviderKind) {
    const nextDraft = {
      ...llmProviderDraft,
      provider: nextProvider,
      model: nextProvider === "openai"
        ? DEFAULT_OPENAI_SDK_MODEL
        : nextProvider === "openrouter"
          ? DEFAULT_OPENROUTER_SDK_MODEL
          : llmProviderDraft.model,
      baseUrl: nextProvider === "custom" ? llmProviderDraft.baseUrl : "",
    }
    setLlmProviderDraft(nextDraft)
    void commitLlmProvider(nextDraft)
  }

  const llmValidationErrorText = llmValidationError ? JSON.stringify(llmValidationError, null, 2) : ""
  const llmValidationDescription = (
    <>
      <span>
        OpenAI 兼容 API，用于对话命名、提交信息生成等。支持 OpenAI、OpenRouter 或任意自定义端点。配置文件：{llmProvider?.filePathDisplay ?? "llm-provider.json"}。
      </span>
      <span
        className={cn(
          "mt-2 block text-sm font-medium",
          llmValidationStatus === "valid"
            ? "text-emerald-600 dark:text-emerald-400"
            : llmValidationStatus === "invalid"
              ? "text-destructive"
              : "hidden"
        )}
      >
        {llmValidationStatus === "valid" ? (
          "凭据有效，已保存"
        ) : llmValidationStatus === "invalid" ? (
          <>
            <span>凭据无效。</span>
            {llmValidationError ? (
              <>
                {" "}
                <button
                  type="button"
                  onClick={() => setLlmValidationDialogOpen(true)}
                  className="underline underline-offset-2"
                >
                  查看错误
                </button>
              </>
            ) : null}
          </>
        ) : null}
      </span>
    </>
  )

  return (
    <>
      {providersError ? <SettingsErrorBanner message={providersError} /> : null}
      <div className="space-y-3 pb-6">
        <SettingsRow def={SETTINGS_ROWS.modelProfiles} alignStart fullWidth>
          <ModelProfilesPanel
            modelProfiles={modelProfiles}
            activeModelProfileId={activeModelProfileId}
            onWrite={handleWriteAppSettings}
            onError={setProvidersError}
          />
        </SettingsRow>
        <SettingsRow def={SETTINGS_ROWS.deepseekApiKey}>
          <div className="flex w-full flex-col gap-3">
            <Input
              type="password"
              value={deepseekApiKeyDraft}
              onChange={(event) => setDeepseekApiKeyDraft(event.target.value)}
              onBlur={handleDeepSeekApiKeyChange}
              onKeyDown={(event) => handleSettingsInputKeyDown(event, handleDeepSeekApiKeyChange)}
              placeholder="没有档案时的回退 Key（可选）"
            />
            <p className="text-xs text-muted-foreground">
              有档案时不会用到。环境变量 <code className="font-mono">DEEPSEEK_API_KEY</code> 也可回退。
            </p>
            <div className="flex flex-col gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void handleTestDeepSeekConnection()}
                disabled={deepseekTest.status === "testing"}
                className="w-fit"
              >
                {deepseekTest.status === "testing" ? "检测中…" : "检测 DeepSeek 回退连接"}
              </Button>
              {deepseekTest.status === "done" && deepseekTest.result ? (
                <DeepSeekTestResultView result={deepseekTest.result} />
              ) : null}
              {deepseekTest.status === "done" && deepseekTest.error ? (
                <div className="rounded-md border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-600 dark:text-red-400">
                  ✗ 检测失败：{deepseekTest.error}
                </div>
              ) : null}
            </div>
          </div>
        </SettingsRow>
        <SettingsRow def={SETTINGS_ROWS.visionService} alignStart fullWidth>
          <div className="flex w-full flex-col gap-3">
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={visionDraft.enabled}
                onChange={(event) => writeVisionSettings({ enabled: event.target.checked })}
                className="size-4 accent-primary"
              />
              启用识图服务（给三个引擎注册 describe_image MCP 工具）
            </label>
            {visionDraft.enabled ? (
              <div className="flex flex-col gap-3">
                <BrandChoiceGrid
                  value={visionDraft.provider}
                  onChange={(value) => writeVisionSettings({ provider: value })}
                  columnsClassName="grid-cols-2"
                  options={[
                    {
                      value: "qwen" as const,
                      label: "千问",
                      icon: VISION_PROVIDER_ICONS.qwen,
                      description: "DashScope",
                    },
                    {
                      value: "glm" as const,
                      label: "GLM",
                      icon: VISION_PROVIDER_ICONS.glm,
                      description: "智谱 BigModel",
                    },
                  ]}
                />
                <Input
                  type="password"
                  value={visionDraft.apiKey}
                  onChange={(event) => setVisionDraft({ ...visionDraft, apiKey: event.target.value })}
                  onBlur={() => writeVisionSettings({ apiKey: visionDraft.apiKey.trim() })}
                  onKeyDown={(event) => handleSettingsInputKeyDown(event, () => writeVisionSettings({ apiKey: visionDraft.apiKey.trim() }))}
                  placeholder={`${VISION_PROVIDER_PRESETS[visionDraft.provider].label} API Key`}
                />
                <a
                  href={VISION_PROVIDER_PRESETS[visionDraft.provider].siteUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="w-fit text-xs text-primary underline-offset-4 hover:underline"
                >
                  打开 {VISION_PROVIDER_PRESETS[visionDraft.provider].label} 官网（获取 API Key）↗
                </a>
                <Input
                  value={visionDraft.baseUrl}
                  onChange={(event) => setVisionDraft({ ...visionDraft, baseUrl: event.target.value })}
                  onBlur={() => writeVisionSettings({ baseUrl: visionDraft.baseUrl.trim() })}
                  onKeyDown={(event) => handleSettingsInputKeyDown(event, () => writeVisionSettings({ baseUrl: visionDraft.baseUrl.trim() }))}
                  placeholder={`默认 ${VISION_PROVIDER_PRESETS[visionDraft.provider].baseUrl}`}
                />
                <Input
                  value={visionDraft.model}
                  onChange={(event) => setVisionDraft({ ...visionDraft, model: event.target.value })}
                  onBlur={() => writeVisionSettings({ model: visionDraft.model.trim() })}
                  onKeyDown={(event) => handleSettingsInputKeyDown(event, () => writeVisionSettings({ model: visionDraft.model.trim() }))}
                  placeholder={`默认 ${VISION_PROVIDER_PRESETS[visionDraft.provider].model}`}
                />
                <div className="flex flex-col gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void handleTestVisionConnection()}
                    disabled={visionTest.status === "testing"}
                    className="w-fit"
                  >
                    {visionTest.status === "testing" ? "检测中…" : "检测连接"}
                  </Button>
                  {visionTest.status === "done" && visionTest.message ? (
                    <div
                      className={cn(
                        "rounded-md border p-2 text-xs",
                        visionTest.ok
                          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                          : "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400",
                      )}
                    >
                      {visionTest.ok ? "✓ " : "✗ "}
                      {visionTest.message}
                    </div>
                  ) : null}
                </div>
                <p className="text-xs text-muted-foreground">
                  贴图时 agent 会调用 <code className="font-mono">describe_image</code> 工具，由视觉模型生成图片描述后继续任务。
                  建议用 GLM 的 <code className="font-mono">glm-4v-flash</code>（免费），或千问的 <code className="font-mono">qwen-vl-max-latest</code>。
                </p>
              </div>
            ) : null}
          </div>
        </SettingsRow>
        <SettingsRow def={SETTINGS_ROWS.claudeEngine} alignStart>
          <ClaudeEngineCard />
        </SettingsRow>
        <SettingsRow def={SETTINGS_ROWS.codexEngine} alignStart>
          <CodexEngineCard />
        </SettingsRow>
        <SettingsRow def={SETTINGS_ROWS.cursorEngine} alignStart>
          <CursorEngineCard />
        </SettingsRow>
      </div>
      <div className="border-b border-border">
        <SettingsRow def={SETTINGS_ROWS.defaultProvider} bordered={false} fullWidth>
          <BrandChoiceGrid
            value={defaultProvider}
            onChange={handleDefaultProviderChange}
            options={DEFAULT_ENGINE_OPTIONS}
          />
        </SettingsRow>

        <SettingsRow def={SETTINGS_ROWS.youmiDefaults} alignStart>
          <div className="">
            <ChatPreferenceControls
              availableProviders={state.availableProviders}
              selectedProvider="youmi"
              showProviderPicker={false}
              providerLocked
              model={providerDefaults.youmi.model}
              modelOptions={providerDefaults.youmi.modelOptions}
              onModelChange={(_, model) => {
                handleProviderDefaultModelChange("youmi", model)
              }}
              onModelOptionChange={(change) => {
                handleProviderDefaultModelOptionsChange("youmi", change)
              }}
              mode={chatModeFromFlags(providerDefaults.youmi.planMode, providerDefaults.youmi.autoPlan)}
              onModeChange={(mode) => handleProviderDefaultModeChange("youmi", mode)}
              includeMode
              className="justify-start flex-wrap"
            />
          </div>
        </SettingsRow>

        <SettingsRow def={SETTINGS_ROWS.deepseekDefaults} alignStart>
          <div className="">
            <ChatPreferenceControls
              availableProviders={state.availableProviders}
              selectedProvider="deepseek"
              showProviderPicker={false}
              providerLocked
              model={providerDefaults.deepseek.model}
              modelOptions={providerDefaults.deepseek.modelOptions}
              onModelChange={(_, model) => {
                handleProviderDefaultModelChange("deepseek", model)
              }}
              onModelOptionChange={(change) => {
                handleProviderDefaultModelOptionsChange("deepseek", change)
              }}
              mode={chatModeFromFlags(providerDefaults.deepseek.planMode, providerDefaults.deepseek.autoPlan)}
              onModeChange={(mode) => handleProviderDefaultModeChange("deepseek", mode)}
              includeMode
              className="justify-start flex-wrap"
            />
          </div>
        </SettingsRow>

        <SettingsRow def={SETTINGS_ROWS.cursorDefaults} alignStart>
          <div className="">
            <ChatPreferenceControls
              availableProviders={state.availableProviders}
              selectedProvider="cursor"
              showProviderPicker={false}
              providerLocked
              model={providerDefaults.cursor.model}
              modelOptions={providerDefaults.cursor.modelOptions}
              onModelChange={(_, model) => {
                handleProviderDefaultModelChange("cursor", model)
              }}
              onModelOptionChange={(change) => {
                handleProviderDefaultModelOptionsChange("cursor", change)
              }}
              includeMode={false}
              className="justify-start flex-wrap"
            />
          </div>
        </SettingsRow>

        <SettingsRow def={SETTINGS_ROWS.modelRegistry} description={llmValidationDescription} alignStart fullWidth>
          <div className="flex w-full  flex-col gap-3">
            {llmProviderError ? (
              <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                {llmProviderError}
              </div>
            ) : null}
            {llmProvider?.warning ? (
              <div className="rounded-lg border border-border bg-card/30 px-4 py-3 text-sm text-muted-foreground">
                {llmProvider.warning}
              </div>
            ) : null}
            <BrandChoiceGrid
              value={llmProviderDraft.provider}
              onChange={(value) => handleLlmProviderSelection(value)}
              columnsClassName="grid-cols-3"
              options={QUICK_RESPONSE_PROVIDER_OPTIONS.map((option) => ({
                value: option.value,
                label: option.label,
                icon: LLM_PROVIDER_ICONS[option.value],
              }))}
            />
            {llmProviderDraft.provider === "custom" ? (
              <Input
                value={llmProviderDraft.baseUrl}
                onChange={(event) => setLlmProviderDraft((current) => ({ ...current, baseUrl: event.target.value }))}
                onBlur={() => void commitLlmProvider()}
                onKeyDown={(event) => handleSettingsInputKeyDown(event, () => void commitLlmProvider())}
                placeholder="https://your-provider.example/v1"
              />
            ) : null}
            <Input
              type="password"
              value={llmProviderDraft.apiKey}
              onChange={(event) => setLlmProviderDraft((current) => ({ ...current, apiKey: event.target.value }))}
              onBlur={() => void commitLlmProvider()}
              onKeyDown={(event) => handleSettingsInputKeyDown(event, () => void commitLlmProvider())}
              placeholder="API Key"
            />
            <Input
              value={llmProviderDraft.model}
              onChange={(event) => setLlmProviderDraft((current) => ({ ...current, model: event.target.value }))}
              onBlur={() => void commitLlmProvider()}
              onKeyDown={(event) => handleSettingsInputKeyDown(event, () => void commitLlmProvider())}
              placeholder="快速回复模型 ID（用于命名对话、生成提交信息）"
            />
          </div>
        </SettingsRow>
      </div>
      <Dialog open={llmValidationDialogOpen} onOpenChange={setLlmValidationDialogOpen}>
        <DialogContent size="lg">
          <DialogBody className="space-y-4">
            <DialogTitle>校验错误</DialogTitle>
            <pre className="max-h-[60vh] overflow-auto rounded-lg border border-border bg-muted p-3 text-xs font-mono whitespace-pre-wrap break-words">
              {llmValidationErrorText}
            </pre>
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" size="sm" onClick={() => setLlmValidationDialogOpen(false)}>
              关闭
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function EngineUpdateChoice({
  engineName,
  currentVersion,
  latestVersion,
  updateAvailable,
  checking,
  upgrading,
  onCheck,
  onUpgrade,
}: {
  engineName: string
  currentVersion?: string | null
  latestVersion?: string | null
  updateAvailable?: boolean
  checking?: boolean
  upgrading?: boolean
  onCheck: () => void
  onUpgrade: () => void
}) {
  if (updateAvailable && latestVersion) {
    return (
      <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-xs">
        <p className="font-medium text-foreground">
          发现新版本 {latestVersion}
          {currentVersion ? `（当前 ${currentVersion}）` : ""}。是否升级？
        </p>
        <p className="mt-0.5 text-muted-foreground">不会自动升级，由你选择。</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Button type="button" size="sm" onClick={onUpgrade} disabled={upgrading || checking}>
            {upgrading ? "升级中…" : `升级到 ${latestVersion}`}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={onCheck} disabled={checking || upgrading}>
            {checking ? "检测中…" : "重新检测"}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-muted-foreground">
        {latestVersion && currentVersion && latestVersion === currentVersion
          ? `已是最新版本 ${currentVersion}`
          : latestVersion
            ? `最新 ${latestVersion}`
            : "可检查是否有更新"}
      </span>
      <Button type="button" variant="outline" size="sm" onClick={onCheck} disabled={checking || upgrading}>
        {checking ? "检测中…" : "检查更新"}
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={onUpgrade} disabled={upgrading || checking}>
        {upgrading ? "升级中…" : "升级到最新版"}
      </Button>
    </div>
  )
}

function ClaudeEngineCard() {
  const claude = useAuthService("claude")
  const socket = useProviderAuthStore((store) => store.socket)
  const [refreshing, setRefreshing] = useState(false)
  const installing = claude?.installState === "installing"
  const installed = claude?.installed === true
  const checking = !claude || claude.authStatus === "unknown" || refreshing

  function installClaude() {
    if (!socket) return
    void socket.command({ type: "auth.install", service: "claude" }).catch(() => undefined)
  }

  async function checkClaudeUpdates() {
    if (!socket) return
    setRefreshing(true)
    try {
      await socket.command({ type: "auth.refresh", force: true })
    } catch {
      // Snapshot still updates on the auth topic when the probe finishes.
    } finally {
      setRefreshing(false)
    }
  }

  const statusLabel = checking
    ? "检测中…"
    : installing
      ? "安装中…"
      : installed
        ? claude?.updateAvailable
          ? "有更新"
          : "已安装"
        : "未安装"

  return (
    <div className="flex w-full flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <AnthropicIcon className="h-4 w-4" />
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
            installed
              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
              : "bg-muted text-muted-foreground",
          )}
        >
          <span className={cn("h-1.5 w-1.5 rounded-full", installed ? "bg-emerald-500" : "bg-muted-foreground/50")} />
          {statusLabel}
        </span>
        {claude?.version ? (
          <code className="text-xs text-muted-foreground">{claude.version}</code>
        ) : null}
        {claude?.latestVersion ? (
          <span className="text-xs text-muted-foreground">最新 {claude.latestVersion}</span>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">
        {installed
          ? "原版 Claude Code CLI 已就绪。有新版本时不会自动覆盖，需你确认。"
          : "未检测到 claude CLI。安装后可用官方引擎；也可以继续只用模型档案驱动内置通道。"}
      </p>
      {installed ? (
        <EngineUpdateChoice
          engineName="Claude"
          currentVersion={claude?.version}
          latestVersion={claude?.latestVersion}
          updateAvailable={claude?.updateAvailable}
          checking={checking}
          upgrading={installing}
          onCheck={() => void checkClaudeUpdates()}
          onUpgrade={() => installClaude()}
        />
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => installClaude()}
          disabled={installing || !socket}
          className="w-fit"
        >
          {installing ? "安装中…" : "一键安装 Claude 引擎"}
        </Button>
      )}
      {claude?.installState === "error" && claude.installError ? (
        <div className="rounded-md border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-600 dark:text-red-400">
          ✗ 安装失败：{claude.installError}
        </div>
      ) : null}
      {claude?.statusDetail ? (
        <p className="text-xs text-muted-foreground">{claude.statusDetail}</p>
      ) : null}
    </div>
  )
}

function CodexEngineCard() {
  const detected = useCodexInstallStore((store) => store.detected)
  const checking = useCodexInstallStore((store) => store.checking)
  const installing = useCodexInstallStore((store) => store.installing)
  const lastInstallResult = useCodexInstallStore((store) => store.lastInstallResult)
  const lastError = useCodexInstallStore((store) => store.lastError)
  const detect = useCodexInstallStore((store) => store.detect)
  const install = useCodexInstallStore((store) => store.install)

  useEffect(() => {
    if (!detected) void detect()
  }, [detected, detect])

  const installed = detected?.installed === true

  return (
    <div className="flex w-full flex-col gap-3">
      <div className="flex items-center gap-2 text-sm">
        <OpenAIIcon className="h-4 w-4" />
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
            installed
              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
              : checking
                ? "bg-muted text-muted-foreground"
                : "bg-muted text-muted-foreground"
          )}
        >
          <span className={cn("h-1.5 w-1.5 rounded-full", installed ? "bg-emerald-500" : "bg-muted-foreground/50")} />
          {checking ? "检测中…" : installed ? "已安装" : "未安装"}
        </span>
        {detected?.version ? (
          <code className="text-xs text-muted-foreground">{detected.version}</code>
        ) : null}
        {detected?.latestVersion ? (
          <span className="text-xs text-muted-foreground">最新 {detected.latestVersion}</span>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">
        {installed
          ? "Codex agent 引擎已就绪，可在聊天底部栏切换使用。有新版本时不会自动覆盖，需你确认。"
          : "未检测到本机 codex CLI。点击安装会自动下载官方 Codex CLI 并写入当前模型档案。"}
      </p>
      {installed ? (
        <EngineUpdateChoice
          engineName="Codex"
          currentVersion={detected?.version}
          latestVersion={detected?.latestVersion}
          updateAvailable={detected?.updateAvailable}
          checking={checking}
          upgrading={installing}
          onCheck={() => void detect()}
          onUpgrade={() => void install(true)}
        />
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void install()}
          disabled={installing || checking}
          className="w-fit"
        >
          {installing ? "安装中…（下载官方 Codex CLI）" : "一键安装 Codex 引擎"}
        </Button>
      )}
      {lastInstallResult && !lastInstallResult.ok ? (
        <div className="rounded-md border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-600 dark:text-red-400">
          ✗ 安装失败：{lastInstallResult.message}
        </div>
      ) : null}
      {lastError ? (
        <div className="rounded-md border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-600 dark:text-red-400">
          ✗ 检测失败：{lastError}
        </div>
      ) : null}
    </div>
  )
}

function CursorEngineCard() {
  const cursor = useAuthService("cursor")
  const socket = useProviderAuthStore((store) => store.socket)
  const login = cursor?.login
  const [refreshing, setRefreshing] = useState(false)
  const installing = cursor?.installState === "installing"
  const installed = cursor?.installed === true
  const signedIn = cursor?.authStatus === "signed_in"
  const loginBusy = login?.phase === "starting" || login?.phase === "waiting_for_approval" || login?.phase === "finishing"
  const checking = !cursor || cursor.authStatus === "unknown" || refreshing

  function installCursor() {
    if (!socket) return
    void socket.command({ type: "auth.install", service: "cursor" }).catch(() => undefined)
  }

  async function checkCursorUpdates() {
    if (!socket) return
    setRefreshing(true)
    try {
      await socket.command({ type: "auth.refresh", force: true })
    } catch {
      // Snapshot still updates on the auth topic when the probe finishes.
    } finally {
      setRefreshing(false)
    }
  }

  function startCursorLogin() {
    if (!socket) return
    void socket.command({ type: "auth.login.start", service: "cursor" }).catch(() => undefined)
  }

  function cancelCursorLogin() {
    if (!socket) return
    void socket.command({ type: "auth.login.cancel", service: "cursor" }).catch(() => undefined)
  }

  const statusLabel = checking
    ? "检测中…"
    : installing
      ? "安装中…"
      : signedIn
        ? "已登录"
        : installed
          ? "已安装 · 未登录"
          : "未安装"

  return (
    <div className="flex w-full flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <CursorIcon className="h-4 w-4" />
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
            signedIn
              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
              : "bg-muted text-muted-foreground",
          )}
        >
          <span className={cn("h-1.5 w-1.5 rounded-full", signedIn ? "bg-emerald-500" : "bg-muted-foreground/50")} />
          {statusLabel}
        </span>
        {cursor?.version ? (
          <code className="text-xs text-muted-foreground">{cursor.version}</code>
        ) : null}
        {cursor?.latestVersion ? (
          <span className="text-xs text-muted-foreground">最新 {cursor.latestVersion}</span>
        ) : null}
        {cursor?.account ? (
          <span className="text-xs text-muted-foreground">{cursor.account}</span>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">
        {signedIn
          ? "Cursor 引擎已就绪。在聊天底部栏切换到 Cursor，即可用本机 cursor-agent 控制 Cursor（Composer 等账号内模型）。"
          : installed
            ? "已检测到 cursor-agent。登录 Cursor 账号后即可在对话里使用该引擎。"
            : "未检测到 cursor-agent。Windows 会走官方 PowerShell 安装脚本；也可先安装 Cursor 桌面版。macOS / Linux 使用 curl https://cursor.com/install。"}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {!installed ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => installCursor()}
            disabled={installing || !socket}
            className="w-fit"
          >
            {installing ? "安装中…" : "一键安装 Cursor 引擎"}
          </Button>
        ) : (
          <div className="w-full">
          <EngineUpdateChoice
            engineName="Cursor"
            currentVersion={cursor?.version}
            latestVersion={cursor?.latestVersion}
            updateAvailable={cursor?.updateAvailable}
            checking={checking}
            upgrading={installing}
            onCheck={() => void checkCursorUpdates()}
            onUpgrade={() => installCursor()}
          />
          </div>
        )}
        {installed && !signedIn && !loginBusy ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => startCursorLogin()}
            disabled={!socket}
            className="w-fit"
          >
            登录 Cursor
          </Button>
        ) : null}
        {loginBusy ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => cancelCursorLogin()}
            className="w-fit"
          >
            取消登录
          </Button>
        ) : null}
      </div>
      {login?.phase === "waiting_for_approval" ? (
        <div className="rounded-md border border-border bg-muted/30 p-2 text-xs text-muted-foreground">
          <p>在浏览器完成 Cursor 登录后会自动检测。</p>
          <a
            href={login.verificationUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-1 inline-block text-foreground underline underline-offset-2"
          >
            打开登录页
          </a>
        </div>
      ) : null}
      {login?.phase === "starting" ? (
        <p className="text-xs text-muted-foreground">正在启动 cursor-agent 登录…</p>
      ) : null}
      {login?.phase === "error" ? (
        <div className="rounded-md border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-600 dark:text-red-400">
          ✗ 登录失败：{login.message}
          {login.hint ? <p className="mt-1 text-muted-foreground">{login.hint}</p> : null}
        </div>
      ) : null}
      {cursor?.installState === "error" && cursor.installError ? (
        <div className="rounded-md border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-600 dark:text-red-400">
          ✗ 安装失败：{cursor.installError}
        </div>
      ) : null}
      {cursor?.statusDetail ? (
        <p className="text-xs text-muted-foreground">{cursor.statusDetail}</p>
      ) : null}
    </div>
  )
}
