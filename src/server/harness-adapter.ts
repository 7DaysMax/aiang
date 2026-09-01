import { homedir } from "node:os"
import path from "node:path"
import { getClaudeConfigDir } from "../shared/branding"
import type { AgentProvider, HarnessSkill } from "../shared/types"
import { CCB_BUILTIN_COMMANDS } from "./deepseek-agent"
import {
  dedupeSkillsByName,
  scanClaudeSkills,
  scanCodexSkills,
  scanCursorSkills,
  scanSkillsRoot,
} from "./harness-skills"

/**
 * Shared harness seams used by AgentCoordinator.
 *
 * Engines stay independently selectable. This file is the filesystem fallback
 * for the composer "/" menu so each provider does not reimplement the same
 * "scan project + ~/.agents + ccb skills" walk.
 */

export const YOUMI_BUILTIN_SKILLS: readonly HarnessSkill[] = [
  {
    name: "software-engineering",
    description: "Complete software-engineering tasks — investigate, fix, implement, verify.",
    source: "skill",
  },
]

export interface SharedSkillScanArgs {
  cwd: string
  home?: string
  includeClaudeConfig?: boolean
}

/** Project Claude skills + ~/.agents/skills (+ optional ccb plugin skills). */
export function scanAiangSharedSkills(args: SharedSkillScanArgs): HarnessSkill[] {
  const home = args.home ?? homedir()
  const scanned = [
    ...scanClaudeSkills({ cwd: args.cwd, home }),
    ...scanSkillsRoot(path.join(home, ".agents", "skills")),
  ]
  if (args.includeClaudeConfig !== false) {
    scanned.push(...scanSkillsRoot(path.join(getClaudeConfigDir(home), "skills")))
  }
  return dedupeSkillsByName(scanned)
}

function ccbBuiltinSkills(): HarnessSkill[] {
  return CCB_BUILTIN_COMMANDS.map((name) => ({
    name,
    description: "",
    source: "command" as const,
  }))
}

/**
 * Cold-start / no-session skill list for the given provider.
 * Live harness enumeration still wins in AgentCoordinator when a session exists.
 */
export function listFilesystemSkills(
  provider: AgentProvider,
  cwd: string,
  home?: string,
): HarnessSkill[] {
  switch (provider) {
    case "claude":
      return scanClaudeSkills({ cwd, home })
    case "deepseek":
      return dedupeSkillsByName([
        ...ccbBuiltinSkills(),
        ...scanAiangSharedSkills({ cwd, home, includeClaudeConfig: true }),
      ])
    case "reasonix":
      return scanAiangSharedSkills({ cwd, home, includeClaudeConfig: true })
    case "youmi":
      return dedupeSkillsByName([
        ...YOUMI_BUILTIN_SKILLS,
        ...scanAiangSharedSkills({ cwd, home, includeClaudeConfig: false }),
      ])
    case "codex":
      return scanCodexSkills({ cwd, home })
    case "cursor":
      return scanCursorSkills({ cwd, home })
    case "pi":
      return []
  }
}
