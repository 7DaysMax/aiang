import { describe, expect, test } from "bun:test"
import { buildEditDiffPatch } from "./diffPatch"

describe("buildEditDiffPatch", () => {
  test("produces a git-style patch with a/x and b/x headers", () => {
    const patch = buildEditDiffPatch("src/App.tsx", "const a = 1\n", "const a = 2\n")
    expect(patch).toStartWith("diff --git a/src/App.tsx b/src/App.tsx")
    expect(patch).toContain("--- a/src/App.tsx")
    expect(patch).toContain("+++ b/src/App.tsx")
    expect(patch).toContain("-const a = 1")
    expect(patch).toContain("+const a = 2")
    expect(patch).not.toContain("Index:")
  })

  test("counts hunks correctly for multi-line edits", () => {
    const oldSource = "a\nb\nc\nd\ne\n"
    const newSource = "a\nb\nX\nY\ne\n"
    const patch = buildEditDiffPatch("f.txt", oldSource, newSource)
    expect(patch).toContain("@@ -1,5 +1,5 @@")
    expect(patch).toContain("-c")
    expect(patch).toContain("+X")
    expect(patch).toContain("-d")
    expect(patch).toContain("+Y")
  })

  test("handles empty old or new strings (added / deleted files)", () => {
    const added = buildEditDiffPatch("new.py", "", "print(1)\n")
    expect(added).toContain("+print(1)")
    const deleted = buildEditDiffPatch("old.py", "print(1)\n", "")
    expect(deleted).toContain("-print(1)")
  })
})
