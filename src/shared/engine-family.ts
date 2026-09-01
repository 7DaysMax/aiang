import type { AgentProvider, ProviderCatalogEntry } from "./types"

/** 原生 = 官方原版引擎；第三方 = Youmi / ccb / Reasonix / Pi。 */
export type EngineFamily = "native" | "thirdParty"

export const NATIVE_ENGINE_IDS = ["claude", "cursor", "codex"] as const satisfies readonly AgentProvider[]
export const THIRD_PARTY_ENGINE_IDS = ["youmi", "deepseek", "reasonix", "pi"] as const satisfies readonly AgentProvider[]

const NATIVE_SET = new Set<AgentProvider>(NATIVE_ENGINE_IDS)

export function engineFamilyOf(id: AgentProvider): EngineFamily {
  return NATIVE_SET.has(id) ? "native" : "thirdParty"
}

/** Cursor 只走原版账号模型；其余引擎共用模型档案。 */
export function engineUsesModelProfile(id: AgentProvider): boolean {
  return id !== "cursor"
}

/** @deprecated 使用 engineUsesModelProfile。 */
export function engineSupportsRelay(id: AgentProvider): boolean {
  return engineUsesModelProfile(id)
}

export function engineFamilyLabel(family: EngineFamily): string {
  return family === "native" ? "原生" : "第三方"
}

export function compareProvidersByFamily(left: AgentProvider, right: AgentProvider): number {
  const leftFamily = engineFamilyOf(left)
  const rightFamily = engineFamilyOf(right)
  if (leftFamily !== rightFamily) return leftFamily === "native" ? -1 : 1
  const order = leftFamily === "native" ? NATIVE_ENGINE_IDS : THIRD_PARTY_ENGINE_IDS
  return order.indexOf(left as never) - order.indexOf(right as never)
}

export function groupProvidersByFamily<T extends { id: AgentProvider }>(
  providers: readonly T[],
): { family: EngineFamily; label: string; providers: T[] }[] {
  const native: T[] = []
  const thirdParty: T[] = []
  for (const provider of [...providers].sort((a, b) => compareProvidersByFamily(a.id, b.id))) {
    if (engineFamilyOf(provider.id) === "native") native.push(provider)
    else thirdParty.push(provider)
  }
  const groups: { family: EngineFamily; label: string; providers: T[] }[] = [
    { family: "native", label: engineFamilyLabel("native"), providers: native },
    { family: "thirdParty", label: engineFamilyLabel("thirdParty"), providers: thirdParty },
  ]
  return groups.filter((group) => group.providers.length > 0)
}

export function withEngineFamily(entry: ProviderCatalogEntry): ProviderCatalogEntry {
  return { ...entry, family: entry.family ?? engineFamilyOf(entry.id) }
}
