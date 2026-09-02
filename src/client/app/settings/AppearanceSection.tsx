import { useEffect, useState } from "react"
import {
  DEFAULT_BEAUTIFUL_UI_PREFERENCES,
  type BeautifulUiPreferences,
} from "../../../shared/types"
import CodeBlock, { type DiffRow } from "../../../components/primitives/CodeBlock"
import LoadingState from "../../../components/primitives/LoadingState"
import PromptBar from "../../../components/primitives/PromptBar"
import TaskRows, { type TaskRow } from "../../../components/primitives/TaskRows"
import ThinkingState from "../../../components/primitives/ThinkingState"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card"
import { SegmentedControl, type SegmentedOption } from "../../components/ui/segmented-control"
import type { KannaState } from "../useKannaState"
import { BeautifulUiGallery } from "./BeautifulUiGallery"
import { SETTINGS_ROWS } from "./registry"
import { SettingsErrorBanner, SettingsRow } from "./shared"

const OPTIONS: { [K in keyof BeautifulUiPreferences]: SegmentedOption<BeautifulUiPreferences[K]>[] } = {
  loading: ["Drive", "Dots", "Orbit", "Surfer"].map((value) => ({ value, label: value })) as SegmentedOption<BeautifulUiPreferences["loading"]>[],
  thinking: ["Steps", "Reasoning", "Search", "Coding"].map((value) => ({ value, label: value })) as SegmentedOption<BeautifulUiPreferences["thinking"]>[],
  taskRows: ["Capsules", "List"].map((value) => ({ value, label: value })) as SegmentedOption<BeautifulUiPreferences["taskRows"]>[],
  promptBar: ["Rounded", "Pill"].map((value) => ({ value, label: value })) as SegmentedOption<BeautifulUiPreferences["promptBar"]>[],
  codeBlock: ["Code", "Diff"].map((value) => ({ value, label: value })) as SegmentedOption<BeautifulUiPreferences["codeBlock"]>[],
}

type PreviewKind = keyof BeautifulUiPreferences

const PREVIEW_OPTIONS: SegmentedOption<PreviewKind>[] = [
  { value: "loading", label: "加载" },
  { value: "thinking", label: "思考" },
  { value: "taskRows", label: "任务" },
  { value: "promptBar", label: "输入" },
  { value: "codeBlock", label: "代码" },
]

const PREVIEW_TITLES: Record<PreviewKind, string> = {
  loading: "Loading State",
  thinking: "Thinking",
  taskRows: "Task Rows",
  promptBar: "Prompt Bar",
  codeBlock: "Code Block",
}

const PREFERENCE_KEYS = Object.keys(DEFAULT_BEAUTIFUL_UI_PREFERENCES) as PreviewKind[]

const PREVIEW_TASKS: TaskRow[] = [
  {
    key: "inspect",
    label: "检查流式事件",
    amount: "done",
    status: "done",
    step: 1,
    details: [{ label: "确认正文与思考 delta", meta: "完成" }],
  },
  {
    key: "adapt",
    label: "适配界面组件",
    amount: "now",
    status: "running",
    step: 2,
    details: [{ label: "同步当前样式设置", meta: "进行中" }],
  },
  {
    key: "verify",
    label: "完成浏览器验证",
    amount: "queued",
    status: "pending",
    step: 3,
    details: [{ label: "检查明暗主题与窄屏", meta: "等待" }],
  },
]

const PREVIEW_CODE = "export function stream(delta: string) {\n  return appendMessage(delta)\n}"
const PREVIEW_DIFF: DiffRow[] = [
  { old: 1, cur: 1, type: "ctx", pieces: [{ text: "export function stream(delta: string) {" }] },
  { old: 2, cur: null, type: "del", pieces: [{ text: "  return renderAtOnce(delta)", change: "del" }] },
  { old: null, cur: 2, type: "add", pieces: [{ text: "  return appendMessage(delta)", change: "add" }] },
  { old: 3, cur: 3, type: "ctx", pieces: [{ text: "}" }] },
]

