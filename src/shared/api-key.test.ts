import { describe, expect, test } from "bun:test"
import { isPlausibleApiKey } from "./api-key"

describe("isPlausibleApiKey", () => {
  test("accepts a normal DeepSeek-style key", () => {
    expect(isPlausibleApiKey("sk-test-placeholder-do-not-use")).toBe(true)
  })

  test("rejects obviously pasted error text", () => {
    expect(isPlausibleApiKey("# 无法读取文件 读取失败:405 Method Not Allowed")).toBe(false)
  })

  test("rejects a bare hash or whitespace", () => {
    expect(isPlausibleApiKey("#")).toBe(false)
    expect(isPlausibleApiKey("   ")).toBe(false)
  })

  test("rejects keys containing quotes or Chinese", () => {
    expect(isPlausibleApiKey('sk-abc"def')).toBe(false)
    expect(isPlausibleApiKey("sk-中文")).toBe(false)
  })

  test("rejects overly short strings", () => {
    expect(isPlausibleApiKey("sk-123")).toBe(false)
  })
})
