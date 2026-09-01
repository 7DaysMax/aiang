import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { ReleaseBanner, RELEASE_AT_MS } from "./ReleaseBanner"

describe("ReleaseBanner", () => {
  test("renders the V1 release announcement", () => {
    const html = renderToStaticMarkup(<ReleaseBanner />)

    expect(html).toContain("Youmi V1")
    expect(html).toContain("已经推出")
    expect(html).toContain("了解 Youmi")
    expect(html).not.toContain("查看详情")
    expect(html).not.toContain("原生 DeepSeek")
    expect(html).not.toContain("测试版")
  })

  test("shows a live countdown before release", () => {
    const html = renderToStaticMarkup(<ReleaseBanner />)

    if (Date.now() < RELEASE_AT_MS) {
      expect(html).toContain("推出 · 还有")
      expect(html).toContain("关闭公告")
    } else {
      expect(html).toContain("已经推出")
    }
  })
})
