import { describe, expect, test } from "bun:test"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { CollaborationCoach, collaborationCoachCopy } from "./CollaborationCoach"

describe("collaborationCoachCopy", () => {
  test("teaches how the same-engine review works when off", () => {
    expect(collaborationCoachCopy({ provider: "youmi", enabled: false })).toEqual({
      action: "协作验收 · 关",
      hint: "打开后：同一引擎先动手，再自动验收。不换引擎，也不双跑。",
      canToggle: true,
    })
  })

  test("explains the retry step when on", () => {
    expect(collaborationCoachCopy({ provider: "claude", enabled: true }).hint).toContain("按意见再改")
  })

  test("Cursor cannot join the review", () => {
    const copy = collaborationCoachCopy({ provider: "cursor", enabled: true })
    expect(copy.canToggle).toBe(false)
    expect(copy.hint).toContain("Cursor")
  })
})

describe("CollaborationCoach", () => {
  test("renders the teaching line under the composer", () => {
    const html = renderToStaticMarkup(createElement(CollaborationCoach, {
      provider: "codex",
      enabled: false,
      onChange: () => {},
    }))
    expect(html).toContain("协作验收 · 关")
    expect(html).toContain("先动手，再自动验收")
  })
})
