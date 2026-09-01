import { useEffect, useMemo, useState } from "react"
import { Check, Pencil, Plus, Trash2 } from "lucide-react"
import {
  getModelProfilePreset,
  groupProfilesByPreset,
  inferModelProfilePresetId,
  isCompleteModelProfile,
  maskApiKey,
  MODEL_PROFILE_PRESETS,
  nextProfileName,
  type ModelProfile,
  type ModelProfilePresetId,
  type ModelProfileProtocol,
} from "../../../shared/model-profile"
import type { AppSettingsPatch } from "../../../shared/types"
import { PROFILE_PRESET_ICONS } from "../../components/provider-icons"
import { Button } from "../../components/ui/button"
import { Input } from "../../components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select"
import { cn } from "../../lib/utils"
import { BrandChoiceGrid } from "./BrandChoiceGrid"

interface ProfileDraft {
  name: string
  protocol: ModelProfileProtocol
  baseUrl: string
  apiKey: string
  modelId: string
}

function emptyDraft(presetId: ModelProfilePresetId, existing: readonly ModelProfile[]): ProfileDraft {
  const preset = getModelProfilePreset(presetId)
  return {
    name: nextProfileName(preset.name, existing),
    protocol: preset.protocol,
    baseUrl: preset.baseUrl,
    apiKey: "",
    modelId: preset.modelId,
  }
}

function draftFromProfile(profile: ModelProfile): ProfileDraft {
  return {
    name: profile.name,
    protocol: profile.protocol,
    baseUrl: profile.baseUrl,
    apiKey: profile.apiKey,
    modelId: profile.modelId,
  }
}