function AppearancePreview({
  active,
  onActiveChange,
  preferences,
}: {
  active: PreviewKind
  onActiveChange: (active: PreviewKind) => void
  preferences: BeautifulUiPreferences
}) {
  return (
    <Card className="overflow-hidden rounded-xl border border-border">
      <CardHeader className="gap-3 border-b border-border p-4 md:flex-row md:items-center md:justify-between">
        <div className="flex min-w-0 flex-col gap-1">
          <CardTitle className="text-sm font-medium">
            实时预览 · {PREVIEW_TITLES[active]} · {preferences[active]}
          </CardTitle>
          <CardDescription className="text-xs">选择模式后，这里和聊天界面会同时更新。</CardDescription>
        </div>
        <div className="max-w-full overflow-x-auto pb-0.5">
          <SegmentedControl
            value={active}
            onValueChange={onActiveChange}
            options={PREVIEW_OPTIONS}
            size="sm"
            className="min-w-max"
          />
        </div>
      </CardHeader>
      <CardContent className="flex min-h-72 items-center justify-center overflow-auto bg-inset p-5 md:p-8">
        {active === "loading" ? (
          <LoadingState key={preferences.loading} label="正在分析项目…" variant={preferences.loading} />
        ) : null}
        {active === "thinking" ? (
          <div className="w-full max-w-md">
            <ThinkingState key={preferences.thinking} variant={preferences.thinking} working={false} defaultExpanded compact />
          </div>
        ) : null}
        {active === "taskRows" ? (
          <TaskRows
            key={preferences.taskRows}
            variant={preferences.taskRows}
            rows={PREVIEW_TASKS}
            labels={{ completed: "已完成", failed: "失败" }}
          />
        ) : null}
        {active === "promptBar" ? (
          <div className="w-full max-w-2xl">
            <PromptBar
              key={preferences.promptBar}
              variant={preferences.promptBar}
              demo={false}
              placeholder="描述你希望代理完成的任务…"
              onSend={() => undefined}
            />
          </div>
        ) : null}
        {active === "codeBlock" ? (
          <CodeBlock
            key={preferences.codeBlock}
            variant={preferences.codeBlock}
            filename="stream.ts"
            language="ts"
            code={PREVIEW_CODE}
            diff={PREVIEW_DIFF}
            fill
          />
        ) : null}
      </CardContent>
    </Card>
  )
}

export function AppearanceSection({
  state,
}: {
  state: Pick<KannaState, "appSettings" | "handleWriteAppSettings">
}) {
  const [error, setError] = useState<string | null>(null)
  const [activePreview, setActivePreview] = useState<PreviewKind>("loading")
  const persistedPreferences = state.appSettings?.beautifulUi ?? DEFAULT_BEAUTIFUL_UI_PREFERENCES
  const [optimisticPreferences, setOptimisticPreferences] = useState<Partial<BeautifulUiPreferences>>({})
  const preferences = { ...persistedPreferences, ...optimisticPreferences }

  useEffect(() => {
    setOptimisticPreferences((current) => {
      let next = current
      for (const key of PREFERENCE_KEYS) {
        if (current[key] !== undefined && current[key] === persistedPreferences[key]) {
          if (next === current) next = { ...current }
          delete next[key]
        }
      }
      return next
    })
  }, [
    persistedPreferences.codeBlock,
    persistedPreferences.loading,
    persistedPreferences.promptBar,
    persistedPreferences.taskRows,
    persistedPreferences.thinking,
  ])

  async function setVariant<K extends keyof BeautifulUiPreferences>(
    key: K,
    value: BeautifulUiPreferences[K],
  ) {
    setActivePreview(key)
    setOptimisticPreferences((current) => ({ ...current, [key]: value }))
    try {
      setError(null)
      await state.handleWriteAppSettings({ beautifulUi: { [key]: value } })
    } catch (caught) {
      setOptimisticPreferences((current) => {
        if (current[key] !== value) return current
        const next = { ...current }
        delete next[key]
        return next
      })
      setError(caught instanceof Error ? caught.message : "无法保存界面样式。")
    }
  }

  return (
    <>
      {error ? <SettingsErrorBanner message={error} /> : null}
      <div className="flex flex-col gap-6">
        <AppearancePreview active={activePreview} onActiveChange={setActivePreview} preferences={preferences} />
        <div className="border-b border-border">
          <SettingsRow def={SETTINGS_ROWS.loadingStyle} bordered={false}>
            <SegmentedControl
              value={preferences.loading}
              onValueChange={(value) => void setVariant("loading", value)}
              options={OPTIONS.loading}
              size="sm"
            />
          </SettingsRow>
          <SettingsRow def={SETTINGS_ROWS.thinkingStyle}>
            <SegmentedControl
              value={preferences.thinking}
              onValueChange={(value) => void setVariant("thinking", value)}
              options={OPTIONS.thinking}
              size="sm"
            />
          </SettingsRow>
          <SettingsRow def={SETTINGS_ROWS.taskRowsStyle}>
            <SegmentedControl
              value={preferences.taskRows}
              onValueChange={(value) => void setVariant("taskRows", value)}
              options={OPTIONS.taskRows}
              size="sm"
            />
          </SettingsRow>
          <SettingsRow def={SETTINGS_ROWS.promptBarStyle}>
            <SegmentedControl
              value={preferences.promptBar}
              onValueChange={(value) => void setVariant("promptBar", value)}
              options={OPTIONS.promptBar}
              size="sm"
            />
          </SettingsRow>
          <SettingsRow def={SETTINGS_ROWS.codeBlockStyle}>
            <SegmentedControl
              value={preferences.codeBlock}
              onValueChange={(value) => void setVariant("codeBlock", value)}
              options={OPTIONS.codeBlock}
              size="sm"
            />
          </SettingsRow>
        </div>
        <BeautifulUiGallery preferences={preferences} />
      </div>
    </>
  )
}
