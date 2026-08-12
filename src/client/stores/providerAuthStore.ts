import { create } from "zustand"
import {
  type AppSettingsPatch,
  type AuthServiceId,
  type AuthServiceSnapshot,
  type ProviderAuthSnapshot,
} from "../../shared/types"
import type { KannaSocket } from "../app/socket"
import { useAppSettingsStore } from "./appSettingsStore"

interface ProviderAuthStore {
  snapshot: ProviderAuthSnapshot | null
  /** The app socket, registered by the layout so deep components can send auth commands. */
  socket: KannaSocket | null
  /** Full-screen setup wizard visibility. */
  setupWizardOpen: boolean
  /**
   * The server's app-settings snapshot has arrived, so the three flags below
   * reflect this machine rather than their pre-load defaults. Until then the
   * auto-launch decision has to wait — otherwise a browser that has never
   * connected would read `false` and re-run onboarding on every new browser.
   */
  setupLoaded: boolean
  /** The wizard has been shown at least once (persisted per machine). */
  setupShown: boolean
  /** The wizard's final step was completed (persisted). Hides the Setup cards. */
  setupCompleted: boolean
  /** "Set up later" was chosen (persisted). Suppresses auto-launch only. */
  setupDismissed: boolean
  setSnapshot: (snapshot: ProviderAuthSnapshot | null) => void
  setSocket: (socket: KannaSocket | null) => void
  /** Adopt the machine-wide setup flags pushed on the `app-settings` topic. */
  setSetupFlagsFromServer: (flags: {
    setupShown: boolean
    setupCompleted: boolean
    setupDismissed: boolean
  }) => void
  openSetupWizard: () => void
  /** Close without finishing — persists the dismissal so we never auto-launch again. */
  dismissSetupWizard: () => void
  /** Close from the final step — persists completion so Setup cards disappear. */
  completeSetupWizard: () => void
}

export const useProviderAuthStore = create<ProviderAuthStore>((set, get) => {
  /**
   * Persist an onboarding marker on the machine. Fire-and-forget: the local
   * flag is already set optimistically, and the server echoes the settings
   * snapshot back on the `app-settings` topic to every connected browser.
   */
  const persistSetupFlags = (patch: AppSettingsPatch) => {
    const { socket } = get()
    if (!socket) return
    void socket
      .command({ type: "settings.writeAppSettingsPatch", patch })
      .catch(() => undefined)
  }

  return {
    snapshot: null,
    socket: null,
    setupWizardOpen: false,
    setupLoaded: false,
    setupShown: false,
    setupCompleted: false,
    setupDismissed: false,
    setSnapshot: (snapshot) => set({ snapshot }),
    setSocket: (socket) => set({ socket }),
    setSetupFlagsFromServer: (flags) =>
      set({
        setupLoaded: true,
        // Markers are one-way latches: never let a snapshot un-set a flag this
        // browser just set optimistically while its write is still in flight.
        setupShown: get().setupShown || flags.setupShown,
        setupCompleted: get().setupCompleted || flags.setupCompleted,
        setupDismissed: get().setupDismissed || flags.setupDismissed,
      }),
    openSetupWizard: () => {
      persistSetupFlags({ setupShown: true })
      set({ setupWizardOpen: true, setupShown: true })
    },
    dismissSetupWizard: () => {
      persistSetupFlags({ setupDismissed: true })
      set({ setupWizardOpen: false, setupDismissed: true })
    },
    completeSetupWizard: () => {
      persistSetupFlags({ setupCompleted: true, setupDismissed: true })
      set({ setupWizardOpen: false, setupCompleted: true, setupDismissed: true })
    },
  }
})

export function selectAuthService(
  snapshot: ProviderAuthSnapshot | null,
  service: AuthServiceId
): AuthServiceSnapshot | null {
  return snapshot?.services.find((entry) => entry.service === service) ?? null
}

export function useAuthService(service: AuthServiceId): AuthServiceSnapshot | null {
  return useProviderAuthStore((store) => selectAuthService(store.snapshot, service))
}

/**
 * Auto-launch decision for the setup wizard on app load.
 *
 * The flags are machine-wide (persisted in the server's settings file), so the
 * decision has to wait for the first `app-settings` snapshot — a brand-new
 * browser starts with all three false, and acting on that would re-run
 * onboarding for every browser that ever visits this machine.
 *
 * Once loaded: a first-ever launch ("shown" never persisted) opens immediately;
 * later launches re-open only while the DeepSeek API Key is still missing
 * (avoids flashing the wizard at already-configured machines).
 */
export function getSetupLaunchAction(
  hasDeepSeekKey: boolean,
  flags: {
    setupLoaded: boolean
    setupShown: boolean
    setupCompleted: boolean
    setupDismissed: boolean
  }
): "open" | "wait" | "none" {
  if (!flags.setupLoaded) return "wait"
  if (flags.setupCompleted || flags.setupDismissed) return "none"
  if (!flags.setupShown) return "open"
  return hasDeepSeekKey ? "none" : "open"
}

/**
 * 机器上是否已配置 DeepSeek API Key（来源：应用设置快照）。
 */
export function useHasDeepSeekKey(): boolean {
  return Boolean(useAppSettingsStore((store) => store.settings?.deepseekApiKey))
}

/**
 * The Setup card (home + new-chat) shows whenever the machine still lacks a
 * DeepSeek API Key. Gated on `setupLoaded` so a fresh browser never flashes
 * the card while the settings snapshot is still in flight.
 */
export function useShowSetupCard(): boolean {
  const setupLoaded = useProviderAuthStore((store) => store.setupLoaded)
  const hasKey = useHasDeepSeekKey()
  return setupLoaded && !hasKey
}
