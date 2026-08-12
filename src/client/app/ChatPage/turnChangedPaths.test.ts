import { describe, expect, test } from "bun:test"
import { collectLastTurnChangedPaths } from "./ChatTranscriptViewport"
import type { ResolvedTranscriptRow } from "../KannaTranscript"
import type { HydratedTranscriptMessage } from "../../../shared/types"

function user(id: string, content: string): ResolvedTranscriptRow {
  return {
    kind: "single",
    id,
    message: {
      id,
      kind: "user_prompt",
      content,
      attachments: [],
      timestamp: new Date(0).toISOString(),
    } as HydratedTranscriptMessage,
    index: 0,
    isLoading: false,
    isFirstSystem: false,
    isModelChange: false,
    isFirstAccount: false,
    isLatestAskUserQuestion: false,
    isLatestExitPlanMode: false,
    isLatestTodoWrite: false,
    hideResult: false,
    isFinalStatus: false,
    hasThinkingPrefix: false,
    isLatestThinking: false,
  }
}

function tool(
  id: string,
  toolKind: "write_file" | "edit_file" | "delete_file" | "bash" | "read_file",
  filePath?: string,
): ResolvedTranscriptRow {
  return {
    kind: "single",
    id,
    message: {
      id,
      kind: "tool",
      toolKind,
      toolName: toolKind,
      toolId: id,
      input: filePath ? { filePath, content: "", oldString: "", newString: "" } : { command: "ls" },
      timestamp: new Date(0).toISOString(),
    } as HydratedTranscriptMessage,
    index: 0,
    isLoading: false,
    isFirstSystem: false,
    isModelChange: false,
    isFirstAccount: false,
    isLatestAskUserQuestion: false,
    isLatestExitPlanMode: false,
    isLatestTodoWrite: false,
    hideResult: false,
    isFinalStatus: false,
    hasThinkingPrefix: false,
    isLatestThinking: false,
  }
}

describe("collectLastTurnChangedPaths (UI changes card scope)", () => {
  test("returns empty when there is no user prompt", () => {
    expect(collectLastTurnChangedPaths([tool("t1", "write_file", "a.ts")])).toEqual(new Set())
  })

  test("only includes write/edit/delete after the latest user prompt", () => {
    const rows = [
      user("u0", "old turn"),
      tool("t0", "write_file", "old.ts"),
      user("u1", "new turn"),
      tool("t1", "write_file", "src/App.tsx"),
      tool("t2", "edit_file", "src/lib.ts"),
      tool("t3", "bash"),
      tool("t4", "read_file", "src/ignore.ts"),
      tool("t5", "delete_file", "src/gone.ts"),
    ]
    expect([...collectLastTurnChangedPaths(rows)].sort()).toEqual([
      "src/App.tsx",
      "src/gone.ts",
      "src/lib.ts",
    ])
  })

  test("ignores files from earlier turns once a new user prompt arrives", () => {
    const rows = [
      user("u0", "first"),
      tool("t0", "write_file", "big.ts"),
      user("u1", "second"),
      tool("t1", "edit_file", "small.ts"),
    ]
    expect([...collectLastTurnChangedPaths(rows)]).toEqual(["small.ts"])
  })
})
