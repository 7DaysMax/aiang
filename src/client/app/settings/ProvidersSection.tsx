import { useEffect, useState } from "react"
import {
  chatModeFromFlags,
  chatModeToFlags,
  DEFAULT_OPENAI_SDK_MODEL,
  DEFAULT_OPENROUTER_SDK_MODEL,
  type ChatMode,
  type DeepSeekConnectionTestResult,
  type LlmProviderKind,
} from "../../../shared/types"
import { isPlausibleApiKey } from "../../../shared/api-key"
import { ChatPreferenceControls } from "../../components/chat-ui/ChatPreferenceControls"
import { Button } from "../../components/ui/button"
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogTitle } from "../../components/ui/dialog"
import { Input } from "../../components/ui/input"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select"
import { cn } from "../../lib/utils"
import { useChatPreferencesStore } from "../../stores/chatPreferencesStore"
import { useAppSettingsStore } from "../../stores/appSettingsStore"
import { useCodexInstallStore } from "../../stores/codexInstallStore"
import { VISION_PROVIDER_PRESETS } from "../../../shared/vision"
import type { KannaState } from "../useKannaState"
import { handleSettingsInputKeyDown, SettingsErrorBanner, SettingsRow } from "./shared"
import { SETTINGS_ROWS } from "./registry"

const QUICK_RESPONSE_PROVIDER_OPTIONS: Array<{ value: LlmProviderKind; label: string }> = [
  { value: "openai", label: "OpenAI" },
  { value: "openrouter", label: "OpenRouter" },
  { value: "custom", label: "Custom" },
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

  function handleDefaultProviderChange(nextValue: "last_used" | "deepseek") {
    setDefaultProvider(nextValue)
    void handleWriteAppSettings({ defaultProvider: nextValue }).catch((error) => {
      setProvidersError(error instanceof Error ? error.message : "Unable to save provider settings.")
    })
  }

  function handleProviderDefaultModelChange(provider: "deepseek", model: string) {
    setProviderDefaultModel(provider, model)
    void handleWriteAppSettings({ providerDefaults: { [provider]: { model } } }).catch((error) => {
      setProvidersError(error instanceof Error ? error.message : "Unable to save provider settings.")
    })
  }

  function handleProviderDefaultModeChange(provider: "deepseek", mode: ChatMode) {
    setProviderDefaultMode(provider, mode)
    const flags = chatModeToFlags(mode, providerDefaults[provider].autoPlan)
    void handleWriteAppSettings({ providerDefaults: { [provider]: flags } }).catch((error) => {
      setProvidersError(error instanceof Error ? error.message : "Unable to save provider settings.")
    })
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
        <SettingsRow def={SETTINGS_ROWS.deepseekApiKey}>
          <div className="flex w-full flex-col gap-3">
            <Input
              type="password"
              value={deepseekApiKeyDraft}
              onChange={(event) => setDeepseekApiKeyDraft(event.target.value)}
              onBlur={handleDeepSeekApiKeyChange}
              onKeyDown={(event) => handleSettingsInputKeyDown(event, handleDeepSeekApiKeyChange)}
              placeholder="sk-..."
            />
            <p className="text-xs text-muted-foreground">
              保存在应用设置文件中，也可用环境变量 <code className="font-mono">DEEPSEEK_API_KEY</code> 覆盖。
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
                {deepseekTest.status === "testing" ? "检测中…" : "检测连接并拉取模型"}
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
        <SettingsRow def={SETTINGS_ROWS.visionService} alignStart>
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
                <div className="flex items-center gap-2">
                  <span className="w-16 shrink-0 text-xs text-muted-foreground">服务商</span>
                  <Select
                    value={visionDraft.provider}
                    onValueChange={(value) => writeVisionSettings({ provider: value as "qwen" | "glm" })}
                  >
                    <SelectTrigger className="min-w-[180px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="qwen">千问 (DashScope)</SelectItem>
                        <SelectItem value="glm">GLM (智谱 BigModel)</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>
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
        <SettingsRow def={SETTINGS_ROWS.codexEngine} alignStart>
          <CodexEngineCard />
        </SettingsRow>
      </div>
      <div className="border-b border-border">
        <SettingsRow def={SETTINGS_ROWS.defaultProvider} bordered={false}>
          <Select
            value={defaultProvider}
            onValueChange={(value) => handleDefaultProviderChange(value as "last_used" | "deepseek")}
          >
            <SelectTrigger className="min-w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="last_used">
                  上次使用
                </SelectItem>
                <SelectItem value="deepseek">
                  DeepSeek
                </SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
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
              onModelOptionChange={() => {}}
              mode={chatModeFromFlags(providerDefaults.deepseek.planMode, providerDefaults.deepseek.autoPlan)}
              onModeChange={(mode) => handleProviderDefaultModeChange("deepseek", mode)}
              includeMode
              className="justify-start flex-wrap"
            />
          </div>
        </SettingsRow>

        <SettingsRow def={SETTINGS_ROWS.modelRegistry} description={llmValidationDescription} alignStart>
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
            <Select value={llmProviderDraft.provider} onValueChange={(value) => handleLlmProviderSelection(value as LlmProviderKind)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
              {QUICK_RESPONSE_PROVIDER_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label === "OpenAI" ? "OpenAI" : option.label === "OpenRouter" ? "OpenRouter" : "自定义"}
                </SelectItem>
              ))}
                </SelectGroup>
              </SelectContent>
            </Select>
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
      </div>
      <p className="text-xs text-muted-foreground">
        {installed
          ? "Codex agent 引擎已就绪，可在聊天底部栏切换使用（底层模型为 DeepSeek V4）。"
          : "未检测到本机 codex CLI。点击安装会自动下载官方 codex CLI 并配置为 DeepSeek V4 官方 API，无需手动安装。"}
      </p>
      {!installed ? (
        <div className="flex flex-col gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void install()}
            disabled={installing || checking}
            className="w-fit"
          >
            {installing ? "安装中…（下载官方 codex CLI）" : "一键安装 Codex 引擎"}
          </Button>
        </div>
      ) : null}
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
