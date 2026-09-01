import { create } from "zustand"
import {
  CLOUD_BROWSER_PATH_PREFIX,
  type CloudMachineSummary,
  type CloudMachinesResponse,
} from "../../shared/cloud-api"

/**
 * Cloud-mode detection + the paired-machine list for the sidebar switcher.
 *
 * Feature detection: `GET /__cloud/machines` is answered by the kanna.sh
 * proxy on machine subdomains (never forwarded); the machine's own server
 * explicitly 404s the prefix, so a JSON 200 means "cloud", anything else
 * means "local". Not persisted — the answer is a property of the origin.
 */

export type ConnectionMode = "unknown" | "local" | "cloud"

export function isLoopbackHostname(host: string): boolean {
  const value = host.trim().toLowerCase()
  return (
    value === "localhost"
    || value === "127.0.0.1"
    || value === "[::1]"
    || value === "::1"
    || value.startsWith("localhost:")
    || value.startsWith("127.0.0.1:")
    || value.startsWith("[::1]:")
  )
}

interface ConnectionState {
  mode: ConnectionMode
  machines: CloudMachineSummary[]
  /** Detect mode + load the machine list. Safe to call repeatedly. */
  load: (fetchImpl?: typeof fetch) => Promise<void>
}

export function findCurrentMachine(
  machines: CloudMachineSummary[],
  host: string = typeof window !== "undefined" ? window.location.host : "",
): CloudMachineSummary | null {
  const hostname = host.split(":")[0].toLowerCase()
  return machines.find((machine) => {
    try {
      return new URL(machine.appOrigin).hostname.toLowerCase() === hostname
    } catch {
      return false
    }
  }) ?? null
}

export const useConnectionStore = create<ConnectionState>()((set) => ({
  mode: "unknown",
  machines: [],

  load: async (fetchImpl?: typeof fetch) => {
    const hostname = typeof window !== "undefined" ? window.location.hostname : ""
    // Local Vite/dev has no cloud proxy. Skip the probe so the console
    // doesn't fill with `/__cloud/machines` 404s. Tests pass fetchImpl.
    if (!fetchImpl && isLoopbackHostname(hostname)) {
      set({ mode: "local", machines: [] })
      return
    }
    const impl = fetchImpl ?? fetch
    try {
      const response = await impl(`${CLOUD_BROWSER_PATH_PREFIX}/machines`, {
        headers: { Accept: "application/json" },
      })
      if (response.ok && (response.headers.get("content-type") ?? "").includes("application/json")) {
        const payload = await response.json() as CloudMachinesResponse
        if (Array.isArray(payload.machines)) {
          set({ mode: "cloud", machines: payload.machines })
          return
        }
      }
    } catch {
      // Unreachable → treat as local.
    }
    set({ mode: "local", machines: [] })
  },
}))
