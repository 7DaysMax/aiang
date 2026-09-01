import { create } from "zustand"
import type { CodexDetectResult, CodexInstallResult } from "../../shared/types"
import type { KannaSocket } from "../app/socket"

interface CodexInstallState {
  /** codex.detect 的结果；null 表示还没探测过。 */
  detected: CodexDetectResult | null
  checking: boolean
  installing: boolean
  lastInstallResult: CodexInstallResult | null
  lastError: string | null
  socket: KannaSocket | null
  setSocket: (socket: KannaSocket | null) => void
  detect: () => Promise<void>
  install: (force?: boolean) => Promise<void>
}

export const useCodexInstallStore = create<CodexInstallState>((set, get) => ({
  detected: null,
  checking: false,
  installing: false,
  lastInstallResult: null,
  lastError: null,
  socket: null,
  setSocket: (socket) => set({ socket }),
  detect: async () => {
    const socket = get().socket
    if (!socket) return
    set({ checking: true })
    try {
      const detected = await socket.command<CodexDetectResult>({ type: "codex.detect" })
      set({ detected, checking: false, lastError: null })
    } catch (error) {
      set({ checking: false, lastError: error instanceof Error ? error.message : String(error) })
    }
  },
  install: async (force = false) => {
    const socket = get().socket
    if (!socket) return
    set({ installing: true, lastError: null })
    try {
      const result = await socket.command<CodexInstallResult>({ type: "codex.install", force })
      set({ lastInstallResult: result, installing: false })
      if (result.ok) {
        await get().detect()
      }
    } catch (error) {
      set({ installing: false, lastError: error instanceof Error ? error.message : String(error) })
    }
  },
}))
