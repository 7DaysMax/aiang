import { describe, expect, test } from "bun:test"
import {
  classifyYoumiExecCommand,
  formatYoumiStartupError,
  mapYoumiThinkingLevel,
  normalizeYoumiModelId,
  normalizeYoumiToolCall,
  resolveYoumiDataRoot,
  resolveYoumiHome,
} from "./youmi-agent"

describe("youmi-agent helpers", () => {
  test("maps DeepSeek efforts onto Penguin thinking levels", () => {
    expect(mapYoumiThinkingLevel("low")).toBe("low")
    expect(mapYoumiThinkingLevel("high")).toBe("high")
    expect(mapYoumiThinkingLevel("max")).toBe("xhigh")
    expect(mapYoumiThinkingLevel(undefined)).toBe("xhigh")
  })

  test("normalizes flash/pro model ids", () => {
    expect(normalizeYoumiModelId("deepseek-v4-flash")).toBe("deepseek-v4-flash")
    expect(normalizeYoumiModelId("deepseek-v4-pro")).toBe("deepseek-v4-pro")
    expect(normalizeYoumiModelId("deepseek-reasoner")).toBe("deepseek-v4-pro")
  })

  test("maps penguin tools into Kanna tool calls", () => {
    const bash = normalizeYoumiToolCall("exec_command", JSON.stringify({ command: "ls" }), "t1")
    expect(bash?.toolName).toBe("Bash")
    expect(bash?.input).toMatchObject({ command: "ls" })

    const globNative = normalizeYoumiToolCall("glob", JSON.stringify({ pattern: "**/*.ts" }), "t-glob-native")
    expect(globNative?.toolName).toBe("Glob")
    expect(globNative?.input).toMatchObject({ pattern: "**/*.ts" })

    const glob = normalizeYoumiToolCall("exec_command", JSON.stringify({ command: "rg --files -g '*.ts'" }), "t-glob")
    expect(glob?.toolName).toBe("Glob")
    expect(glob?.input).toMatchObject({ pattern: "*.ts" })

    const grep = normalizeYoumiToolCall("exec_command", JSON.stringify({ command: "rg -n foo src" }), "t-grep")
    expect(grep?.toolName).toBe("Grep")
    expect(grep?.input).toMatchObject({ pattern: "foo" })

    const findGlob = normalizeYoumiToolCall("exec_command", JSON.stringify({ command: "find . -name '*.tsx'" }), "t-find")
    expect(findGlob?.toolName).toBe("Glob")
    expect(findGlob?.input).toMatchObject({ pattern: "*.tsx" })

    const read = normalizeYoumiToolCall("read_file", JSON.stringify({ path: "a.ts" }), "t2")
    expect(read?.toolName).toBe("Read")
    expect(read?.input).toMatchObject({ filePath: "a.ts" })
  })

  test("classifies glob/grep/bash from exec_command text", () => {
    expect(classifyYoumiExecCommand("rg --files").toolName).toBe("Glob")
    expect(classifyYoumiExecCommand("rg -g '*.ts' TODO").input).toMatchObject({ pattern: "TODO" })
    expect(classifyYoumiExecCommand("git grep -n Agent").input).toMatchObject({ pattern: "Agent" })
    expect(classifyYoumiExecCommand("bun test").toolName).toBe("Bash")
  })

  test("formats startup errors in Chinese when possible", () => {
    expect(formatYoumiStartupError(new Error("missing DEEPSEEK_API_KEY"))).toContain("DeepSeek API Key")
    expect(formatYoumiStartupError(new Error("Cannot find module '@prismshadow/penguin-core'"))).toContain("依赖未安装")
  })

  test("isolates penguin data under ~/.aiang/youmi", () => {
    const prevHome = process.env.YOUMI_HOME
    const prevPenguin = process.env.PENGUIN_HOME
    const prevAiang = process.env.AIANG_CONFIG_DIR
    try {
      delete process.env.YOUMI_HOME
      delete process.env.PENGUIN_HOME
      process.env.AIANG_CONFIG_DIR = "C:/tmp/aiang-test"
      expect(resolveYoumiHome().replaceAll("\\", "/")).toBe("C:/tmp/aiang-test/youmi")
      expect(resolveYoumiDataRoot().replaceAll("\\", "/")).toBe("C:/tmp/aiang-test/youmi/data")
    } finally {
      if (prevHome === undefined) delete process.env.YOUMI_HOME
      else process.env.YOUMI_HOME = prevHome
      if (prevPenguin === undefined) delete process.env.PENGUIN_HOME
      else process.env.PENGUIN_HOME = prevPenguin
      if (prevAiang === undefined) delete process.env.AIANG_CONFIG_DIR
      else process.env.AIANG_CONFIG_DIR = prevAiang
    }
  })
})
