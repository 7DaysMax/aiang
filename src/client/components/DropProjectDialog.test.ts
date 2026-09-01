import { describe, expect, test } from "bun:test"
import { autoFillFromNameLookup, extractDroppedFolder, isNameOnlyPath, isWindowsNameOnlyPath, normalizeDroppedPath, parseFileUri } from "./DropProjectDialog"

function fakeDataTransfer(options: {
  directoryFullPath?: string | null
  nativePath?: string | null
  hasFile?: boolean
  uriList?: string
  plain?: string
} = {}) {
  const entries: Array<{
    kind: string
    getAsFile: () => { path: string } | null
    webkitGetAsEntry: () => { isDirectory: boolean; fullPath: string } | null
  }> = []
  if (options.directoryFullPath !== undefined && options.directoryFullPath !== null) {
    entries.push({
      kind: "file",
      getAsFile: () => (options.nativePath ? { path: options.nativePath } : null),
      webkitGetAsEntry: () => ({ isDirectory: true, fullPath: options.directoryFullPath! }),
    })
  }
  if (options.hasFile) {
    entries.push({
      kind: "file",
      getAsFile: () => null,
      webkitGetAsEntry: () => ({ isDirectory: false, fullPath: "/Users/me/Desktop/notes.txt" }),
    })
  }
  return {
    types: entries.length > 0 ? ["Files"] : [],
    items: entries,
    getData: (type: string) => {
      if (type === "text/uri-list") return options.uriList ?? ""
      if (type === "text/plain") return options.plain ?? ""
      return ""
    },
  } as unknown as DataTransfer
}

describe("normalizeDroppedPath", () => {
  test("keeps macOS absolute paths as-is", () => {
    expect(normalizeDroppedPath("/Users/me/Desktop/MyProject")).toBe("/Users/me/Desktop/MyProject")
  })

  test("strips the leading slash from Windows drive paths", () => {
    expect(normalizeDroppedPath("/C:/Users/me/Desktop/MyProject")).toBe("C:/Users/me/Desktop/MyProject")
    expect(normalizeDroppedPath("C:\\Users\\me\\Desktop\\MyProject")).toBe("C:\\Users\\me\\Desktop\\MyProject")
  })

  test("returns empty for blank input", () => {
    expect(normalizeDroppedPath("")).toBe("")
    expect(normalizeDroppedPath("   ")).toBe("")
  })
})

describe("parseFileUri", () => {
  test("parses file:// URLs on macOS", () => {
    expect(parseFileUri("file:///Users/me/Desktop/MyProject")).toBe("/Users/me/Desktop/MyProject")
  })

  test("parses file:// URLs on Windows", () => {
    expect(parseFileUri("file:///C:/Users/me/Desktop/MyProject")).toBe("C:/Users/me/Desktop/MyProject")
  })

  test("rejects non-file URLs", () => {
    expect(parseFileUri("https://example.com/x")).toBeNull()
  })
})

describe("isNameOnlyPath", () => {
  test("flags Windows drive + single-segment paths", () => {
    expect(isNameOnlyPath("C:\\测试")).toBe(true)
    expect(isNameOnlyPath("C:/测试")).toBe(true)
  })

  test("flags single-segment slash paths", () => {
    expect(isNameOnlyPath("/测试")).toBe(true)
  })

  test("accepts real absolute paths", () => {
    expect(isNameOnlyPath("C:\\Users\\me\\Desktop\\测试")).toBe(false)
    expect(isNameOnlyPath("/Users/me/Desktop/MyProject")).toBe(false)
  })
})

describe("isWindowsNameOnlyPath", () => {
  test("flags drive + single segment but not slash-only names", () => {
    expect(isWindowsNameOnlyPath("C:\\测试")).toBe(true)
    expect(isWindowsNameOnlyPath("C:/测试")).toBe(true)
    expect(isWindowsNameOnlyPath("/测试")).toBe(false)
    expect(isWindowsNameOnlyPath("C:\\Users\\me\\Desktop\\测试")).toBe(false)
  })
})

