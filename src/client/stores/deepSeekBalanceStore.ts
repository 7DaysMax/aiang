import { create } from "zustand"
import type { DeepSeekBalanceSnapshot } from "../../shared/types"
import type { KannaSocket } from "../app/socket"

/** 余额自动刷新的间隔。 */
export const DEEPSEEK_BALANCE_REFRESH_MS = 60_000

interface DeepSeekBalanceState {
  balance: DeepSeekBalanceSnapshot | null
  /** 最近一次拉取失败（网络错误等），用于 UI 提示。 */
  failed: boolean
  /** 最近一次拉取时间。 */
  lastFetchedAt: number
  /** 应用 socket，由布局层注册，供深层组件发送命令。 */
  socket: KannaSocket | null
  setSocket: (socket: KannaSocket | null) => void
  refresh: () => Promise<void>
}

export const useDeepSeekBalanceStore = create<DeepSeekBalanceState>((set, get) => ({
  balance: null,
  failed: false,
  lastFetchedAt: 0,
  socket: null,
  setSocket: (socket) => set({ socket }),
  refresh: async () => {
    const socket = get().socket
    if (!socket) return
    try {
      const balance = await socket.command<DeepSeekBalanceSnapshot>({ type: "deepseek.getBalance" })
      set({ balance, failed: false, lastFetchedAt: Date.now() })
    } catch {
      set({ failed: true, lastFetchedAt: Date.now() })
    }
  },
}))
