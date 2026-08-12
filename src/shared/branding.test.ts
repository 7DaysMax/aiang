import { describe, expect, test } from "bun:test"
import {
  getDataDir,
  getDataDirDisplay,
  getDataRootName,
  getKeybindingsFilePath,
  getKeybindingsFilePathDisplay,
  getRuntimeProfile,
} from "./branding"

describe("runtime profile helpers", () => {
  test("defaults to the prod profile when unset", () => {
    expect(getRuntimeProfile({})).toBe("prod")
    expect(getDataRootName({})).toBe(".aiang")
    expect(getDataDir("/tmp/home", {})).toBe("/tmp/home/.aiang/data")
    expect(getDataDirDisplay({})).toBe("~/.aiang/data")
    expect(getKeybindingsFilePath("/tmp/home", {})).toBe("/tmp/home/.aiang/keybindings.json")
    expect(getKeybindingsFilePathDisplay({})).toBe("~/.aiang/keybindings.json")
  })

  test("switches to dev paths for the dev profile", () => {
    const env = { AIANG_RUNTIME_PROFILE: "dev" }

    expect(getRuntimeProfile(env)).toBe("dev")
    expect(getDataRootName(env)).toBe(".aiang-dev")
    expect(getDataDir("/tmp/home", env)).toBe("/tmp/home/.aiang-dev/data")
    expect(getDataDirDisplay(env)).toBe("~/.aiang-dev/data")
    expect(getKeybindingsFilePath("/tmp/home", env)).toBe("/tmp/home/.aiang-dev/keybindings.json")
    expect(getKeybindingsFilePathDisplay(env)).toBe("~/.aiang-dev/keybindings.json")
  })
})
