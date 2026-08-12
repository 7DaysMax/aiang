import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { Check, Eye, EyeOff, KeyRound, Loader2 } from "lucide-react"
import { useProviderAuthStore } from "../../stores/providerAuthStore"
import { useAppSettingsStore } from "../../stores/appSettingsStore"
import { Button } from "../ui/button"
import { Input } from "../ui/input"

type SetupStep = "deepseek" | "done"

function StepHeading({ title, description }: { title: string; description: string }) {
  return (
    <div className="space-y-2 text-center">
      <h1 className="text-xl font-semibold text-foreground">{title}</h1>
      <p className="mx-auto max-w-sm text-sm leading-6 text-muted-foreground">{description}</p>
    </div>
  )
}

/**
 * Aiang 的首次引导只有一步：填入 DeepSeek API Key（保存在本机设置文件中）。
 * 密钥通过 settings.writeAppSettingsPatch 写入，聊天能力由内置引擎
 * （vendor/ccb/ccb-bin，claude-code-best 逆向版 CLI）在本机驱动。
 */
export function SetupWizard() {
  const open = useProviderAuthStore((store) => store.setupWizardOpen)
  const socket = useProviderAuthStore((store) => store.socket)
  const dismissSetupWizard = useProviderAuthStore((store) => store.dismissSetupWizard)
  const completeSetupWizard = useProviderAuthStore((store) => store.completeSetupWizard)
  const applyOptimisticPatch = useAppSettingsStore((store) => store.applyOptimisticPatch)
  const navigate = useNavigate()

  const [step, setStep] = useState<SetupStep>("deepseek")
  const [keyDraft, setKeyDraft] = useState("")
  const [showKey, setShowKey] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // Finishing onboarding always lands on the home page.
  const handleComplete = () => {
    completeSetupWizard()
    navigate("/")
  }

  // Reset transient state whenever the wizard reopens.
  useEffect(() => {
    if (open) {
      setKeyDraft("")
      setSaveError(null)
      setSaving(false)
      setStep("deepseek")
    }
  }, [open])

  const canSave = keyDraft.trim().length > 0 && !saving

  const handleSave = async () => {
    if (!socket || !canSave) return
    setSaving(true)
    setSaveError(null)
    try {
      const key = keyDraft.trim()
      applyOptimisticPatch({ deepseekApiKey: key })
      await socket.command({ type: "settings.writeAppSettingsPatch", patch: { deepseekApiKey: key } })
      setStep("done")
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "保存失败，请重试。")
    } finally {
      setSaving(false)
    }
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" && canSave) void handleSave()
  }

  const progressPercent = step === "deepseek" ? 50 : 100

  if (!open || !socket) return null

  return (
    <div className="fixed inset-0 z-[70] overflow-y-auto bg-background animate-in fade-in duration-300">
      {/* Low-emphasis escape hatch — suppresses auto-launch, keeps the Setup card. */}
      <button
        type="button"
        onClick={dismissSetupWizard}
        className="absolute right-4 top-4 z-10 rounded-full px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
      >
        稍后再说
      </button>

      <div className="mx-auto flex min-h-full w-full max-w-md flex-col px-6 pb-10 pt-14 sm:pt-20">
        {/* Logo + progress — hidden on the final step, which stands alone. */}
        {step !== "done" ? (
          <div className="mb-10 flex flex-col items-center gap-5">
            <KeyRound className="h-7 w-7 text-logo" />
            <div className="h-1 w-44 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-logo transition-[width] duration-500 ease-out"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        ) : null}

        <div key={step} className="flex flex-1 flex-col animate-in fade-in slide-in-from-bottom-2 duration-300">
          {step === "deepseek" ? (
            <>
              <StepHeading
                title="配置 DeepSeek API Key"
                description="在 platform.deepseek.com 创建 API Key 并粘贴到下面。密钥只保存在本机，所有对话通过内置引擎在本地运行。"
              />
              <div className="mt-8 space-y-2">
                <div className="relative">
                  <Input
                    autoFocus
                    type={showKey ? "text" : "password"}
                    value={keyDraft}
                    onChange={(event) => setKeyDraft(event.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="sk-…"
                    spellCheck={false}
                    autoCapitalize="off"
                    autoCorrect="off"
                    className="pr-10 font-mono"
                    aria-label="DeepSeek API Key"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey((value) => !value)}
                    aria-label={showKey ? "隐藏密钥" : "显示密钥"}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {saveError ? (
                  <p className="text-sm text-destructive">{saveError}</p>
                ) : (
                  <p className="text-xs leading-5 text-muted-foreground">
                    也可以在设置页或环境变量 <code className="rounded border border-border bg-muted px-1 py-0.5 font-mono text-[11px]">DEEPSEEK_API_KEY</code> 中随时修改。
                  </p>
                )}
              </div>
              <div className="mt-auto space-y-2 pt-10">
                <Button className="h-11 w-full" disabled={!canSave} onClick={() => void handleSave()}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  保存并继续
                </Button>
                <Button
                  variant="ghost"
                  onClick={dismissSetupWizard}
                  className="h-10 w-full text-muted-foreground hover:bg-transparent dark:hover:bg-transparent hover:border-transparent hover:text-foreground"
                >
                  跳过
                </Button>
              </div>
            </>
          ) : null}

          {step === "done" ? (
            <>
              <div className="flex flex-col items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-full border border-emerald-500/30 bg-emerald-500/10">
                  <Check className="h-6 w-6 text-emerald-500" />
                </div>
                <StepHeading
                  title="准备就绪"
                  description="Aiang 已配置完成。随时可以在「设置 → 模型服务」里修改密钥和默认模型。"
                />
              </div>
              <div className="mt-auto pt-10">
                <Button className="h-11 w-full" onClick={handleComplete}>
                  开始使用
                </Button>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  )
}