export function ModelProfilesPanel({
  modelProfiles,
  activeModelProfileId,
  onWrite,
  onError,
}: {
  modelProfiles: ModelProfile[]
  activeModelProfileId: string | null
  onWrite: (patch: AppSettingsPatch) => Promise<unknown>
  onError: (message: string) => void
}) {
  const grouped = useMemo(() => groupProfilesByPreset(modelProfiles), [modelProfiles])
  const activeProfile = modelProfiles.find((profile) => profile.id === activeModelProfileId)
    ?? modelProfiles[0]
    ?? null
  const activePresetId = activeProfile ? inferModelProfilePresetId(activeProfile) : "deepseek"
  const [selectedPresetId, setSelectedPresetId] = useState<ModelProfilePresetId>(activePresetId)
  const [editor, setEditor] = useState<{ mode: "add" } | { mode: "edit"; profileId: string } | null>(null)
  const [draft, setDraft] = useState<ProfileDraft>(() => emptyDraft("deepseek", []))

  useEffect(() => {
    if (editor === null) {
      setSelectedPresetId(activePresetId)
    }
  }, [activePresetId, editor])

  const selectedPreset = getModelProfilePreset(selectedPresetId)
  const selectedProfiles = grouped[selectedPresetId]
  const SelectedIcon = PROFILE_PRESET_ICONS[selectedPresetId]

  function selectPreset(presetId: ModelProfilePresetId) {
    setSelectedPresetId(presetId)
    setEditor(null)
    const presetProfiles = grouped[presetId]
    if (presetProfiles.length === 0) {
      setDraft(emptyDraft(presetId, presetProfiles))
      setEditor({ mode: "add" })
    }
  }

  function startAdd() {
    setDraft(emptyDraft(selectedPresetId, selectedProfiles))
    setEditor({ mode: "add" })
  }

  function startEdit(profile: ModelProfile) {
    setSelectedPresetId(profile.presetId)
    setDraft(draftFromProfile(profile))
    setEditor({ mode: "edit", profileId: profile.id })
  }

  async function activateProfile(profileId: string) {
    try {
      await onWrite({ activeModelProfileId: profileId })
    } catch (error) {
      onError(error instanceof Error ? error.message : "无法切换模型档案。")
    }
  }

  async function saveDraft() {
    const name = draft.name.trim()
    const baseUrl = draft.baseUrl.trim()
    const apiKey = draft.apiKey.trim()
    const modelId = draft.modelId.trim()
    if (!name || !baseUrl || !apiKey || !modelId) {
      onError("档案需要名称、Base URL、API Key 和模型 ID。")
      return
    }
    const profile: ModelProfile = {
      id: editor?.mode === "edit" ? editor.profileId : crypto.randomUUID(),
      name,
      presetId: selectedPresetId,
      protocol: draft.protocol,
      baseUrl,
      apiKey,
      modelId,
    }
    const nextProfiles = editor?.mode === "edit"
      ? modelProfiles.map((entry) => (entry.id === profile.id ? profile : entry))
      : [...modelProfiles, profile]
    try {
      await onWrite({
        modelProfiles: nextProfiles,
        activeModelProfileId: profile.id,
      })
      setEditor(null)
    } catch (error) {
      onError(error instanceof Error ? error.message : "无法保存模型档案。")
    }
  }

  async function deleteProfile(profileId: string) {
    const next = modelProfiles.filter((profile) => profile.id !== profileId)
    try {
      await onWrite({
        modelProfiles: next,
        activeModelProfileId: activeModelProfileId === profileId ? (next[0]?.id ?? null) : activeModelProfileId,
      })
      if (editor?.mode === "edit" && editor.profileId === profileId) setEditor(null)
    } catch (error) {
      onError(error instanceof Error ? error.message : "无法删除模型档案。")
    }
  }

  return (
    <div className="flex w-full flex-col gap-3">
      <p className="text-xs text-muted-foreground">
        Claude、Codex、Youmi、ccb、Reasonix 共用当前选用的档案。每个服务商可以保存多套配置，点一下就能切换。Cursor 只用原版登录。
      </p>
      <BrandChoiceGrid
        value={selectedPresetId}
        onChange={selectPreset}
        columnsClassName="grid-cols-2 sm:grid-cols-4"
        options={MODEL_PROFILE_PRESETS.map((preset) => {
          const count = grouped[preset.id].length
          const inUse = activePresetId === preset.id
          return {
            value: preset.id,
            label: preset.name,
            icon: PROFILE_PRESET_ICONS[preset.id],
            description: count > 0 ? `${count} 套配置` : "未配置",
            badge: inUse ? "使用中" : undefined,
          }
        })}
      />

      <div className="rounded-xl border border-border bg-card p-3">
        <div className="flex items-center gap-2">
          <SelectedIcon className="h-4 w-4" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground">{selectedPreset.name}</p>
            <p className="text-[11px] text-muted-foreground">
              {selectedPreset.baseUrl || "填写任意 OpenAI / Anthropic 兼容端点"}
            </p>
          </div>
          {selectedPreset.siteUrl ? (
            <a
              href={selectedPreset.siteUrl}
              target="_blank"
              rel="noreferrer"
              className="shrink-0 text-[11px] text-primary underline-offset-4 hover:underline"
            >
              获取 API Key ↗
            </a>
          ) : null}
        </div>

        <div className="mt-3 space-y-1.5">
          {selectedProfiles.length === 0 && editor?.mode !== "add" ? (
            <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
              还没有 {selectedPreset.name} 配置。添加一套后即可一键切换。
            </p>
          ) : null}
          {selectedProfiles.map((profile) => {
            const active = profile.id === (activeModelProfileId ?? activeProfile?.id)
            const editing = editor?.mode === "edit" && editor.profileId === profile.id
            return (
              <div
                key={profile.id}
                className={cn(
                  "rounded-lg border px-3 py-2 transition-colors",
                  active ? "border-foreground/25 bg-muted/50" : "border-border",
                )}
              >
                <div className="flex items-start gap-2">
                  <button
                    type="button"
                    onClick={() => void activateProfile(profile.id)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <span className="flex items-center gap-2">
                      <span
                        className={cn(
                          "flex h-4 w-4 items-center justify-center rounded-full border",
                          active
                            ? "border-emerald-500 bg-emerald-500 text-white"
                            : "border-muted-foreground/40",
                        )}
                      >
                        {active ? <Check className="h-2.5 w-2.5" strokeWidth={3} /> : null}
                      </span>
                      <span className="truncate text-sm font-medium text-foreground">{profile.name}</span>
                      {active ? (
                        <span className="text-[11px] text-emerald-600 dark:text-emerald-400">当前使用</span>
                      ) : (
                        <span className="text-[11px] text-muted-foreground">点击切换</span>
                      )}
                    </span>
                    <span className="mt-1 block truncate pl-6 font-mono text-[11px] text-muted-foreground">
                      {profile.modelId || "未填模型"} · {maskApiKey(profile.apiKey)}
                      {isCompleteModelProfile(profile) ? "" : " · 未完成"}
                    </span>
                  </button>
                  <Button type="button" variant="ghost" size="icon-sm" onClick={() => startEdit(profile)} aria-label="编辑">
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button type="button" variant="ghost" size="icon-sm" onClick={() => void deleteProfile(profile.id)} aria-label="删除">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
                {editing ? (
                  <ProfileDraftForm
                    draft={draft}
                    presetId={selectedPresetId}
                    onChange={setDraft}
                    onSave={() => void saveDraft()}
                    onCancel={() => setEditor(null)}
                    saveLabel="保存修改"
                  />
                ) : null}
              </div>
            )
          })}
        </div>

        {editor?.mode === "add" ? (
          <ProfileDraftForm
            draft={draft}
            presetId={selectedPresetId}
            onChange={setDraft}
            onSave={() => void saveDraft()}
            onCancel={() => setEditor(null)}
            saveLabel="保存并使用"
          />
        ) : (
          <Button type="button" variant="outline" size="sm" className="mt-3 w-fit" onClick={startAdd}>
            <Plus className="mr-1 h-3.5 w-3.5" />
            添加 {selectedPreset.name} 配置
          </Button>
        )}
      </div>
    </div>
  )
}

function ProfileDraftForm({
  draft,
  presetId,
  onChange,
  onSave,
  onCancel,
  saveLabel,
}: {
  draft: ProfileDraft
  presetId: ModelProfilePresetId
  onChange: (draft: ProfileDraft) => void
  onSave: () => void
  onCancel: () => void
  saveLabel: string
}) {
  const preset = getModelProfilePreset(presetId)
  const showProtocol = presetId === "custom"
  return (
    <div className="mt-3 grid gap-2 border-t border-border pt-3">
      <Input
        value={draft.name}
        onChange={(event) => onChange({ ...draft, name: event.target.value })}
        placeholder="配置名称，例如 工作号"
      />
      {showProtocol ? (
        <Select
          value={draft.protocol}
          onValueChange={(value) => onChange({ ...draft, protocol: value as ModelProfileProtocol })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="openai-compat">OpenAI 兼容</SelectItem>
            <SelectItem value="anthropic">Anthropic 兼容</SelectItem>
          </SelectContent>
        </Select>
      ) : null}
      <Input
        value={draft.baseUrl}
        onChange={(event) => onChange({ ...draft, baseUrl: event.target.value })}
        placeholder={preset.baseUrl || "https://api.example.com/v1"}
      />
      <Input
        type="password"
        value={draft.apiKey}
        onChange={(event) => onChange({ ...draft, apiKey: event.target.value })}
        placeholder="API Key"
      />
      <Input
        value={draft.modelId}
        onChange={(event) => onChange({ ...draft, modelId: event.target.value })}
        placeholder={preset.modelId || "模型 ID"}
      />
      <div className="flex gap-2">
        <Button type="button" size="sm" onClick={onSave}>
          {saveLabel}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          取消
        </Button>
      </div>
    </div>
  )
}