describe("extractDroppedFolder", () => {
  test("prefers the Electron File.path over webkitGetAsEntry().fullPath", () => {
    // Codex 桌面内置浏览器（Electron 内核）给 File 挂 path 属性，这才是真实
    // 绝对路径；fullPath 可能是错误的（例如只剩文件夹名）。
    const result = extractDroppedFolder({
      dataTransfer: fakeDataTransfer({
        directoryFullPath: "C:\\测试",
        nativePath: "C:\\Users\\me\\Desktop\\测试",
      }),
    } as unknown as DragEvent)
    expect(result.path).toBe("C:\\Users\\me\\Desktop\\测试")
    expect(result.guessed).toBe(false)
  })

  test("falls back to webkitGetAsEntry().fullPath when File.path is absent", () => {
    const result = extractDroppedFolder({
      dataTransfer: fakeDataTransfer({ directoryFullPath: "/Users/me/Desktop/MyProject" }),
    } as unknown as DragEvent)
    expect(result.path).toBe("/Users/me/Desktop/MyProject")
    expect(result.guessed).toBe(true)
  })

  test("treats a name-only File.path as unusable and returns a name hint", () => {
    // Windows 内核拖入时 File.path / fullPath 都只给了「盘符 + 文件夹名」，
    // 这正是用户遇到的 C:\测试：不能直接当路径用，要按名查找完整路径。
    const result = extractDroppedFolder({
      dataTransfer: fakeDataTransfer({
        directoryFullPath: "C:\\测试",
        nativePath: "C:\\测试",
      }),
    } as unknown as DragEvent)
    expect(result.path).toBeNull()
    expect(result.nameHint).toBe("测试")
    expect(result.openManual).toBe(true)
    expect(result.notice).toContain("按名称查找")
  })

  test("falls back to fullPath when it is complete even if File.path is name-only", () => {
    const result = extractDroppedFolder({
      dataTransfer: fakeDataTransfer({
        directoryFullPath: "C:\\Users\\me\\Desktop\\测试",
        nativePath: "C:\\测试",
      }),
    } as unknown as DragEvent)
    expect(result.path).toBe("C:\\Users\\me\\Desktop\\测试")
    expect(result.guessed).toBe(true)
  })

  test("falls back to text/uri-list when the entry path is unavailable", () => {
    const result = extractDroppedFolder({
      dataTransfer: fakeDataTransfer({ hasFile: true, uriList: "file:///Users/me/Desktop/MyProject\r\n" }),
    } as unknown as DragEvent)
    expect(result.path).toBe("/Users/me/Desktop/MyProject")
    expect(result.notice).toBeNull()
  })

  test("falls back to text/plain absolute paths", () => {
    const result = extractDroppedFolder({
      dataTransfer: fakeDataTransfer({ hasFile: true, plain: "/Users/me/Desktop/MyProject" }),
    } as unknown as DragEvent)
    expect(result.path).toBe("/Users/me/Desktop/MyProject")
  })

  test("warns for a dropped file instead of a folder", () => {
    const result = extractDroppedFolder({
      dataTransfer: fakeDataTransfer({ hasFile: true }),
    } as unknown as DragEvent)
    expect(result.path).toBeNull()
    expect(result.notice).toContain("文件")
    expect(result.openManual).toBe(false)
  })

  test("opens manual entry when a directory is dropped but its path is unreadable", () => {
    const result = extractDroppedFolder({
      dataTransfer: fakeDataTransfer({ directoryFullPath: "" }),
    } as unknown as DragEvent)
    expect(result.path).toBeNull()
    expect(result.openManual).toBe(true)
    expect(result.notice).toContain("手动填写")
  })
})

describe("autoFillFromNameLookup", () => {
  test("fills the first match and keeps the rest as alternatives", () => {
    expect(autoFillFromNameLookup([])).toEqual({ path: null, alternatives: [] })
    expect(autoFillFromNameLookup(["C:\\Users\\me\\Desktop\\Dumper-7-main"])).toEqual({
      path: "C:\\Users\\me\\Desktop\\Dumper-7-main",
      alternatives: [],
    })
    expect(autoFillFromNameLookup([
      "C:\\Users\\me\\Desktop\\Dumper-7-main",
      "C:\\Users\\me\\Downloads\\Dumper-7-main",
    ])).toEqual({
      path: "C:\\Users\\me\\Desktop\\Dumper-7-main",
      alternatives: ["C:\\Users\\me\\Downloads\\Dumper-7-main"],
    })
  })
})
