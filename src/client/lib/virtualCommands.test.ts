import { describe, expect, test } from "bun:test"
import type { HarnessSkill } from "../../shared/types"
import {
  getVirtualCommand,
  isVirtualCommand,
  mergeVirtualSkillMenuItems,
  VIRTUAL_COMMANDS,
} from "./virtualCommands"

function skill(name: string, description = ""): HarnessSkill {
  return { name, description, source: "builtin" }
}

describe("getVirtualCommand", () => {
  test("matches exact /commands, with or without trailing whitespace", () => {
    expect(getVirtualCommand("/model")?.name).toBe("model")
    expect(getVirtualCommand("/model ")?.name).toBe("model")
    expect(getVirtualCommand("/clear")?.name).toBe("clear")
    expect(getVirtualCommand("/help")?.name).toBe("help")
    expect(getVirtualCommand("/config")?.name).toBe("config")
    expect(getVirtualCommand("/cost")?.name).toBe("cost")
    expect(getVirtualCommand("/status")?.name).toBe("status")
  })

  test("rejects argumented invocations so real engine commands stay unshadowed", () => {
    expect(getVirtualCommand("/model sonnet")).toBeNull()
    expect(getVirtualCommand("/clear --yes")).toBeNull()
    expect(getVirtualCommand("/help me")).toBeNull()
  })

  test("rejects plain text, empty input and unknown slashes", () => {
    expect(getVirtualCommand("hello")).toBeNull()
    expect(getVirtualCommand("")).toBeNull()
    expect(getVirtualCommand("/")).toBeNull()
    expect(getVirtualCommand("/unknown")).toBeNull()
    expect(getVirtualCommand("/config/section")).toBeNull()
  })

  test("isVirtualCommand agrees with getVirtualCommand", () => {
    expect(isVirtualCommand("/model")).toBe(true)
    expect(isVirtualCommand("/model sonnet")).toBe(false)
  })
})

describe("mergeVirtualSkillMenuItems", () => {
  test("appends virtual commands that match the query", () => {
    const merged = mergeVirtualSkillMenuItems([skill("deploy")], "mod")
    expect(merged.map((entry) => entry.name)).toContain("model")
    expect(merged.map((entry) => entry.name)).toContain("deploy")
  })

  test("virtual commands participate in fuzzy ranking", () => {
    const merged = mergeVirtualSkillMenuItems([], "clear")
    expect(merged.map((entry) => entry.name)).toEqual(["clear"])
  })

  test("real skills win name collisions", () => {
    const merged = mergeVirtualSkillMenuItems([skill("model", "real engine command")], "model")
    expect(merged).toHaveLength(1)
    expect(merged[0]).toEqual(skill("model", "real engine command"))
  })

  test("returns the full catalog for an empty query, ranked best-last", () => {
    const merged = mergeVirtualSkillMenuItems([], "")
    const names = merged.map((entry) => entry.name)
    expect(names).toHaveLength(VIRTUAL_COMMANDS.length)
    // Ascending render: equal scores sort deterministically (descending
    // alphabetical), so the lowest name lands nearest the input.
    expect(names.at(-1)).toBe("clear")
    expect(names.at(0)).toBe("status")
  })
})
