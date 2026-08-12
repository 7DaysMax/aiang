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
  test("renders file count and total +/- stats", () => {
    const html = renderToStaticMarkup(
      <ChangesSummaryCard files={makeFiles()} actions={{ onOpenFile: noop, onDiscardFile: noop, onDiscardAll: noop, onReview: noop }} />
    )
    expect(html).toContain("改动摘要")
    expect(html).toContain("3</span> 个文件")
    expect(html).toContain("+42")
    expect(html).toContain("−12")
  })

  test("lists each file with its own +X −Y", () => {
    const html = renderToStaticMarkup(
      <ChangesSummaryCard files={makeFiles()} actions={{ onOpenFile: noop, onDiscardFile: noop, onDiscardAll: noop, onReview: noop }} />
    )
    // File name is shown prominently; directory is secondary.
    expect(html).toContain("App.tsx")
    expect(html).toContain("new.ts")
    expect(html).toContain("old.ts")
    expect(html).toContain("+12")
    expect(html).toContain("−4")
    expect(html).toContain("+30")
    expect(html).toContain("−8")
  })

  test("collapses to 8 rows and shows the expand toggle", () => {
    const files = Array.from({ length: 10 }, (_, index) => ({
      path: `src/file-${index}.ts`,
      changeType: "modified" as const,
      isUntracked: false,
      additions: 1,
      deletions: 1,
      patchDigest: `d${index}`,
    }))
    const html = renderToStaticMarkup(
      <ChangesSummaryCard files={files} actions={{ onOpenFile: noop, onDiscardFile: noop, onDiscardAll: noop, onReview: noop }} />
    )
    expect(html).toContain("还有 2 个文件")
    expect(html).toContain("file-0.ts")
    expect(html).toContain("file-7.ts")
    expect(html).not.toContain("file-8.ts")
  })

  test("renders discard-all and review actions", () => {
    const html = renderToStaticMarkup(
      <ChangesSummaryCard files={makeFiles()} actions={{ onOpenFile: noop, onDiscardFile: noop, onDiscardAll: noop, onReview: noop }} />
    )
    expect(html).toContain("全部撤销")
    expect(html).toContain("审核改动")
  })
})
