import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { ProcessingMessage } from "./ProcessingMessage"
import LoadingState from "@/components/primitives/LoadingState"

describe("ProcessingMessage UI", () => {
  test("renders 运行中… for running status", () => {
    const html = renderToStaticMarkup(<ProcessingMessage status="running" />)
    expect(html).toContain("运行中")
  })

  test("renders 启动中… for starting status", () => {
    const html = renderToStaticMarkup(<ProcessingMessage status="starting" />)
    expect(html).toContain("启动中")
  })

  test("renders 失败 for failed status", () => {
    const html = renderToStaticMarkup(<ProcessingMessage status="failed" />)
    expect(html).toContain("失败")
  })

  test("exposes every official loading variant to the production loader", () => {
    for (const variant of ["Drive", "Dots", "Orbit", "Surfer"] as const) {
      const html = renderToStaticMarkup(<LoadingState variant={variant} />)
      expect(html).toContain(`data-variant="${variant}"`)
    }
  })
})
