import { afterEach, describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { isNoiseTreePath, MAX_PROJECT_FILE_BYTES, type ProjectTreeSnapshot } from "./project-files"
import { startKannaServer } from "./server"

const tempDirs: string[] = []

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

async function startIsolatedServer(options: { port: number }) {
  const dataDir = await mkdtemp(path.join(tmpdir(), "kanna-project-files-data-"))
  tempDirs.push(dataDir)
  return startKannaServer({ dataDir, port: options.port, strictPort: true })
}

function contentUrl(port: number, projectId: string, filePath: string) {
  return `http://localhost:${port}/api/projects/${projectId}/files/${encodeURIComponent(filePath)}/content`
}

describe("project file content", () => {
  test("serves a small file whole and does not flag it as truncated", async () => {
    const projectDir = await mkdtemp(path.join(tmpdir(), "kanna-files-small-"))
    tempDirs.push(projectDir)
    await writeFile(path.join(projectDir, "app.ts"), "export const value = 1\n", "utf8")

    const server = await startIsolatedServer({ port: 4321 })
    try {
      const project = await server.store.openProject(projectDir, "Project")
      const response = await fetch(contentUrl(server.port, project.id, "app.ts"))

      expect(response.status).toBe(200)
      expect(response.headers.get("x-aiang-truncated")).toBeNull()
      expect(response.headers.get("x-aiang-file-size")).toBe("23")
      expect(await response.text()).toBe("export const value = 1\n")
    } finally {
      await server.stop()
    }
  })

  test("caps an oversized file and reports the real size", async () => {
    const projectDir = await mkdtemp(path.join(tmpdir(), "kanna-files-huge-"))
    tempDirs.push(projectDir)
    // 12MB：远超上限，而且尾部有标记，用来确认返回的确实是被切过的前半段。
    const size = 12 * 1024 * 1024
    const huge = Buffer.alloc(size, 0x61)
    huge.write("TAIL-MARKER", size - "TAIL-MARKER".length)
    await writeFile(path.join(projectDir, "huge.log"), huge)

    const server = await startIsolatedServer({ port: 4322 })
    try {
      const project = await server.store.openProject(projectDir, "Project")
      const response = await fetch(contentUrl(server.port, project.id, "huge.log"))

      expect(response.status).toBe(200)
      expect(response.headers.get("x-aiang-truncated")).toBe("1")
      expect(response.headers.get("x-aiang-file-size")).toBe(String(size))

      // 整份文件曾经原样流给浏览器，编辑器再把它当文本渲染，页面直接卡死。
      const body = await response.text()
      expect(body.length).toBe(MAX_PROJECT_FILE_BYTES)
      expect(body).not.toContain("TAIL-MARKER")
    } finally {
      await server.stop()
    }
  })

  test("hides generated directories from the tree", async () => {
    const projectDir = await mkdtemp(path.join(tmpdir(), "kanna-files-tree-"))
    tempDirs.push(projectDir)
    await writeFile(path.join(projectDir, "app.ts"), "x\n", "utf8")
    for (const noise of ["node_modules", "target", "__pycache__", ".venv"]) {
      await mkdir(path.join(projectDir, noise), { recursive: true })
    }
    await mkdir(path.join(projectDir, "src"), { recursive: true })

    const server = await startIsolatedServer({ port: 4323 })
    try {
      const project = await server.store.openProject(projectDir, "Project")
      const response = await fetch(`http://localhost:${server.port}/api/projects/${project.id}/tree`)
      const snapshot = (await response.json()) as ProjectTreeSnapshot
      const names = snapshot.entries.map((entry) => entry.name)

      expect(names).toContain("src")
      expect(names).toContain("app.ts")
      expect(names).not.toContain("node_modules")
      expect(names).not.toContain("target")
      expect(names).not.toContain("__pycache__")
      expect(names).not.toContain(".venv")
    } finally {
      await server.stop()
    }
  })
})

describe("isNoiseTreePath", () => {
  test("matches a noise name in any segment, not just the first", () => {
    expect(isNoiseTreePath("target/debug/app")).toBe(true)
    expect(isNoiseTreePath("crates/parser/target/debug/app")).toBe(true)
    expect(isNoiseTreePath("api/__pycache__/views.cpython-312.pyc")).toBe(true)
    expect(isNoiseTreePath("src/app.ts")).toBe(false)
    // 只认完整的一段，不做子串匹配。
    expect(isNoiseTreePath("src/targeting.ts")).toBe(false)
    expect(isNoiseTreePath("my-node_modules-notes.md")).toBe(false)
  })
})
