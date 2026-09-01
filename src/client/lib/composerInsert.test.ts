import { describe, expect, test } from "bun:test"
import { extractAnswerSources, suggestFollowUps } from "./composerInsert"

describe("extractAnswerSources", () => {
  test("collects markdown links as sources", () => {
    expect(extractAnswerSources("See [docs](https://scoopdata.io/report) and [also](https://scoopdata.io/report).")).toEqual([
      { name: "docs", href: "https://scoopdata.io/report" },
    ])
  })
})

describe("suggestFollowUps", () => {
  test("picks trailing question lines", () => {
    expect(suggestFollowUps("Done.\nWant the tests next?\nShould I open a PR?")).toEqual([
      "Want the tests next?",
      "Should I open a PR?",
    ])
  })

  test("falls back when the answer has no questions", () => {
    expect(suggestFollowUps("The batch is ready.")).toEqual([
      "继续完善这一点",
      "用更简单的方式解释",
    ])
  })
})
