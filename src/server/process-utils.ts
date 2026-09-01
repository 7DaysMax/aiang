import { spawn, spawnSync } from "node:child_process"
import { accessSync, constants, statSync } from "node:fs"
import { homedir } from "node:os"
import path from "node:path"

function formatSpawnError(command: string, error: unknown) {
  if (!(error instanceof Error)) {
    return new Error(`Failed to start ${command}`)
  }

  const code = "code" in error ? (error as NodeJS.ErrnoException).code : undefined
  if (code === "ENOENT") {
    return new Error(`Command not found: ${command}`)
  }

  return new Error(error.message || `Failed to start ${command}`)
}

export function spawnDetached(command: string, args: string[]) {
  return new Promise<void>((resolve, reject) => {
    let child
    try {
      child = spawn(command, args, { stdio: "ignore", detached: true })
    } catch (error) {
      reject(formatSpawnError(command, error))
      return
    }

    const handleError = (error: Error) => {
      reject(formatSpawnError(command, error))
    }

    child.once("error", handleError)
    child.once("spawn", () => {
      child.off("error", handleError)
      child.unref()
      resolve()
    })
  })
}

export function hasCommand(command: string) {
  // Windows 没有 sh，用系统自带 where.exe 探测（也覆盖 .exe/.cmd/.bat）。
  if (process.platform === "win32") {
    const result = spawnSync("where.exe", [command], { stdio: "ignore" })
    return result.status === 0
  }
  const result = spawnSync("sh", ["-lc", `command -v ${command}`], { stdio: "ignore" })
  return result.status === 0
}

/**
 * Per-user bin dirs installers target without necessarily reaching the
 * sh login PATH: the native Claude Code installer uses ~/.local/bin but adds
 * its PATH line to the interactive shell rc (~/.zshrc on macOS), which
 * `sh -lc` never reads. Checked as a fallback when the login shell misses.
 */
const USER_BIN_DIRS = [".local/bin", ".bun/bin", ".npm-global/bin"]

function isExistingFile(candidate: string): boolean {
  try {
    return statSync(candidate).isFile()
  } catch {
    return false
  }
}

function findInUserBinDirs(command: string, homeDir: string): string | null {
  const names = process.platform === "win32"
    ? [command, `${command}.exe`, `${command}.cmd`, `${command}.bat`]
    : [command]
  for (const dir of USER_BIN_DIRS) {
    for (const name of names) {
      const candidate = path.join(homeDir, dir, name)
      try {
        if (!statSync(candidate).isFile()) continue
        if (process.platform !== "win32") accessSync(candidate, constants.X_OK)
        return candidate
      } catch {
        // missing or not executable — keep looking
      }
    }
  }
  return null
}

function resolveViaWhere(command: string): string | null {
  const result = spawnSync("where.exe", [command], {
    stdio: ["ignore", "pipe", "ignore"],
    encoding: "utf8",
    timeout: 2000,
    windowsHide: true,
  })
  if (result.status !== 0) return null
  const first = result.stdout?.trim().split(/\r?\n/).find((line) => line.trim())
  return first?.trim() || null
}

/** Official Windows Cursor CLI install dir (`irm 'https://cursor.com/install?win32=true' | iex`). */
export function windowsCursorAgentDir(): string | null {
  const localAppData = process.env.LOCALAPPDATA
  if (!localAppData) return null
  return path.join(localAppData, "cursor-agent")
}

function findWindowsCursorAgent(): string | null {
  const dir = windowsCursorAgentDir()
  if (!dir) return null
  for (const name of ["cursor-agent.exe", "cursor-agent.cmd", "agent.exe", "agent.cmd"]) {
    const candidate = path.join(dir, name)
    if (isExistingFile(candidate)) return candidate
  }
  return null
}

/**
 * Prepend the Cursor CLI install dir to this process PATH so a just-installed
 * `cursor-agent` is visible without restarting the Youmi server.
 */
export function ensureCursorAgentOnProcessPath(): void {
  if (process.platform !== "win32") return
  const dir = windowsCursorAgentDir()
  if (!dir) return
  const installed = isExistingFile(path.join(dir, "cursor-agent.cmd"))
    || isExistingFile(path.join(dir, "cursor-agent.exe"))
  if (!installed) return
  const current = process.env.PATH ?? ""
  if (current.toLowerCase().includes(dir.toLowerCase())) return
  process.env.PATH = `${dir};${current}`
}

/**
 * Resolve `cursor-agent` (or the Windows `agent` alias in the official install
 * dir). Bare `agent` on PATH is ignored unless the path is clearly Cursor's,
 * because other CLIs also use that name.
 */
export function resolveCursorAgentPath(homeDir = homedir()): string | null {
  const named = resolveCommandPath("cursor-agent", homeDir)
  if (named) return named
  if (process.platform === "win32") {
    const fromInstallDir = findWindowsCursorAgent()
    if (fromInstallDir) return fromInstallDir
  }
  const alias = resolveCommandPath("agent", homeDir)
  if (alias && /cursor-agent/i.test(alias)) return alias
  return null
}

/**
 * Windows cannot spawn `.cmd`/`.bat` without `cmd.exe /c`. Unix argv is unchanged.
 */
export function argvForNativeCli(argv: readonly string[]): string[] {
  const [bin, ...rest] = argv
  if (!bin) return [...argv]
  if (process.platform === "win32" && /\.(cmd|bat)$/i.test(bin)) {
    return ["cmd.exe", "/d", "/s", "/c", bin, ...rest]
  }
  return [...argv]
}

/**
 * Resolve a command to an absolute path using a login shell, so binaries the
 * server process's own PATH misses (npm globals, ~/.local/bin) are still
 * found — the server may have been launched from launchd/systemd/cron.
 * Falls back to well-known per-user bin dirs the login shell may not cover.
 * On Windows, uses `where.exe` plus the Cursor CLI's LocalAppData install dir.
 */
export function resolveCommandPath(command: string, homeDir = homedir()): string | null {
  if (!/^[\w.-]+$/.test(command)) return null
  if (process.platform === "win32") {
    const fromUserBin = findInUserBinDirs(command, homeDir)
    if (fromUserBin) return fromUserBin
    if (command === "cursor-agent" || command === "agent") {
      const fromInstallDir = findWindowsCursorAgent()
      if (fromInstallDir) return fromInstallDir
    }
    return resolveViaWhere(command)
  }
  const result = spawnSync("sh", ["-lc", `command -v -- ${command}`], {
    stdio: ["ignore", "pipe", "ignore"],
    encoding: "utf8",
  })
  if (result.status === 0) {
    const resolved = result.stdout?.trim().split("\n").pop()?.trim() ?? ""
    if (resolved.startsWith("/")) return resolved
  }
  return findInUserBinDirs(command, homeDir)
}

export function canOpenMacApp(appName: string) {
  const result = spawnSync("open", ["-Ra", appName], { stdio: "ignore" })
  return result.status === 0
}
