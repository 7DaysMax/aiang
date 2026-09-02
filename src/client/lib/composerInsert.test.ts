import { describe, expect, test } from "bun:test"
import { extractAnswerSources } from "./composerInsert"

describe("extractAnswerSources", () => {
  test("collects markdown links as sources", () => {
    expect(extractAnswerSources("See [docs](https://scoopdata.io/report) and [also](https://scoopdata.io/report).")).toEqual([
      { name: "docs", href: "https://scoopdata.io/report" },
    ])
  })
})
