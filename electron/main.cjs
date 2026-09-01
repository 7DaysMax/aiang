const { app, BrowserWindow, ipcMain, shell } = require("electron")
const { spawn } = require("node:child_process")
const path = require("node:path")
const http = require("node:http")
const { existsSync } = require("node:fs")

/** @type {import('electron').BrowserWindow | null} */
let mainWindow = null
/** @type {import('node:child_process').ChildProcess | null} */
let serverProcess = null
let shuttingDown = false

const DEFAULT_PORT = Number(process.env.AIANG_DESKTOP_PORT || 3210)
const LISTEN_HOST = "127.0.0.1"

function projectRoot() {
  return path.join(__dirname, "..")
}

function resourcesRoot() {
  return app.isPackaged ? process.resourcesPath : projectRoot()
}

function resolveServerCommand() {
  if (app.isPackaged) {
    return {
      command: path.join(process.resourcesPath, "aiang-server.exe"),
      args: ["--no-open", "--host", LISTEN_HOST, "--port", String(DEFAULT_PORT)],
      cwd: process.resourcesPath,
      env: {
        ...process.env,
        AIANG_ROOT: process.resourcesPath,
      },
    }
  }

  const bun = process.env.BUN_BIN || "bun"
  return {
    command: bun,
    args: [
      "run",
      path.join(projectRoot(), "src/server/cli.ts"),
      "--no-open",
      "--host",
      LISTEN_HOST,
      "--port",
      String(DEFAULT_PORT),
    ],
    cwd: projectRoot(),
    env: {
      ...process.env,
      AIANG_ROOT: projectRoot(),
    },
  }
}

function waitForServer(url, timeoutMs = 60_000) {
  const started = Date.now()
  return new Promise((resolve, reject) => {
    const tick = () => {
      const req = http.get(url, (res) => {
        res.resume()
        resolve(url)
      })
      req.on("error", () => {
        if (Date.now() - started > timeoutMs) {
          reject(new Error(`Timed out waiting for Youmi Aiagent server at ${url}`))
          return
        }
        setTimeout(tick, 250)
      })
    }
    tick()
  })
}

function startBackend() {
  if (serverProcess) return Promise.resolve(`http://${LISTEN_HOST}:${DEFAULT_PORT}`)

  const spec = resolveServerCommand()
  serverProcess = spawn(spec.command, spec.args, {
    cwd: spec.cwd,
    env: spec.env,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  })

  serverProcess.stdout?.on("data", (chunk) => {
    process.stdout.write(chunk)
  })
  serverProcess.stderr?.on("data", (chunk) => {
    process.stderr.write(chunk)
  })
  serverProcess.on("exit", (code, signal) => {
    serverProcess = null
    if (!shuttingDown && mainWindow && !mainWindow.isDestroyed()) {
      console.error(`[aiang-desktop] server exited code=${code} signal=${signal}`)
    }
  })

  return waitForServer(`http://${LISTEN_HOST}:${DEFAULT_PORT}`)
}

function stopBackend() {
  if (!serverProcess) return
  const child = serverProcess
  serverProcess = null
  try {
    child.kill()
  } catch {
    // ignore
  }
}

function createWindow(launchUrl) {
  const iconPng = path.join(projectRoot(), "assets", "icon-256.png")
  const iconIco = path.join(projectRoot(), "assets", "icon.ico")
  const iconPath = existsSync(iconIco) ? iconIco : (existsSync(iconPng) ? iconPng : undefined)

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 960,
    minHeight: 640,
    title: "Youmi Aiagent",
    backgroundColor: "#0b0d10",
    icon: iconPath,
    frame: false,
    transparent: false,
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  mainWindow.setMenuBarVisibility(false)
  mainWindow.once("ready-to-show", () => mainWindow?.show())
  mainWindow.on("closed", () => {
    mainWindow = null
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: "deny" }
  })

  void mainWindow.loadURL(launchUrl)
}

function registerIpc() {
  ipcMain.handle("desktop:window", async (_event, action) => {
    const win = BrowserWindow.getFocusedWindow() || mainWindow
    if (!win || win.isDestroyed()) return { ok: false }
    if (action === "minimize") win.minimize()
    else if (action === "maximize") {
      if (win.isMaximized()) win.unmaximize()
      else win.maximize()
    } else if (action === "close") win.close()
    return { ok: true, maximized: win.isMaximized() }
  })

  ipcMain.handle("desktop:isMaximized", async () => {
    const win = BrowserWindow.getFocusedWindow() || mainWindow
    return Boolean(win && !win.isDestroyed() && win.isMaximized())
  })
}

app.whenReady().then(async () => {
  registerIpc()
  try {
    const launchUrl = await startBackend()
    createWindow(launchUrl)
  } catch (error) {
    console.error(error)
    app.quit()
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void startBackend().then((url) => createWindow(url))
    }
  })
})

app.on("before-quit", () => {
  shuttingDown = true
  stopBackend()
})

app.on("window-all-closed", () => {
  shuttingDown = true
  stopBackend()
  if (process.platform !== "darwin") app.quit()
})
