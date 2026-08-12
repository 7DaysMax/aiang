import type { HarnessSkill } from "../../shared/types"
import { filterSkillMenuItems } from "./skill-menu"

/**
 * Commands that never reach the harness: ccb's headless mode filters out
 * local/interactive commands (/help /model /config …) and non-interactive
 * ones like /clear, so the composer bridges them to the equivalent aiang
 * frontend actions instead (model picker, new chat, settings, usage dialog…).
 */
export type VirtualCommandName = "model" | "help" | "clear" | "config" | "cost" | "status"

export interface VirtualCommand extends HarnessSkill {
  name: VirtualCommandName
  source: "command"
}

export const VIRTUAL_COMMANDS: readonly VirtualCommand[] = [
  { name: "model", description: "选择 AI 模型", source: "command" },
  { name: "help", description: "查看可用命令", source: "command" },
  { name: "clear", description: "清空当前会话，新开一个对话", source: "command" },
  { name: "config", description: "打开设置", source: "command" },
  { name: "cost", description: "查看费用与用量", source: "command" },
  { name: "status", description: "查看余额、命中率与会话状态", source: "command" },
]

/**
 * Returns the virtual command when the input is exactly "/<name>" (trailing
 * whitespace allowed). Anything with arguments — "/model sonnet" — is left to
 * the harness, so real engine commands are never shadowed.
 */
export function getVirtualCommand(value: string): VirtualCommand | null {
  const trimmed = value.trim()
  if (!trimmed.startsWith("/")) return null
  const name = trimmed.slice(1).trim()
  if (name.length === 0 || /\s/.test(name)) return null
  return VIRTUAL_COMMANDS.find((command) => command.name === name) ?? null
}

export function isVirtualCommand(value: string): boolean {
  return getVirtualCommand(value) !== null
}

/**
 * Merges the virtual commands into the harness's enumerated skills for the
 * "/" menu. Real skills win on name collisions (they actually run on the
 * engine); virtual entries are appended as menu completions only.
 */
export function mergeVirtualSkillMenuItems(skills: HarnessSkill[], query: string): HarnessSkill[] {
  const realNames = new Set(skills.map((skill) => skill.name))
  const virtualMatches = filterSkillMenuItems([...VIRTUAL_COMMANDS], query)
  return [...skills, ...virtualMatches.filter((command) => !realNames.has(command.name))]
}
