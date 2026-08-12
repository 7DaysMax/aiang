import { describe, expect, test } from "bun:test"
import { getSetupLaunchAction } from "./providerAuthStore"

const FLAGS = {
  setupLoaded: true,
  setupShown: false,
  setupCompleted: false,
  setupDismissed: false,
}

describe("getSetupLaunchAction", () => {
  test("waits for the machine's settings before deciding anything", () => {
    // A fresh browser starts with every flag false; acting on that would
    // re-run onboarding per browser instead of per machine.
    const unloaded = { ...FLAGS, setupLoaded: false }
    expect(getSetupLaunchAction(false, unloaded)).toBe("wait")
    expect(getSetupLaunchAction(true, unloaded)).toBe("wait")
  })

  test("a machine that finished setup never re-onboards a new browser", () => {
    const completed = { ...FLAGS, setupShown: true, setupCompleted: true }
    expect(getSetupLaunchAction(false, completed)).toBe("none")
    expect(getSetupLaunchAction(true, completed)).toBe("none")
  })

  test("first-ever launch opens instantly, even before settings arrive", () => {
    expect(getSetupLaunchAction(false, FLAGS)).toBe("open")
    expect(getSetupLaunchAction(true, FLAGS)).toBe("open")
  })

  test("completed or dismissed setups never auto-launch", () => {
    expect(getSetupLaunchAction(false, { ...FLAGS, setupCompleted: true })).toBe("none")
    expect(getSetupLaunchAction(false, { ...FLAGS, setupDismissed: true })).toBe("none")
  })

  test("after a first showing, the wizard re-opens only while the key is missing", () => {
    const shown = { ...FLAGS, setupShown: true }
    expect(getSetupLaunchAction(false, shown)).toBe("open")
    expect(getSetupLaunchAction(true, shown)).toBe("none")
  })
})
