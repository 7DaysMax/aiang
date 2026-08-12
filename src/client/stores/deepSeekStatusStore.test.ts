import { describe, expect, test } from "bun:test"
import { useDeepSeekStatusStore } from "./deepSeekStatusStore"
import type { DeepSeekStatusSnapshot } from "../../shared/types"
import type { KannaSocket } from "../app/socket"

function resetStore() {
  useDeepSeekStatusStore.setState({
    status: null,
    failed: false,
    lastFetchedAt: 0,
    loading: false,
    socket: null,
  })
}

function fakeSocket(impl: { command?: (command: { type: string }) => Promise<unknown> } = {}) {
  return {
    command: impl.command ?? (async () => ({ ok: true })),
  } as unknown as KannaSocket
}

describe("deepSeekStatusStore.refresh", () => {
  test("records a successful snapshot and clears the failed flag", async () => {
    resetStore()
    const snapshot = { ok: true, fetchedAt: Date.now(), updatedAt: Date.now() } as DeepSeekStatusSnapshot
    useDeepSeekStatusStore.getState().setSocket(fakeSocket({
      command: async () => snapshot,
    }))

    await useDeepSeekStatusStore.getState().refresh(true)

    expect(useDeepSeekStatusStore.getState().status?.ok).toBe(true)
    expect(useDeepSeekStatusStore.getState().failed).toBe(false)
    expect(useDeepSeekStatusStore.getState().loading).toBe(false)
  })

  test("marks failed when the status fetch rejects", async () => {
    resetStore()
    useDeepSeekStatusStore.getState().setSocket(fakeSocket({
      command: async () => { throw new Error("network down") },
    }))

    await useDeepSeekStatusStore.getState().refresh(true)

    expect(useDeepSeekStatusStore.getState().failed).toBe(true)
    expect(useDeepSeekStatusStore.getState().loading).toBe(false)
  })

  test("returns without throwing when the socket is not ready yet", async () => {
    resetStore()
    await useDeepSeekStatusStore.getState().refresh(true)
    expect(useDeepSeekStatusStore.getState().loading).toBe(false)
    expect(useDeepSeekStatusStore.getState().failed).toBe(false)
  })
})
