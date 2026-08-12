import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { ThinkingMessage } from "./ThinkingMessage"

describe("ThinkingMessage UI", () => {
  test("shows 思考中… while the thinking entry is still the latest", () => {
    const html = renderToStaticMarkup(
      <ThinkingMessage
        message={{
          id: "th-1",
          kind: "assistant_thinking",
          text: "分析需求…",
          timestamp: new Date(0).toISOString(),
        }}
        isLatest
      />
    )
    expect(html).toContain("思考中")
    expect(html).toContain("分析需求")
  })

  test("shows collapsible 思考过程 after the answer arrives", () => {
    const html = renderToStaticMarkup(
      <ThinkingMessage
        message={{
          id: "th-2",
          kind: "assistant_thinking",
          text: "完整推理",
          timestamp: new Date(0).toISOString(),
        }}
        isLatest={false}
      />
    )
    expect(html).toContain("思考过程")
    expect(html).not.toContain("正在生成")
  })
})
