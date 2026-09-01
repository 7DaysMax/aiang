export const APP_NAME = "Youmi Aiagent"
export const CLOUD_SERVICE_NAME = "Youmi Cloud"
export const CLI_COMMAND = "aiang"
export const DATA_ROOT_NAME = ".aiang"
export const DEV_DATA_ROOT_NAME = ".aiang-dev"
export const PACKAGE_NAME = "aiang"
export const RUNTIME_PROFILE_ENV_VAR = "AIANG_RUNTIME_PROFILE"
/** Legacy Kanna env name — still honoured as a fallback. */
export const LEGACY_RUNTIME_PROFILE_ENV_VAR = "KANNA_RUNTIME_PROFILE"
// Read version from package.json — JSON import works in both Bun and Vite
import pkg from "../../package.json"
export const APP_VERSION = pkg.version
export const SDK_CLIENT_APP = `aiang/${pkg.version}`
export const LOG_PREFIX = "[aiang]"
export const DEFAULT_NEW_PROJECT_ROOT = "~/YoumiAiagent"

export type RuntimeProfile = "dev" | "prod"

type RuntimeEnv = Record<string, string | undefined> | undefined

function getRuntimeEnv(): RuntimeEnv {
  const candidate = globalThis as typeof globalThis & {
    process?: {
      env?: Record<string, string | undefined>
    }
  }
  return candidate.process?.env
}

/** First non-empty string among `names`. AIANG_* should be listed before KANNA_*. */
export function readEnv(env: RuntimeEnv, ...names: string[]): string | undefined {
  if (!env) return undefined
  for (const name of names) {
    const value = env[name]
    if (typeof value === "string" && value.length > 0) return value
  }
  return undefined
}

export function envFlagEnabled(...names: string[]): boolean {
  return readEnv(getRuntimeEnv(), ...names) === "1"
}

export function getRuntimeProfile(env: RuntimeEnv = getRuntimeEnv()): RuntimeProfile {
  const value = readEnv(env, RUNTIME_PROFILE_ENV_VAR, LEGACY_RUNTIME_PROFILE_ENV_VAR)
  return value?.trim().toLowerCase() === "dev" ? "dev" : "prod"
}

export function getDataRootName(env: RuntimeEnv = getRuntimeEnv()) {
  return getRuntimeProfile(env) === "dev" ? DEV_DATA_ROOT_NAME : DATA_ROOT_NAME
}

export function getDataRootDir(homeDir: string, env: RuntimeEnv = getRuntimeEnv()) {
  return `${homeDir}/${getDataRootName(env)}`
}

export function getDataRootDirDisplay(env: RuntimeEnv = getRuntimeEnv()) {
  return `~/${getDataRootName(env)}`
}

export function getDataDir(homeDir: string, env: RuntimeEnv = getRuntimeEnv()) {
  return `${getDataRootDir(homeDir, env)}/data`
}

export function getClaudeConfigDir(homeDir: string, env: RuntimeEnv = getRuntimeEnv()) {
  return `${getDataRootDir(homeDir, env)}/claude-config`
}

export function getDataDirDisplay(env: RuntimeEnv = getRuntimeEnv()) {
  return `${getDataRootDirDisplay(env)}/data`
}

export function getSettingsFilePath(homeDir: string, env: RuntimeEnv = getRuntimeEnv()) {
  return `${getDataDir(homeDir, env)}/settings.json`
}

export function getKeybindingsFilePath(homeDir: string, env: RuntimeEnv = getRuntimeEnv()) {
  return `${getDataRootDir(homeDir, env)}/keybindings.json`
}

export function getKeybindingsFilePathDisplay(env: RuntimeEnv = getRuntimeEnv()) {
  return `${getDataRootDirDisplay(env)}/keybindings.json`
}

export function getLlmProviderFilePath(homeDir: string, env: RuntimeEnv = getRuntimeEnv()) {
  return `${getDataRootDir(homeDir, env)}/llm-provider.json`
}

export function getCloudFilePath(homeDir: string, env: RuntimeEnv = getRuntimeEnv()) {
  return `${getDataRootDir(homeDir, env)}/cloud.json`
}

export function getCloudFilePathDisplay(env: RuntimeEnv = getRuntimeEnv()) {
  return `${getDataRootDirDisplay(env)}/cloud.json`
}

export function getMemoriesDir(homeDir: string, env: RuntimeEnv = getRuntimeEnv()) {
  return `${getDataRootDir(homeDir, env)}/memories`
}

export function getMemoriesDirDisplay(env: RuntimeEnv = getRuntimeEnv()) {
  return `${getDataRootDirDisplay(env)}/memories`
}

export function getCliInvocation(arg?: string) {
  return arg ? `${CLI_COMMAND} ${arg}` : CLI_COMMAND
}
