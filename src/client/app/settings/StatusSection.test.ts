import { describe, expect, test } from "bun:test"
import { incidentTypePresentation } from "./StatusSection"

describe("service status incident presentation", () => {
  test("已解决事件显示为历史记录，不冒充当前故障", () => {
    expect(incidentTypePresentation("incident", false)).toEqual({
      label: "历史故障",
      tone: "muted",
    })
    expect(incidentTypePresentation("incident", true)).toEqual({
      label: "当前故障",
      tone: "danger",
    })
  })

  test("维护记录也区分进行中与历史状态", () => {
    expect(incidentTypePresentation("maintenance", false).label).toBe("维护记录")
    expect(incidentTypePresentation("maintenance", true).label).toBe("维护中")
  })
})
