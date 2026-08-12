import { mkdirSync, mkdtempSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { describe, expect, test } from "bun:test"
import { getClaudeConfigDir } from "../shared/branding"
import type { SkillSearchSnapshot } from "../shared/types"
import { fetchHotSkillCategory, isReverseSkillName, removeInstalledSkillFromCcb, syncInstalledSkillToCcb } from "./skills"

function snapshot(skills: Array<{ skillId: string; name: string; installs: number; source: string }>): SkillSearchSnapshot {
  return {
    query: "test",
    searchType: "fuzzy",
    count: skills.length,
    duration_ms: 0,
    skills: skills.map((skill, index) => ({ id: `${skill.source}/${skill.skillId}`, ...skill })),
  }
}

describe("isReverseSkillName", () => {
  test("keeps names that look like reverse-engineering work", () => {
    expect(isReverseSkillName("protocol-reverse-engineering")).toBe(true)
    expect(isReverseSkillName("ctf-reverse")).toBe(true)
    expect(isReverseSkillName("vm-and-bytecode-reverse")).toBe(true)
  })

  test("rejects unrelated fuzzy hits", () => {
    expect(isReverseSkillName("azure-validate")).toBe(false)
    expect(isReverseSkillName("web-design-guidelines")).toBe(false)
    expect(isReverseSkillName("friday-brief")).toBe(false)
    expect(isReverseSkillName("returns-reverse-logistics")).toBe(false)
    expect(isReverseSkillName("reverse-image-search")).toBe(false)
  })
})

describe("fetchHotSkillCategory", () => {
  test("dedupes by skillId, filters reverse noise, sorts by installs, caps at limit", async () => {
    const reverse = await fetchHotSkillCategory("reverse", async () => snapshot([
      { skillId: "ctf-reverse", name: "ctf-reverse", installs: 100, source: "a" },
      // Same skillId from another source — the higher-install entry wins.
      { skillId: "ctf-reverse", name: "ctf-reverse", installs: 500, source: "b" },
      // Fuzzy noise that must be filtered out for reverse.
      { skillId: "azure-validate", name: "azure-validate", installs: 900_000, source: "microsoft" },
      { skillId: "malware-analysis", name: "malware-analysis", installs: 300, source: "c" },
    ]), 10)

    expect(reverse.map((skill) => skill.skillId)).toEqual(["ctf-reverse", "malware-analysis"])
    expect(reverse[0]).toMatchObject({ skillId: "ctf-reverse", installs: 500 })
  })

  test("programming category keeps fuzzy hits and sorts by installs", async () => {
    const programming = await fetchHotSkillCategory("programming", async () => snapshot([
      { skillId: "small-skill", name: "small-skill", installs: 10, source: "a" },
      { skillId: "hot-skill", name: "hot-skill", installs: 1_000_000, source: "b" },
    ]), 10)

    expect(programming.map((skill) => skill.skillId)).toEqual(["hot-skill", "small-skill"])
  })

  test("attaches the Chinese description for known hot skillIds", async () => {
    const programming = await fetchHotSkillCategory("programming", async () => snapshot([
      { skillId: "frontend-design", name: "frontend-design", installs: 100, source: "anthropics/skills" },
      { skillId: "unknown-skill", name: "unknown-skill", installs: 50, source: "a/b" },
    ]), 10)

    const known = programming.find((skill) => skill.skillId === "frontend-design")
    const unknown = programming.find((skill) => skill.skillId === "unknown-skill")
    expect(known?.description?.length).toBeGreaterThan(10)
    expect(unknown?.description).toBeUndefined()
  })

  test("caps the list at the requested limit", async () => {
    const skills = await fetchHotSkillCategory("programming", async () => snapshot([
      { skillId: "one", name: "one", installs: 3, source: "a" },
      { skillId: "two", name: "two", installs: 2, source: "b" },
      { skillId: "three", name: "three", installs: 1, source: "c" },
    ]), 2)

    expect(skills).toHaveLength(2)
    expect(skills[0]?.skillId).toBe("one")
  })
})

function withTempHome(fn: (homeDir: string) => void) {
  const homeDir = mkdtempSync(path.join(tmpdir(), "skills-test-"))
  try {
    fn(homeDir)
  } finally {
    rmSync(homeDir, { recursive: true, force: true })
  }
}

describe("ccb skill sync", () => {
  test("links an installed skill into the ccb skills dir and is idempotent", () => {
    withTempHome((homeDir) => {
      const skillDir = path.join(homeDir, ".agents", "skills", "my-skill")
      mkdirSync(skillDir, { recursive: true })
      writeFileSync(path.join(skillDir, "SKILL.md"), "---\nname: my-skill\n---\n")

      expect(syncInstalledSkillToCcb("my-skill", homeDir)).toBe(true)
      const linkPath = path.join(getClaudeConfigDir(homeDir), "skills", "my-skill")
      expect(readlinkSync(linkPath)).toBe(skillDir)
      // 幂等：重复同步不报错，链接仍指向同一来源。
      expect(syncInstalledSkillToCcb("my-skill", homeDir)).toBe(true)
      expect(readlinkSync(linkPath)).toBe(skillDir)
    })
  })

  test("replaces a stale link when the source changes", () => {
    withTempHome((homeDir) => {
      const oldSkill = path.join(homeDir, ".agents", "skills", "my-skill")
      mkdirSync(oldSkill, { recursive: true })
      writeFileSync(path.join(oldSkill, "SKILL.md"), "---\nname: my-skill\n---\n")
      const linkPath = path.join(getClaudeConfigDir(homeDir), "skills", "my-skill")
      mkdirSync(path.dirname(linkPath), { recursive: true })
      // 模拟旧链接指向一个已不存在/不同的来源。
      symlinkSync(path.join(homeDir, ".agents", "skills", "gone"), linkPath)

      expect(syncInstalledSkillToCcb("my-skill", homeDir)).toBe(true)
      expect(readlinkSync(linkPath)).toBe(oldSkill)
    })
  })

  test("does not link a skill without a SKILL.md", () => {
    withTempHome((homeDir) => {
      mkdirSync(path.join(homeDir, ".agents", "skills", "empty"), { recursive: true })
      expect(syncInstalledSkillToCcb("empty", homeDir)).toBe(false)
    })
  })

  test("removes the ccb link once the source dir is gone", () => {
    withTempHome((homeDir) => {
      const skillDir = path.join(homeDir, ".agents", "skills", "my-skill")
      mkdirSync(skillDir, { recursive: true })
      writeFileSync(path.join(skillDir, "SKILL.md"), "---\nname: my-skill\n---\n")
      syncInstalledSkillToCcb("my-skill", homeDir)
      const linkPath = path.join(getClaudeConfigDir(homeDir), "skills", "my-skill")
      expect(readlinkSync(linkPath)).toBe(skillDir)

      rmSync(skillDir, { recursive: true, force: true })
      removeInstalledSkillFromCcb("my-skill", homeDir)
      expect(() => readlinkSync(linkPath)).toThrow()
    })
  })

  test("keeps the ccb link when a same-name dir still exists", () => {
    withTempHome((homeDir) => {
      const skillDir = path.join(homeDir, ".agents", "skills", "my-skill")
      mkdirSync(skillDir, { recursive: true })
      writeFileSync(path.join(skillDir, "SKILL.md"), "---\nname: my-skill\n---\n")
      syncInstalledSkillToCcb("my-skill", homeDir)

      removeInstalledSkillFromCcb("my-skill", homeDir)
      const linkPath = path.join(getClaudeConfigDir(homeDir), "skills", "my-skill")
      expect(readlinkSync(linkPath)).toBe(skillDir)
    })
  })
})
