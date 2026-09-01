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
 * 首次引导：保存一份模型档案（默认按 DeepSeek 预设填）。
 * Claude / Codex / Youmi / ccb 共用这份档案；Cursor 仍走原版登录。
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
      const profile = {
        id: crypto.randomUUID(),
        name: "DeepSeek",
        presetId: "deepseek" as const,
        protocol: "openai-compat" as const,
        baseUrl: "https://api.deepseek.com",
        apiKey: key,
        modelId: "deepseek-v4-flash",
      }
      applyOptimisticPatch({
        deepseekApiKey: key,
        modelProfiles: [profile],
        activeModelProfileId: profile.id,
      })
      await socket.command({
        type: "settings.writeAppSettingsPatch",
        patch: {
          deepseekApiKey: key,
          modelProfiles: [profile],
          activeModelProfileId: profile.id,
        },
      })
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
                title="添加第一份模型档案"
                description="先填一个 API Key。默认按 DeepSeek 官方接口建档，之后可在设置里改成任意中转或 Anthropic。"
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
                    保存后会生成一份模型档案，Claude / Codex / Youmi 都会用它。Cursor 仍只走原版登录。
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
                  description="已写好第一份模型档案。随时可以在「设置 → 模型服务」里换网关或加新档案。"
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
