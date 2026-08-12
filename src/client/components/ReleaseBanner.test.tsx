import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { ReleaseBanner, RELEASE_AT_MS } from "./ReleaseBanner"

describe("ReleaseBanner", () => {
  test("renders the V1 release announcement", () => {
    const html = renderToStaticMarkup(<ReleaseBanner />)

    expect(html).toContain("Youmi V1 测试版")
    expect(html).toContain("8月13日 12:00")
    expect(html).toContain("查看详情")
  })

  test("shows a live countdown before release", () => {
    const html = renderToStaticMarkup(<ReleaseBanner />)

    if (Date.now() < RELEASE_AT_MS) {
      expect(html).toContain("发布 · 还有")
      expect(html).toContain("关闭公告")
    } else {
      expect(html).toContain("已发布")
    }
  })
})
