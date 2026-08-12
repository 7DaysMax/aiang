import { create } from "zustand"
import type { DeepSeekStatusSnapshot } from "../../shared/types"
import type { KannaSocket } from "../app/socket"

/** 状态自动刷新的间隔。 */
export const DEEPSEEK_STATUS_REFRESH_MS = 120_000
/** 拉取失败后的重试间隔（指数退避，封顶 60s），不用用户手动刷新。 */
const RETRY_BASE_MS = 5_000
const RETRY_MAX_MS = 60_000

let autoRefreshTimer: ReturnType<typeof globalThis.setTimeout> | null = null
let retryTimer: ReturnType<typeof globalThis.setTimeout> | null = null
let retryDelayMs = RETRY_BASE_MS

function clearAutoRefreshTimer() {
  if (autoRefreshTimer !== null) {
    clearTimeout(autoRefreshTimer)
    autoRefreshTimer = null
  }
}

function clearRetryTimer() {
  if (retryTimer !== null) {
    clearTimeout(retryTimer)
    retryTimer = null
  }
}

interface DeepSeekStatusState {
  status: DeepSeekStatusSnapshot | null
  /** 最近一次拉取是否失败。 */
  failed: boolean
  /** 最近一次拉取时间。 */
  lastFetchedAt: number
  /** 正在拉取中。 */
  loading: boolean
  socket: KannaSocket | null
  setSocket: (socket: KannaSocket | null) => void
  refresh: (force?: boolean) => Promise<void>
}

export const useDeepSeekStatusStore = create<DeepSeekStatusState>((set, get) => ({
  status: null,
  failed: false,
  lastFetchedAt: 0,
  loading: false,
  socket: null,
  setSocket: (socket) => set({ socket }),
  refresh: async (force = false) => {
    clearAutoRefreshTimer()
    clearRetryTimer()
    const { socket, loading } = get()
    if (!socket || loading) {
      // socket 尚未注入（页面刚打开/连接未就绪）：稍后自动重试。
      if (!socket) {
        retryTimer = globalThis.setTimeout(() => {
          retryTimer = null
          void get().refresh(true)
        }, retryDelayMs)
        retryDelayMs = Math.min(retryDelayMs * 2, RETRY_MAX_MS)
      }
      return
    }
    set({ loading: true })
    try {
      const status = await socket.command<DeepSeekStatusSnapshot>({ type: "deepseek.status", force })
      set({ status, failed: !status.ok, lastFetchedAt: Date.now() })
      // 成功：回到基础重试间隔，并每 2 分钟自动同步一次。
      retryDelayMs = RETRY_BASE_MS
      autoRefreshTimer = globalThis.setTimeout(() => {
        autoRefreshTimer = null
        void get().refresh(false)
      }, DEEPSEEK_STATUS_REFRESH_MS)
    } catch {
      set({ failed: true, lastFetchedAt: Date.now() })
      // 失败：指数退避自动重试，直到成功，无需手动刷新。
      retryTimer = globalThis.setTimeout(() => {
        retryTimer = null
        void get().refresh(true)
      }, retryDelayMs)
      retryDelayMs = Math.min(retryDelayMs * 2, RETRY_MAX_MS)
    } finally {
      set({ loading: false })
    }
  },
}))
