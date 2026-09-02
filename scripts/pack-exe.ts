#!/usr/bin/env bun
/**
 * Build Windows Electron packages (frameless desktop shell):
 *   release/electron/Youmi-Aiagent-<version>-setup.exe
 *   release/electron/Youmi-Aiagent-<version>-portable.exe
 *
 * Usage:
 *   bun run pack:exe
 */
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { $ } from "bun"

const ROOT = join(import.meta.dir, "..")
const STAGING = join(ROOT, "release", "staging")
const ELECTRON_OUT = join(ROOT, "release", "electron")
const SERVER_EXE = join(STAGING, "aiang-server.exe")

function copyDir(src: string, dest: string) {
  mkdirSync(dest, { recursive: true })
  cpSync(src, dest, { recursive: true, force: true })
}

async function main() {
  if (process.platform !== "win32") {
    throw new Error("Windows packages must be built on Windows. Use the Build Windows Desktop GitHub Actions workflow.")
  }
  const nodeBin = Bun.which("node")
  if (!nodeBin) {
    throw new Error("Node.js is required for electron-builder. Install Node.js and add node to PATH.")
  }

  console.log("→ build client + export-viewer")
  await $`bun run build`.cwd(ROOT)

  if (!existsSync(join(ROOT, "dist", "client", "index.html"))) {
    throw new Error("dist/client/index.html missing after build")
  }

  console.log(`→ clean staging ${STAGING}`)
  rmSync(STAGING, { recursive: true, force: true })
  mkdirSync(STAGING, { recursive: true })

  const pkg = await Bun.file(join(ROOT, "package.json")).json() as { version?: string }
  const version = pkg.version ?? "0.0.0"
  const winVersion = `${version}.0`

  console.log("→ bun --compile → aiang-server.exe")
  const compile = Bun.spawn([
    process.execPath,
    "build",
    join(ROOT, "src/server/cli.ts"),
    "--compile",
    "--outfile",
    SERVER_EXE,
    "--windows-title",
    "Youmi Aiagent Server",
    "--windows-publisher",
    "Youmi",
    "--windows-description",
    "Youmi Aiagent backend server",
    "--windows-version",
    winVersion,
    "--windows-hide-console",
  ], {
    cwd: ROOT,
    stdout: "inherit",
    stderr: "inherit",
  })
  if ((await compile.exited) !== 0) {
    throw new Error("bun build --compile failed")
  }

  console.log("→ stage dist + vendor for electron extraResources")
  copyDir(join(ROOT, "dist", "client"), join(STAGING, "dist", "client"))
  if (existsSync(join(ROOT, "dist", "export-viewer"))) {
    copyDir(join(ROOT, "dist", "export-viewer"), join(STAGING, "dist", "export-viewer"))
  }
  copyDir(join(ROOT, "vendor"), join(STAGING, "vendor"))
  cpSync(join(ROOT, "package.json"), join(STAGING, "package.json"))

  writeFileSync(
    join(STAGING, "README.txt"),
    [
      "Youmi Aiagent desktop (Electron, frameless)",
      "",
      "Installer: Youmi-Aiagent-*-setup.exe",
      "Portable:  Youmi-Aiagent-*-portable.exe",
      "Data/config: %USERPROFILE%\\.aiang",
      "",
    ].join("\r\n"),
    "utf8",
  )

  console.log("→ electron-builder --win nsis+portable")
  mkdirSync(ELECTRON_OUT, { recursive: true })
  try {
    rmSync(ELECTRON_OUT, { recursive: true, force: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (/EBUSY|EPERM|locked/i.test(message)) {
      throw new Error(
        `release/electron is locked (close Youmi Aiagent / Youmi-Aiagent-*-portable.exe first). ${message}`,
      )
    }
    throw error
  }
  mkdirSync(ELECTRON_OUT, { recursive: true })

  const electronBuilderCli = join(ROOT, "node_modules", "electron-builder", "cli.js")
  if (!existsSync(electronBuilderCli)) {
    throw new Error("electron-builder not installed (node_modules/electron-builder/cli.js missing)")
  }
  // electron-builder expects Node (not Bun) on Windows.
  const builder = Bun.spawn([
    nodeBin,
    electronBuilderCli,
    "--win",
    "--x64",
    "--publish",
    "never",
    "--config.directories.output=release/electron",
  ], {
    cwd: ROOT,
    stdout: "inherit",
    stderr: "inherit",
    env: {
      ...process.env,
      CSC_IDENTITY_AUTO_DISCOVERY: "false",
    },
  })
  if ((await builder.exited) !== 0) {
    throw new Error("electron-builder failed")
  }

  const artifacts = [
    `Youmi-Aiagent-${version}-setup.exe`,
    `Youmi-Aiagent-${version}-portable.exe`,
  ]
  for (const name of artifacts) {
    const artifactPath = join(ELECTRON_OUT, name)
    if (!existsSync(artifactPath)) {
      const listing = await $`powershell -NoProfile -Command Get-ChildItem -Name ${ELECTRON_OUT}`.text()
      console.log("electron output:\n" + listing)
      throw new Error(`artifact missing: ${artifactPath}`)
    }
    const sizeMb = (Bun.file(artifactPath).size / 1024 / 1024).toFixed(1)
    console.log(`OK  ${artifactPath}  (${sizeMb} MB)`)
  }

  const setupSrc = join(ELECTRON_OUT, `Youmi-Aiagent-${version}-setup.exe`)
  const sitePublic = join(ROOT, "..", "site", "public")
  const siteDownload = join(sitePublic, "Youmi-Setup.exe")
  if (existsSync(sitePublic)) {
    cpSync(setupSrc, siteDownload)
    const sizeMb = (Bun.file(siteDownload).size / 1024 / 1024).toFixed(1)
    console.log(`OK  ${siteDownload}  (${sizeMb} MB)`)
  }
  console.log("OK  NSIS installer + portable (Electron frameless + aiang-server.exe)")
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
