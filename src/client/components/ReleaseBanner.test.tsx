import { afterEach, describe, expect, mock, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { ReleaseBanner, RELEASE_AT_MS } from "./ReleaseBanner"

const originalNow = Date.now
afterEach(() => {
  Date.now = originalNow
})

function freezeNow(at: number) {
  Date.now = mock(() => at)
}

describe("ReleaseBanner", () => {
  test("renders the V1 release announcement", () => {
    // 发布后、3 天生命周期内：横幅展示“已经推出”。
    freezeNow(RELEASE_AT_MS + 60_000)
    const html = renderToStaticMarkup(<ReleaseBanner />)

    expect(html).toContain("Youmi V1")
    expect(html).toContain("已经推出")
    expect(html).toContain("了解 Youmi")
    expect(html).not.toContain("查看详情")
    expect(html).not.toContain("原生 DeepSeek")
    expect(html).not.toContain("测试版")
  })

  test("shows a live countdown before release", () => {
    freezeNow(RELEASE_AT_MS - 60_000)
    const html = renderToStaticMarkup(<ReleaseBanner />)

    expect(html).toContain("推出 · 还有")
    expect(html).toContain("关闭公告")
  })

  test("is hidden once the 3-day lifetime has passed", () => {
    freezeNow(RELEASE_AT_MS + 3 * 24 * 60 * 60 * 1000 + 1000)
    const html = renderToStaticMarkup(<ReleaseBanner />)
    expect(html).toBe("")
  })
})
