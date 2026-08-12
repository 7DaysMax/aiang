import { useState } from "react"
import { isNightlyVersion } from "../../../shared/types"
import { SegmentedControl } from "../../components/ui/segmented-control"
import { SettingsHeaderButton } from "../../components/ui/settings-header-button"
import type { KannaState } from "../useKannaState"
import { SETTINGS_ROWS } from "./registry"
import { ENABLED_DISABLED_OPTIONS, SettingsErrorBanner, SettingsRow } from "./shared"

export function LabsSection({
  state,
  appVersion,
}: {
  state: Pick<
    KannaState,
    | "appSettings"
    | "handleWriteAppSettings"
    | "updateSnapshot"
    | "handleInstallNightly"
    | "handleInstallStable"
  >
  appVersion: string
}) {
  const { appSettings, handleWriteAppSettings, updateSnapshot } = state
  const [error, setError] = useState<string | null>(null)

  async function handleRecentChatsChange(nextValue: "enabled" | "disabled") {
    try {
      setError(null)
      await handleWriteAppSettings({ newSidebarEnabled: nextValue === "enabled" })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to save Labs settings.")
    }
  }

  async function handleWebglRendererChange(nextValue: "enabled" | "disabled") {
    try {
      setError(null)
      await handleWriteAppSettings({ terminal: { webglRenderer: nextValue === "enabled" } })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to save Labs settings.")
    }
  }

  async function handleMemoryChange(nextValue: "enabled" | "disabled") {
    try {
      setError(null)
      await handleWriteAppSettings({ memoryEnabled: nextValue === "enabled" })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to save Labs settings.")
    }
  }

  const recentChatsValue = appSettings?.newSidebarEnabled === false ? "disabled" : "enabled"
  const webglRendererValue = appSettings?.terminal.webglRenderer === true ? "enabled" : "disabled"
  const memoryValue = appSettings?.memoryEnabled === true ? "enabled" : "disabled"

  const currentVersionLabel = updateSnapshot?.currentVersion ?? appVersion
  const isUpdating = updateSnapshot?.status === "updating" || updateSnapshot?.status === "restart_pending"
  const onNightly = isNightlyVersion(currentVersionLabel)
  /** 每日构建通道暂时禁用（后端同款拦截，防止拉到原作者仓库覆盖二改）。 */
  const nightlyDisabled = true

  return (
    <>
      {error ? <SettingsErrorBanner message={error} /> : null}
      <div className="border-b border-border">
        <SettingsRow def={SETTINGS_ROWS.recentChatsInSidebar} bordered={false}>
          <SegmentedControl
            value={recentChatsValue}
            onValueChange={(value) => {
              void handleRecentChatsChange(value)
            }}
            options={ENABLED_DISABLED_OPTIONS}
            size="sm"
          />
        </SettingsRow>
        <SettingsRow def={SETTINGS_ROWS.terminalWebglRenderer}>
          <SegmentedControl
            value={webglRendererValue}
            onValueChange={(value) => {
              void handleWebglRendererChange(value)
            }}
            options={ENABLED_DISABLED_OPTIONS}
            size="sm"
          />
        </SettingsRow>
        <SettingsRow def={SETTINGS_ROWS.sessionMemory}>
          <SegmentedControl
            value={memoryValue}
            onValueChange={(value) => {
              void handleMemoryChange(value)
            }}
            options={ENABLED_DISABLED_OPTIONS}
            size="sm"
          />
        </SettingsRow>
        <SettingsRow
          def={SETTINGS_ROWS.nightlyBuilds}
          title={onNightly ? `Nightly build ${currentVersionLabel}` : undefined}
          description={
            nightlyDisabled
              ? "已暂时禁用：每日构建会从原作者仓库构建并覆盖当前二改版本。恢复发布时再开启。"
              : onNightly
                ? "You're running a build of main. The next published release returns you to stable automatically."
                : undefined
          }
        >
          <div className="flex items-center gap-2">
            {onNightly ? (
              <SettingsHeaderButton
                variant="outline"
                onClick={() => {
                  void state.handleInstallStable()
                }}
                disabled={isUpdating}
              >
                Back to stable
              </SettingsHeaderButton>
            ) : null}
            <SettingsHeaderButton
              variant="outline"
              onClick={() => {
                void state.handleInstallNightly()
              }}
              disabled={nightlyDisabled || isUpdating}
              title={nightlyDisabled ? "每日构建已暂时禁用" : undefined}
            >
              {isUpdating
                ? "Updating…"
                : onNightly
                  ? "Rebuild latest main"
                  : nightlyDisabled
                    ? "已禁用"
                    : "Update to nightly"}
            </SettingsHeaderButton>
          </div>
        </SettingsRow>
      </div>
    </>
  )
}
