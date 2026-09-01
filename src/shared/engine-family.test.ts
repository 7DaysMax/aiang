import { describe, expect, test } from "bun:test"
import {
  compareProvidersByFamily,
  engineFamilyOf,
  engineUsesModelProfile,
  groupProvidersByFamily,
} from "./engine-family"

describe("engine family", () => {
  test("splits official engines from Youmi-class engines", () => {
    expect(engineFamilyOf("claude")).toBe("native")
    expect(engineFamilyOf("cursor")).toBe("native")
    expect(engineFamilyOf("codex")).toBe("native")
    expect(engineFamilyOf("youmi")).toBe("thirdParty")
    expect(engineFamilyOf("deepseek")).toBe("thirdParty")
    expect(engineFamilyOf("reasonix")).toBe("thirdParty")
    expect(engineFamilyOf("pi")).toBe("thirdParty")
  })

  test("every engine except Cursor uses the shared model profile", () => {
    expect(engineUsesModelProfile("cursor")).toBe(false)
    expect(engineUsesModelProfile("claude")).toBe(true)
    expect(engineUsesModelProfile("codex")).toBe(true)
    expect(engineUsesModelProfile("youmi")).toBe(true)
    expect(engineUsesModelProfile("pi")).toBe(true)
  })

  test("orders native first, then Youmi-class including Pi", () => {
    const ids = ["pi", "youmi", "cursor", "claude", "reasonix", "codex", "deepseek"] as const
    const sorted = [...ids].sort(compareProvidersByFamily)
    expect(sorted).toEqual(["claude", "cursor", "codex", "youmi", "deepseek", "reasonix", "pi"])
    expect(groupProvidersByFamily(ids.map((id) => ({ id })))).toEqual([
      { family: "native", label: "原生", providers: [{ id: "claude" }, { id: "cursor" }, { id: "codex" }] },
      {
        family: "thirdParty",
        label: "第三方",
        providers: [{ id: "youmi" }, { id: "deepseek" }, { id: "reasonix" }, { id: "pi" }],
      },
    ])
  })
})
