import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { ChangesSummaryCard } from "./ChangesSummaryCard"
import type { ChatDiffFile } from "../../../shared/types"

const noop = () => {}

function makeFiles(): ChatDiffFile[] {
  return [
    { path: "src/App.tsx", changeType: "modified", isUntracked: false, additions: 12, deletions: 4, patchDigest: "a" },
    { path: "src/new.ts", changeType: "added", isUntracked: true, additions: 30, deletions: 0, patchDigest: "b" },
    { path: "src/old.ts", changeType: "deleted", isUntracked: false, additions: 0, deletions: 8, patchDigest: "c" },
  ]
}

describe("ChangesSummaryCard", () => {
  test("renders a proposed-edits table with +/- stats", () => {
    const html = renderToStaticMarkup(
      <ChangesSummaryCard files={makeFiles()} actions={{ onOpenFile: noop, onDiscardFile: noop, onDiscardAll: noop, onReview: noop }} />
    )
    expect(html).toContain("Proposed edits")
    expect(html).toContain("App.tsx")
    expect(html).toContain("new.ts")
    expect(html).toContain("old.ts")
    expect(html).toContain("+12")
    expect(html).toContain("−4")
    expect(html).toContain("+30")
    expect(html).toContain("−8")
    expect(html).toContain("Apply 3 changes")
    expect(html).toContain("Discard")
  })
})
