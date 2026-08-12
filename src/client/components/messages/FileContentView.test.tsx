import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { FileContentView } from "./FileContentView"

describe("FileContentView", () => {
  test("renders small edit diffs through the rich PatchDiff renderer", () => {
    const html = renderToStaticMarkup(
      <FileContentView
        content=""
        isDiff
        filePath="src/App.tsx"
        oldString={"const a = 1\n"}
        newString={"const a = 2\n"}
      />
    )
    expect(html).toContain("<diffs-container")
    expect(html).toContain("Diff")
  })

  test("renders large edit diffs with the fast table path", () => {
    const oldLines = Array.from({ length: 200 }, (_, i) => `line ${i}`).join("\n")
    const newLines = Array.from({ length: 200 }, (_, i) => `line ${i} changed`).join("\n")
    const html = renderToStaticMarkup(
      <FileContentView
        content=""
        isDiff
        filePath="src/big.ts"
        oldString={oldLines}
        newString={newLines}
        maxLines={40}
      />
    )
    // Fast path: no pierre container, plain table rows with +/- gutters
    expect(html).not.toContain("<diffs-container")
    expect(html).toContain("+")
    expect(html).toContain("−")
    expect(html).toContain("还有")
  })

  test("keeps plain text mode with optional line numbers", () => {
    const html = renderToStaticMarkup(
      <FileContentView content={"1→const a = 1\n2→const b = 2\n"} />
    )
    expect(html).toContain("const a = 1")
    expect(html).toContain(">1<")
    expect(html).toContain(">2<")
  })

  test("keeps plain text mode without line numbers", () => {
    const html = renderToStaticMarkup(
      <FileContentView content="hello world" />
    )
    expect(html).toContain("hello world")
  })

  test("truncates long plain text and offers expand", () => {
    const content = Array.from({ length: 500 }, (_, i) => `${i + 1}→line ${i}`).join("\n")
    const html = renderToStaticMarkup(
      <FileContentView content={content} maxLines={50} />
    )
    expect(html).toContain("还有 450 行")
    expect(html).toContain("line 0")
    expect(html).not.toContain("line 499")
  })
})
