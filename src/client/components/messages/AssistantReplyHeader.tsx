import type { AgentProvider } from "../../../shared/types"
import { PROVIDERS, resolveModelLabel } from "../../../shared/types"
import { PROVIDER_ICONS } from "../provider-icons"

export interface AssistantModelIdentity {
  provider: AgentProvider
  model: string
}

/**
 * 模型身份行：AI 回复顶部显示「供应商图标 + 模型名」，与 Claude Code 的
 * 助手消息头一致。model 未知（尚未出现 system_init）时不渲染。
 */
export function AssistantReplyHeader({ model }: { model?: AssistantModelIdentity }) {
  if (!model) return null

  const ProviderIcon = PROVIDER_ICONS[model.provider]
  const provider = PROVIDERS.find((candidate) => candidate.id === model.provider)
  const label = resolveModelLabel(provider?.models, model.model)

  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <ProviderIcon data-provider-icon={model.provider} className="h-3.5 w-3.5 text-logo" />
      <span className="font-medium">{label}</span>
    </div>
  )
}
