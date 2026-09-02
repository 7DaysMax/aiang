import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { parseResultError, ResultMessage } from "./ResultMessage"
import type { ProcessedResultMessage } from "./types"

function failedResult(result: string): ProcessedResultMessage {
  return {
    type: "result",
    success: false,
    result,
    durationMs: 0,
  } as ProcessedResultMessage
}

describe("ResultMessage errors", () => {
  test("extracts a readable model mismatch from a structured 400 error", () => {
    const raw = JSON.stringify({
      type: "error",
      status: 400,
      error: {
        type: "invalid_request_error",
        message: "The 'deepseek-v4-flash' model is not supported when using Codex with a ChatGPT account.",
      },
    })

    const parsed = parseResultError(raw)
    expect(parsed.title).toBe("请求失败（400）")
    expect(parsed.message).toContain("deepseek-v4-flash")
    expect(parsed.recovery).toContain("模型与执行引擎不匹配")

    const html = renderToStaticMarkup(<ResultMessage message={failedResult(raw)} />)
    expect(html).toContain("请求失败（400）")
    expect(html).toContain("建议：")
    expect(html).not.toContain("invalid_request_error")
  })

  test("keeps plain-text failures readable", () => {
    const parsed = parseResultError("连接中断，请重试。")
    expect(parsed).toEqual({ title: "请求失败", message: "连接中断，请重试。" })
  })
})
