import { describe, expect, test } from "bun:test"
import {
  findUnclosedFence,
  languageDisplayName,
  parseFenceInfo,
  prepareStreamingMarkdown,
  sameStreamingCode,
} from "./streamingMarkdown"

describe("findUnclosedFence", () => {
  test("returns null when every fence is closed", () => {
    expect(findUnclosedFence("```ts\nconst a = 1\n```\nhello")).toBeNull()
  })

  test("returns the open body when the last fence is unclosed", () => {
    const open = findUnclosedFence("before\n```ts\nconst a = 1")
    expect(open).toEqual({
      marker: "```",
      info: "ts",
      code: "const a = 1",
    })
  })

  test("ignores a closed fence and reports a later open one", () => {
    const open = findUnclosedFence("```js\nclosed()\n```\n```python\nprint('hi'")
    expect(open?.info).toBe("python")
    expect(open?.code).toBe("print('hi'")
  })

  test("requires a matching-length closer", () => {
    expect(findUnclosedFence("````ts\ncode\n```")).toMatchObject({
      marker: "````",
      info: "ts",
      code: "code\n```",
    })
  })
})

describe("prepareStreamingMarkdown", () => {
  test("leaves settled text alone", () => {
    const text = "```ts\nconst a = 1"
    expect(prepareStreamingMarkdown(text, false)).toEqual({
      source: text,
      streamingFence: false,
      openCode: null,
      openInfo: null,
    })
  })

  test("virtually closes an open fence while streaming", () => {
    const prepared = prepareStreamingMarkdown("```ts\nconst a = 1", true)
    expect(prepared.streamingFence).toBe(true)
    expect(prepared.openCode).toBe("const a = 1")
    expect(prepared.openInfo).toBe("ts")
    expect(prepared.source).toBe("```ts\nconst a = 1\n```")
  })

  test("does not add a second trailing newline when the source already has one", () => {
    const prepared = prepareStreamingMarkdown("```ts\nconst a = 1\n", true)
    expect(prepared.source).toBe("```ts\nconst a = 1\n```")
  })
})

describe("parseFenceInfo", () => {
  test("reads a language token", () => {
    expect(parseFenceInfo("language-ts")).toEqual({
      language: "ts",
      languageName: "TypeScript",
    })
  })

  test("treats a path-like info string as a filename", () => {
    expect(parseFenceInfo("src/app.tsx")).toEqual({
      language: "tsx",
      languageName: "TSX",
      filename: "app.tsx",
    })
  })

  test("reads language plus filename", () => {
    expect(parseFenceInfo("ts src/lib.ts")).toEqual({
      language: "ts",
      languageName: "TypeScript",
      filename: "src/lib.ts",
    })
  })
})

describe("languageDisplayName / sameStreamingCode", () => {
  test("falls back to the raw id", () => {
    expect(languageDisplayName("zig")).toBe("zig")
    expect(languageDisplayName("")).toBe("Code")
  })

  test("ignores trailing whitespace when matching an open fence body", () => {
    expect(sameStreamingCode("const a = 1\n", "const a = 1")).toBe(true)
  })
})
