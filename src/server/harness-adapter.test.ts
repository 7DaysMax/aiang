import { describe, expect, test } from "bun:test"
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { CCB_BUILTIN_COMMANDS } from "./deepseek-agent"
import { listFilesystemSkills } from "./harness-adapter"

describe("listFilesystemSkills", () => {
  test("youmi always exposes the software-engineering skill and scans shared roots", () => {
    const home = mkdtempSync(join(tmpdir(), "aiang-skills-home-"))
    const cwd = mkdtempSync(join(tmpdir(), "aiang-skills-cwd-"))
    try {
      mkdirSync(join(home, ".agents", "skills", "review"), { recursive: true })
      writeFileSync(join(home, ".agents", "skills", "review", "SKILL.md"), "---\nname: review\ndescription: Review code\n---\n", "utf8")
      const skills = listFilesystemSkills("youmi", cwd, home)
      expect(skills.some((skill) => skill.name === "software-engineering")).toBe(true)
      expect(skills.some((skill) => skill.name === "review")).toBe(true)
    } finally {
      rmSync(home, { recursive: true, force: true })
      rmSync(cwd, { recursive: true, force: true })
    }
  })

  test("deepseek prefixes ccb builtins then shared skills", () => {
    const cwd = mkdtempSync(join(tmpdir(), "aiang-skills-ds-"))
    try {
      const skills = listFilesystemSkills("deepseek", cwd, cwd)
      expect(skills[0]?.name).toBe(CCB_BUILTIN_COMMANDS[0])
      expect(skills.length).toBeGreaterThanOrEqual(CCB_BUILTIN_COMMANDS.length)
    } finally {
      rmSync(cwd, { recursive: true, force: true })
    }
  })
})
