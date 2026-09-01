import { describe, expect, test } from "bun:test"
import { collectToolDiffChips, getToolChipPresentation } from "./toolChipPresentation"
import type { ProcessedToolCall } from "./types"

describe("collectToolDiffChips", () => {
  test("summarizes write/edit/delete calls as file chips", () => {
    const files = collectToolDiffChips([
      {
        id: "w",
        kind: "tool",
        toolKind: "write_file",
        toolName: "Write",
        toolId: "1",
        input: { filePath: "src/flavors.css", content: "a\nb\nc" },
        timestamp: new Date(0).toISOString(),
      },
      {
        id: "e",
        kind: "tool",
        toolKind: "edit_file",
        toolName: "Edit",
        toolId: "2",
        input: { filePath: "src/ChurnSchedule.tsx", oldString: "old\nline", newString: "a\nb\nc" },
        timestamp: new Date(0).toISOString(),
      },
    ] as ProcessedToolCall[])

    expect(files[0]).toMatchObject({
      file: "flavors.css",
      path: "src/flavors.css",
      add: 3,
      del: 0,
    })
    expect(files[1]).toMatchObject({
      file: "ChurnSchedule.tsx",
      add: 3,
      del: 2,
    })
  })
})

describe("getToolChipPresentation", () => {
  test("puts the command on the chip and a human label on the row", () => {
    const presentation = getToolChipPresentation(
      {
        id: "b",
        kind: "tool",
        toolKind: "bash",
        toolName: "Bash",
        toolId: "1",
        input: { command: "npm run freeze", description: "Rebuild and verify" },
        timestamp: new Date(0).toISOString(),
      } as ProcessedToolCall,
      { pending: true, done: false, durationMs: null },
    )
    expect(presentation).toMatchObject({
      icon: "run",
      label: "Rebuild and verify",
      chip: "npm run freeze",
      chipMono: true,
      detailMono: true,
    })
    expect(presentation.detail).toEqual([{ text: "running…" }])
  })

  test("summarizes a write as Write N lines plus added-code detail", () => {
    const presentation = getToolChipPresentation(
      {
        id: "w",
        kind: "tool",
        toolKind: "write_file",
        toolName: "Write",
        toolId: "1",
        input: {
          filePath: "src/ChurnSchedule.tsx",
          content: "const windows = slots.filter((s) => s.temp <= -12)\nreturn schedule(windows)\n",
        },
        timestamp: new Date(0).toISOString(),
      } as ProcessedToolCall,
      { pending: false, done: true, durationMs: 200 },
    )
    expect(presentation.label).toBe("写入 2 行")
    expect(presentation.chip).toBe("ChurnSchedule.tsx")
    expect(presentation.detail[0]).toEqual({
      text: "+ const windows = slots.filter((s) => s.temp <= -12)",
      tone: "add",
    })
  })
})
