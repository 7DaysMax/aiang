import { describe, expect, test } from "bun:test"
import { preloadPatchDiff } from "@pierre/diffs/ssr"
import { buildEditDiffPatch } from "../../../lib/diffPatch"

const RENDER_OPTIONS = {
  diffStyle: "unified",
  lineDiffType: "word",
  diffIndicators: "classic",
  disableFileHeader: true,
  disableBackground: false,
  overflow: "scroll",
} as const

async function renderPatch(patch: string): Promise<string> {
  const { prerenderedHTML } = await preloadPatchDiff({
    patch,
    options: RENDER_OPTIONS,
  })
  // 剥掉 SVG sprite 和 CSS，只留 diff 主体，避免断言被无关内容干扰。
  return prerenderedHTML
    .replace(/<svg data-icon-sprite[\s\S]*?<\/svg>/, "")
    .replace(/<style[\s\S]*?<\/style>/g, "")
}

/** 去掉所有标签后的纯文本（Shiki 会把一行拆成多个 token span）。 */
function textContent(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
}

describe("diff syntax & change highlighting (git + snapshot patches)", () => {
  test("git-style tsx patch shows deletions, additions, line numbers, syntax tokens and word-level diff", async () => {
    const patch = [
      "diff --git a/src/App.tsx b/src/App.tsx",
      "index 1111111..2222222 100644",
      "--- a/src/App.tsx",
      "+++ b/src/App.tsx",
      "@@ -1,4 +1,5 @@",
      " const a = 1",
      "-console.log(a)",
      "+console.log(a + 1)",
      "+// new line here",
      " function helper() {",
      "   return a",
      " }",
    ].join("\n")

    const html = await renderPatch(patch)

    // 改动行：删除 + 新增
    expect(html).toContain('data-line-type="change-deletion"')
    expect(html).toContain('data-line-type="change-addition"')
    // 上下文行
    expect(html).toContain('data-line-type="context"')
    // 行号
    expect(html).toContain('data-line-number-content=""')
    expect(html).toContain('>1<')
    expect(html).toContain('>6<')
    // 语法高亮：Shiki token（每种语言主题都有 --diffs-token-* 样式）
    expect(html).toContain("--diffs-token-dark:")
    // 词级 diff：改动的行内只高亮变化的部分
    expect(html).toContain('data-diff-span=""')
    // 新增行内容完整
    expect(html).toContain("// new line here")
  })

  test("snapshot-style patch (same format as the no-git diff panel) renders identically", async () => {
    const oldSource = "const a = 1\nconsole.log(a)\nfunction helper() {\n  return a\n}\n"
    const newSource = "const a = 2\nconsole.log(a, \"v2\")\n// extra\nfunction helper() {\n  return a\n}\n"
    const patch = buildEditDiffPatch("src/index.ts", oldSource, newSource)

    expect(patch).toStartWith("diff --git a/src/index.ts b/src/index.ts")
    expect(patch).toContain("--- a/src/index.ts")
    expect(patch).toContain("+++ b/src/index.ts")
    expect(patch).not.toContain("Index:")

    const html = await renderPatch(patch)
    expect(html).toContain('data-line-type="change-deletion"')
    expect(html).toContain('data-line-type="change-addition"')
    expect(html).toContain("--diffs-token-dark:")
    expect(textContent(html)).toContain("const a = 2")
  })

  test("detects the language from the file extension and highlights syntax for several languages", async () => {
    const cases: Array<{ path: string; oldLine: string; newLine: string }> = [
      { path: "app.py", oldLine: "x = 1", newLine: "x = 2" },
      { path: "config.json", oldLine: '"key": true', newLine: '"key": false' },
      { path: "style.css", oldLine: ".a { color: red }", newLine: ".a { color: blue }" },
      { path: "README.md", oldLine: "# Title", newLine: "# Title v2" },
    ]

    for (const { path, oldLine, newLine } of cases) {
      const patch = buildEditDiffPatch(path, oldLine, newLine)
      const html = await renderPatch(patch)
      expect(html).toContain("--diffs-token-dark:")
      expect(html).toContain('data-line-type="change-deletion"')
      expect(html).toContain('data-line-type="change-addition"')
      expect(textContent(html)).toContain(newLine)
    }
  })

  test("whole-file deletion and addition render as pure deletion/addition blocks", async () => {
    const deleted = await renderPatch([
      "diff --git a/gone.py b/gone.py",
      "--- a/gone.py",
      "+++ b/gone.py",
      "@@ -1,2 +0,0 @@",
      "-def f():",
      "-    return 1",
    ].join("\n"))
    expect(deleted).toContain('data-line-type="change-deletion"')
    expect(deleted).not.toContain('data-line-type="change-addition"')

    const added = await renderPatch([
      "diff --git a/added.py b/added.py",
      "--- a/added.py",
      "+++ b/added.py",
      "@@ -0,0 +1,2 @@",
      "+def f():",
      "+    return 2",
    ].join("\n"))
    expect(added).toContain('data-line-type="change-addition"')
    expect(added).not.toContain('data-line-type="change-deletion"')
  })

  test("keeps unicode content intact inside highlighted lines", async () => {
    const patch = buildEditDiffPatch(
      "src/i18n/zh.json",
      '{"greeting": "你好世界"}\n',
      '{"greeting": "你好，世界！"}\n',
    )
    const html = await renderPatch(patch)
    expect(textContent(html)).toContain("你好世界")
    expect(textContent(html)).toContain("你好，世界！")
  })
})
