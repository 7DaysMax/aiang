import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { CodeBlock, CodeBlockFromMarkdown } from "./CodeBlock"

describe("CodeBlock", () => {
  test("renders filename, language, line numbers, and copy", () => {
    const html = renderToStaticMarkup(
      <CodeBlock
        filename="churn.ts"
        language="ts"
        code={'export async function churnBatch() {\n  return "ok"\n}'}
      />
    )
    expect(html).toContain("churn.ts")
    expect(html).toContain("TypeScript")
    expect(html).toContain("Copy")
    expect(html).toContain(">1<")
    expect(html).toContain("churnBatch")
    expect(html).toContain("rounded-card")
    expect(html).toContain("shadow-card")
  })

  test("shows a caret on the last line while streaming", () => {
    const html = renderToStaticMarkup(
      <CodeBlock language="ts" code={"const a = 1"} streaming />
    )
    expect(html).toContain("bg-accent")
    expect(html).toContain("const")
  })

  test("parses a markdown fence info string", () => {
    const html = renderToStaticMarkup(
      <CodeBlockFromMarkdown info="src/app.tsx" code={"export const App = () => null"} />
    )
    expect(html).toContain("app.tsx")
    expect(html).toContain("TSX")
  })
})
