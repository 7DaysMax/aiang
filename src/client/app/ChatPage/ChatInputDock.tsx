import { memo, useEffect, type RefObject } from "react"
import { ChatInput, type ChatInputHandle } from "../../components/chat-ui/ChatInput"
import { DockMetricsBar } from "../../components/chat-ui/DockMetricsBar"
import { type ChatDockMetrics, type ContextWindowSnapshot } from "../../lib/contextWindow"
import { useAppSettingsStore } from "../../stores/appSettingsStore"
import { DEEPSEEK_BALANCE_REFRESH_MS, useDeepSeekBalanceStore } from "../../stores/deepSeekBalanceStore"
import { DEEPSEEK_STATUS_REFRESH_MS, useDeepSeekStatusStore } from "../../stores/deepSeekStatusStore"
import type { KannaState } from "../useKannaState"
import type { AgentProvider, ChatSkillsSnapshot } from "../../../shared/types"
import type { VirtualCommand } from "../../lib/virtualCommands"

interface ChatInputDockProps {
  inputRef: RefObject<HTMLDivElement | null>
  onLayoutChange: () => void
  chatInputRef: RefObject<ChatInputHandle | null>
  chatInputElementRef: RefObject<HTMLTextAreaElement | null>
  activeChatId: string | null
  previousPrompt: string | null
  hasSelectedProject: boolean
  runtimeStatus: string | null
  canCancel: boolean
  projectId: string | null
  projectPath: string | null
  projectRepoLabel: string | null
  activeProvider: AgentProvider | null
  availableProviders: KannaState["availableProviders"]
  contextWindowSnapshot: ContextWindowSnapshot | null
  dockMetrics: ChatDockMetrics
  onSubmit: KannaState["handleSend"]
  onCancel: () => void
  onEditModels: () => void
  onListSkills?: (provider: AgentProvider) => Promise<ChatSkillsSnapshot>
  onVirtualCommand?: (command: VirtualCommand) => void
}

const DEFAULT_DOCK_METRICS_VISIBILITY = {
  balance: true,
  cacheHitRate: true,
  averageCacheHitRate: true,
  sessionTokens: true,
  serviceStatus: false,
}

export const ChatInputDock = memo(function ChatInputDock({
  inputRef,
  onLayoutChange,
  chatInputRef,
  chatInputElementRef,
  activeChatId,
  previousPrompt,
  hasSelectedProject,
  runtimeStatus,
  canCancel,
  projectId,
  projectPath,
  projectRepoLabel,
  activeProvider,
  availableProviders,
  contextWindowSnapshot,
  dockMetrics,
  onSubmit,
  onCancel,
  onEditModels,
  onListSkills,
  onVirtualCommand,
}: ChatInputDockProps) {
  const dockMetricsVisible = useAppSettingsStore(
    (store) => store.settings?.dockMetrics ?? DEFAULT_DOCK_METRICS_VISIBILITY,
  )
  const balance = useDeepSeekBalanceStore((store) => store.balance)
  const balanceFailed = useDeepSeekBalanceStore((store) => store.failed)
  const refreshBalance = useDeepSeekBalanceStore((store) => store.refresh)
  const serviceStatus = useDeepSeekStatusStore((store) => store.status)
  const serviceStatusFailed = useDeepSeekStatusStore((store) => store.failed)
  const refreshServiceStatus = useDeepSeekStatusStore((store) => store.refresh)

  // 余额可见时定时刷新；关闭显示后停止轮询。
  useEffect(() => {
    if (!dockMetricsVisible.balance) return
    void refreshBalance()
    const timer = setInterval(() => {
      void refreshBalance()
    }, DEEPSEEK_BALANCE_REFRESH_MS)
    return () => clearInterval(timer)
  }, [dockMetricsVisible.balance, refreshBalance])

  // 服务状态可见时定时刷新（服务端有 60 秒缓存，这里每 2 分钟同步一次）。
  useEffect(() => {
    if (!dockMetricsVisible.serviceStatus) return
    void refreshServiceStatus()
    const timer = setInterval(() => {
      void refreshServiceStatus()
    }, DEEPSEEK_STATUS_REFRESH_MS)
    return () => clearInterval(timer)
  }, [dockMetricsVisible.serviceStatus, refreshServiceStatus])

  const anyMetricVisible = dockMetricsVisible.balance
    || dockMetricsVisible.cacheHitRate
    || dockMetricsVisible.averageCacheHitRate
    || dockMetricsVisible.sessionTokens
    || dockMetricsVisible.serviceStatus

  return (
    <div className="absolute bottom-0 left-0 right-0 z-20 pointer-events-none">
      <div className="relative pointer-events-auto" ref={inputRef}>
        {/* The wash is its own layer, ending at the transcript's scrollbar
            gutter so it stops dimming the scrollbar (which paints below any
            later positioned sibling and can't be raised with z-index). It has
            to be a layer rather than a background on this wrapper: the wrapper
            stays full width so the composer inside it remains centred on the
            card, not on the card minus the gutter. */}
        <div className="absolute inset-y-0 left-0 right-[var(--transcript-scrollbar-w,0px)] bg-gradient-to-t from-background via-background to-background/10 md:to-background/0 pointer-events-none" />
        <div className="relative">
          <ChatInput
            ref={chatInputRef}
            inputElementRef={chatInputElementRef}
            onLayoutChange={onLayoutChange}
            key={activeChatId ?? "new-chat"}
            onSubmit={onSubmit}
            onCancel={onCancel}
            disabled={!hasSelectedProject}
            canCancel={canCancel}
            chatId={activeChatId}
            projectId={projectId}
            projectPath={projectPath}
            projectRepoLabel={projectRepoLabel}
            activeProvider={activeProvider}
            availableProviders={availableProviders}
            contextWindowSnapshot={contextWindowSnapshot}
            previousPrompt={previousPrompt}
            onEditModels={onEditModels}
            onListSkills={onListSkills}
            onVirtualCommand={onVirtualCommand}
          />
          {anyMetricVisible ? (
            <DockMetricsBar
              serviceStatus={serviceStatus}
              serviceStatusFailed={serviceStatusFailed}
              onRefreshServiceStatus={() => void refreshServiceStatus(true)}
              metrics={dockMetrics}
              balance={balance}
              balanceFailed={balanceFailed}
              visible={dockMetricsVisible}
              onRefreshBalance={() => {
                void refreshBalance()
              }}
            />
          ) : null}
        </div>
      </div>
    </div>
  )
})
