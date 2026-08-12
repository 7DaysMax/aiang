import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  extractFlightStream,
  fetchDeepSeekStatus,
  parseDeepSeekStatusHtml,
} from "./deepseek-status"

const FIXTURE = readFileSync(join(import.meta.dir, "__fixtures__", "deepseek-status.html"), "utf8")

describe("extractFlightStream", () => {
  test("还原 flight 流（19 个数据块拼接）", () => {
    const stream = extractFlightStream(FIXTURE)
    expect(stream.length).toBeGreaterThan(70_000)
    expect(stream).toContain('"initialPageConfig"')
    expect(stream).toContain('"initialCalendarData"')
    expect(stream).toContain('"initialDataUpdatedAt"')
  })
})

describe("parseDeepSeekStatusHtml", () => {
  test("解析出页面、组件、可用率与事件", () => {
    const snapshot = parseDeepSeekStatusHtml(FIXTURE, 1_786_070_000_000)
    expect(snapshot.ok).toBe(true)
    expect(snapshot.page.name).toBe("DeepSeek")
    expect(snapshot.page.customDomain).toBe("status.deepseek.com")

    // 当前快照没有进行中的事件 → 全部系统运行正常。
    expect(snapshot.overallStatus).toBe("operational")
    expect(snapshot.activeChanges).toBe(0)

    // 隐藏组件（hide_all）被过滤，只留公开组件。
    expect(snapshot.components.length).toBeGreaterThanOrEqual(7)
    const proApi = snapshot.components.find((component) => component.name.includes("V4 Pro"))
    expect(proApi).toBeDefined()
    expect(proApi!.uptime).toBe(99.9)
    expect(proApi!.status).toBe("operational")

    // 分组可用率。
    const section = snapshot.sections.find((item) => item.name.includes("对话服务"))
    expect(section).toBeDefined()
    expect(section!.uptime).toBe(99.79)

    // 事件时间线：至少包含 13 条 incident / maintenance 记录。
    expect(snapshot.incidents.length).toBeGreaterThanOrEqual(13)
    const incident = snapshot.incidents[0]
    expect(incident.changeId).toBeGreaterThan(0)
    expect(incident.type).toMatch(/^(incident|maintenance)$/)
    expect(incident.title.length).toBeGreaterThan(0)
    expect(incident.updates.length).toBeGreaterThan(0)
    expect(incident.affectedComponents.length).toBeGreaterThan(0)

    // 事件按开始时间倒序排列。
    for (let i = 1; i < snapshot.incidents.length; i++) {
      expect(snapshot.incidents[i - 1].startAtSeconds).toBeGreaterThanOrEqual(
        snapshot.incidents[i].startAtSeconds,
      )
    }

    // 日历月份。
    expect(snapshot.month).toEqual({ year: 2026, month: 8 })
  })

  test("损坏的 HTML 返回 ok=false", () => {
    const snapshot = parseDeepSeekStatusHtml("<html>nothing here</html>", 1_000)
    expect(snapshot.ok).toBe(false)
    expect(snapshot.components).toEqual([])
    expect(snapshot.incidents).toEqual([])
  })
})

describe("fetchDeepSeekStatus", () => {
  test("网络失败时返回 ok=false 而非抛错", async () => {
    const snapshot = await fetchDeepSeekStatus()
    // 网络环境不确定：只要不抛异常、结构完整即可。
    expect(snapshot).toHaveProperty("ok")
    expect(Array.isArray(snapshot.components)).toBe(true)
    expect(Array.isArray(snapshot.incidents)).toBe(true)
  })
})
