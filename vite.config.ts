import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import { fileURLToPath } from "node:url"
import { getDefaultDevServerPort } from "./src/shared/dev-ports"
import { DEV_CLIENT_PORT } from "./src/shared/ports"

function envFirst(...names: string[]): string | undefined {
  for (const name of names) {
    const value = process.env[name]
    if (value) return value
  }
  return undefined
}

function getAllowedHosts() {
  const defaults = ["localhost", "127.0.0.1", "0.0.0.0"]
  const configured = envFirst("AIANG_DEV_ALLOWED_HOSTS", "KANNA_DEV_ALLOWED_HOSTS")
  if (!configured) return defaults
  if (configured === "true") return true

  try {
    const parsed = JSON.parse(configured)
    if (!Array.isArray(parsed)) return defaults
    const hosts = parsed.filter((value): value is string => typeof value === "string" && value.length > 0)
    return hosts.length > 0 ? hosts : defaults
  } catch {
    return defaults
  }
}

function getBackendTargetHost() {
  return envFirst("AIANG_DEV_BACKEND_TARGET_HOST", "KANNA_DEV_BACKEND_TARGET_HOST") || "127.0.0.1"
}

function getBackendPort() {
  const configured = Number(envFirst("AIANG_DEV_BACKEND_PORT", "KANNA_DEV_BACKEND_PORT"))
  return Number.isFinite(configured) && configured > 0 ? configured : getDefaultDevServerPort(DEV_CLIENT_PORT)
}

const backendTargetHost = getBackendTargetHost()
const backendPort = getBackendPort()

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    host: "0.0.0.0",
    port: DEV_CLIENT_PORT,
    strictPort: true,
    proxy: {
      "/ws": {
        target: `ws://${backendTargetHost}:${backendPort}`,
        ws: true,
      },
      "/api": {
        target: `http://${backendTargetHost}:${backendPort}`,
      },
      "/health": {
        target: `http://${backendTargetHost}:${backendPort}`,
      },
      "/auth": {
        target: `http://${backendTargetHost}:${backendPort}`,
      },
    },
    allowedHosts: getAllowedHosts(),
  },
  build: {
    outDir: "dist/client",
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return
          if (id.includes("react-dom") || id.includes("/react/") || id.includes("\\react\\") || id.includes("scheduler")) {
            return "react-vendor"
          }
          if (id.includes("@radix-ui") || id.includes("cmdk")) return "radix-vendor"
          if (id.includes("@xterm")) return "xterm-vendor"
          if ((id.includes("shiki") || id.includes("@shikijs")) && !id.includes("@shikijs/langs")) {
            return "shiki-vendor"
          }
          if (id.includes("react-markdown") || id.includes("remark-gfm")) return "markdown-vendor"
          if (id.includes("@codemirror") || id.includes("@uiw/react-codemirror") || id.includes("@lezer")) {
            return "codemirror-vendor"
          }
          if (id.includes("lucide-react")) return "icons-vendor"
        },
      },
    },
  },
})
