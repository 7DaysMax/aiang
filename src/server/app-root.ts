import { existsSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

/**
 * Resolve the Aiang package root (folder with package.json + dist/ + vendor/).
 *
 * Priority:
 * 1. AIANG_ROOT
 * 2. Source layout relative to this module (…/src/server → …/)
 * 3. Directory of the running executable (portable / bun --compile)
 * 4. process.cwd()
 */
export function resolveAppRoot(metaUrl: string = import.meta.url): string {
  const fromEnv = process.env.AIANG_ROOT?.trim()
  if (fromEnv) return resolve(fromEnv)

  const metaDir = dirname(fileURLToPath(metaUrl))
  const candidates = [
    join(metaDir, "..", ".."),
    dirname(process.execPath),
    process.cwd(),
  ]

  for (const candidate of candidates) {
    const root = resolve(candidate)
    if (!existsSync(join(root, "package.json"))) continue
    if (
      existsSync(join(root, "dist", "client"))
      || existsSync(join(root, "vendor"))
      || existsSync(join(root, "src", "server"))
    ) {
      return root
    }
  }

  return resolve(join(metaDir, "..", ".."))
}

export function resolveAppDistClientDir(metaUrl?: string): string {
  return join(resolveAppRoot(metaUrl), "dist", "client")
}

export function resolveAppExportViewerDir(metaUrl?: string): string {
  return join(resolveAppRoot(metaUrl), "dist", "export-viewer")
}

export function resolveAppVendorDir(...parts: string[]): string {
  return join(resolveAppRoot(), "vendor", ...parts)
}
