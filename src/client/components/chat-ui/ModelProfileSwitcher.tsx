import { useMemo, useState } from "react"
import {
  EMPTY_MODEL_PROFILES,
  getModelProfilePreset,
  groupProfilesByPreset,
  inferModelProfilePresetId,
  MODEL_PROFILE_PRESET_IDS,
  resolveActiveModelProfile,
} from "../../../shared/model-profile"
import { PROFILE_PRESET_ICONS } from "../provider-icons"
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover"
import { useAppSettingsStore } from "../../stores/appSettingsStore"
import { useProviderAuthStore } from "../../stores/providerAuthStore"
import { cn } from "../../lib/utils"

export function ModelProfileSwitcher() {
  const modelProfiles = useAppSettingsStore((store) => store.settings?.modelProfiles ?? EMPTY_MODEL_PROFILES)
  const activeModelProfileId = useAppSettingsStore((store) => store.settings?.activeModelProfileId ?? null)
  const applyOptimisticPatch = useAppSettingsStore((store) => store.applyOptimisticPatch)
  const socket = useProviderAuthStore((store) => store.socket)
  const [open, setOpen] = useState(false)

  const active = resolveActiveModelProfile(modelProfiles, activeModelProfileId)
  const grouped = useMemo(() => groupProfilesByPreset(modelProfiles), [modelProfiles])
  const presetsWithProfiles = MODEL_PROFILE_PRESET_IDS.filter((id) => grouped[id].length > 0)

  if (!active || presetsWithProfiles.length === 0) return null

  const ActiveIcon = PROFILE_PRESET_ICONS[inferModelProfilePresetId(active)]

  function activate(profileId: string) {
    applyOptimisticPatch({ activeModelProfileId: profileId })
    void socket?.command({
      type: "settings.writeAppSettingsPatch",
      patch: { activeModelProfileId: profileId },
    })
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-1.5 rounded-md px-2 py-1 text-sm text-muted-foreground transition-colors hover:bg-muted/50 [&>svg]:shrink-0 [&>span]:whitespace-nowrap"
        >
          <ActiveIcon className="h-3.5 w-3.5" />
          <span>{active.name}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="center" className="w-72 overflow-hidden p-0">
        <div className="max-h-80 overflow-y-auto divide-y divide-border/60">
          {presetsWithProfiles.map((presetId) => {
            const Icon = PROFILE_PRESET_ICONS[presetId]
            const label = getModelProfilePreset(presetId).name
            return (
              <div key={presetId}>
                <div className="flex items-center gap-1.5 px-3 pt-2 pb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  <Icon className="h-3 w-3" />
                  {label}
                </div>
                {grouped[presetId].map((profile) => {
                  const selected = profile.id === active.id
                  return (
                    <button
                      key={profile.id}
                      type="button"
                      onClick={() => activate(profile.id)}
                      className={cn(
                        "flex w-full items-center gap-2 px-3 py-2 text-left transition-colors [&>svg]:shrink-0",
                        selected ? "bg-muted" : "hover:bg-muted/50",
                      )}
                    >
                      <Icon className="h-4 w-4 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium">{profile.name}</div>
                        <div className="truncate text-xs text-muted-foreground">
                          {profile.modelId || profile.baseUrl}
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            )
          })}
        </div>
      </PopoverContent>
    </Popover>
  )
}
