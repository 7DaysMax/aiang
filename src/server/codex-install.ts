import { spawnSync } from "node:child_process"
import {
  appendFileSync,
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  openSync,
  readSync,
  closeSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs"
import { homedir } from "node:os"
import path from "node:path"
import type { CodexDetectResult, CodexInstallResult } from "../shared/types"
import { resolveCodexBinary } from "./codex-app-server"
import { resolveDeepSeekApiKey } from "./deepseek-agent"

const CODEX_DOWNLOAD_BASE = "https://github.com/openai/codex/releases/latest/download"

/**
 * 从解压目录里选出真正的 codex CLI 主程序。
 * 0.147.0 起 Windows 压缩包同时包含 command-runner、sandbox-setup 和平台名
 * 主程序等多个 exe；主程序体积远大于辅助 exe，按体积选最稳（readdir 顺序
 * 取第一个会选到 codex-command-runner.exe，导致 --version 退出码 1）。
 */
export function pickCodexExecutable(entries: string[]): string | null {
  const files = entries
    .map((entry) => {
      try {
        const info = statSync(entry)
        return info.isFile() ? { entry, size: info.size } : null
      } catch {
        return null
      }
    })
    .filter((candidate): candidate is { entry: string; size: number } => candidate !== null)
    .sort((a, b) => b.size - a.size)
  return files[0]?.entry ?? null
}

/** 安装过程完整日志（Windows 上排查验证失败/异常退出用）。 */
export function codexInstallLogPath(home: string = homedir()): string {
  return path.join(home, ".aiang", "logs", "codex-install.log")
}

function appendInstallLog(home: string, line: string) {
  try {
    const logPath = codexInstallLogPath(home)
    mkdirSync(path.dirname(logPath), { recursive: true })
    appendFileSync(logPath, `[${new Date().toISOString()}] ${line}\n`)
  } catch {
    // 日志写入失败不影响安装本身。
  }
}

/** Windows PE 可执行文件头检查（MZ），用来识别下载损坏/被杀毒替换的 exe。 */
function isPeExecutable(filePath: string): boolean {
  try {
    const fd = openSync(filePath, "r")
    try {
      const magic = Buffer.alloc(2)
      readSync(fd, magic, 0, 2, 0)
      return magic[0] === 0x4d && magic[1] === 0x5a
    } finally {
      closeSync(fd)
    }
  } catch {
    return false
  }
}

/** codex CLI 官方 release asset 名（GitHub openai/codex）。 */
export function codexPlatformAsset(
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch,
): string | null {
  if (platform === "darwin" && arch === "arm64") return "codex-aarch64-apple-darwin.tar.gz"
  if (platform === "darwin" && arch === "x64") return "codex-x86_64-apple-darwin.tar.gz"
  if (platform === "linux" && arch === "x64") return "codex-x86_64-unknown-linux-musl.tar.gz"
  if (platform === "win32" && arch === "x64") return "codex-x86_64-pc-windows-msvc.exe.zip"
  return null
}

/** Windows 解压 .zip 用 PowerShell Expand-Archive（系统自带）。 */
function extractZip(zipPath: string, destDir: string): { status: number | null; error?: string } {
  const result = spawnSync("powershell", [
    "-NoProfile",
    "-NonInteractive",
    "-Command",
    `Expand-Archive -Path '${zipPath}' -DestinationPath '${destDir}' -Force`,
  ], { encoding: "utf8" })
  return { status: result.status, error: result.stderr?.trim() }
}

/** 探测本机 codex CLI：resolveCodexBinary 找到候选后跑 `codex --version` 验证。 */
export async function detectCodex(home: string = homedir()): Promise<CodexDetectResult> {
  const binary = resolveCodexBinary(home)
  if (binary === "codex") {
    // PATH 解析由 spawn 决定：先验证进程里能否直接 spawn。
    const probe = spawnSync("codex", ["--version"], { encoding: "utf8", timeout: 10_000 })
    if (probe.status !== 0 || !probe.stdout) {
      return { installed: false }
    }
    return { installed: true, version: probe.stdout.trim(), path: "codex" }
  }

  try {
    const probe = spawnSync(binary, ["--version"], { encoding: "utf8", timeout: 10_000 })
    if (probe.status !== 0 || !probe.stdout) {
      return { installed: false, path: binary }
    }
    return { installed: true, version: probe.stdout.trim(), path: binary }
  } catch {
    return { installed: false, path: binary }
  }
}

/** Aiang 安装目录下的 codex 二进制路径。 */
export function aiangCodexBinary(home: string = homedir()): string {
  return path.join(home, ".aiang", "bin", process.platform === "win32" ? "codex.exe" : "codex")
}

/**
 * 把 codex 验证失败的 spawn 结果转成可操作的中文诊断。Windows 上最常见：
 * 1) 缺 Microsoft Visual C++ 运行库（官方 release 是 MSVC 编译的）；
 * 2) Windows Defender/SmartScreen 拦截或隔离了未签名的 exe。
 */
export function describeCodexProbeFailure(
  probe: ReturnType<typeof spawnSync>,
  target: string,
  logPath?: string,
): string {
  const logHint = logPath ? `\n完整安装日志：${logPath}` : ""
  if (!existsSync(target)) {
    return `可执行文件已被移除（很可能被 Windows 安全中心/杀毒软件隔离）。请打开「Windows 安全中心 → 病毒和威胁防护 → 保护历史记录」恢复 codex.exe 后重试。${logHint}`
  }
  const stderr = probe.stderr?.toString().trim()
  const stdout = probe.stdout?.toString().trim()
  if (probe.error) {
    return `启动失败：${probe.error.message}${logHint}`
  }
  if (process.platform === "win32" && !isPeExecutable(target)) {
    return `codex.exe 不是有效的 Windows 程序（文件头损坏，可能是下载不完整或被安全软件替换）。请删除 ~/.aiang/bin/codex.exe 后重新安装。${logHint}`
  }
  if (typeof probe.status === "number" && probe.status !== 0) {
    const code = probe.status >>> 0
    const hex = `0x${code.toString(16).toUpperCase().padStart(8, "0")}`
    if (code === 0xC0000135) {
      return `缺少 Microsoft Visual C++ 运行库（0xC0000135）。请安装「Microsoft Visual C++ 2015-2022 Redistributable (x64)」后重试（微软官网搜索下载，或运行一次 codex.exe 看系统提示）。${logHint}`
    }
    if (code === 0xC0000142 || code === 0xC0000005) {
      return `启动被系统拦截（${hex}），可能是 Windows Defender/SmartScreen 阻止了未签名程序。请到「Windows 安全中心 → 病毒和威胁防护 → 保护历史记录」允许 codex.exe 后重试。${logHint}`
    }
    if (code === 0xC0000139) {
      return `缺少系统入口点（0xC0000139），通常是缺少 VC++ 运行库。请安装「Microsoft Visual C++ 2015-2022 Redistributable (x64)」后重试。${logHint}`
    }
    if (code === 0xC000007B) {
      return `程序映像无效（0xC000007B），通常是 32/64 位不匹配或文件损坏。请删除 ~/.aiang/bin/codex.exe 后重新安装。${logHint}`
    }
    if (code === 0x8007007E) {
      return `找不到依赖模块（0x8007007E），通常是缺少 VC++ 运行库。请安装「Microsoft Visual C++ 2015-2022 Redistributable (x64)」后重试。${logHint}`
    }
    return `codex --version 异常退出（${hex}）${stderr || stdout ? `：${stderr || stdout}` : "，无输出"}。请手动运行 ${target} --version 查看详情。${logHint}`
  }
  return `codex --version 无响应${stderr ? `：${stderr}` : "，无输出"}。请手动运行 ${target} --version 查看详情。${logHint}`
}

const CODEX_CONFIG_TEMPLATE = `# 由 Aiang 自动生成：Codex agent 引擎 → DeepSeek V4 官方 API。
model = "deepseek-v4-flash"
model_provider = "custom"
sandbox_mode = "danger-full-access"

[model_providers.custom]
name = "custom"
wire_api = "responses"
requires_openai_auth = true
base_url = "https://api.deepseek.com/v1"
`

/**
 * 一键安装 Codex 引擎：
 * 1. 下载官方 codex CLI（GitHub releases）到 ~/.aiang/bin/codex
 * 2. 写 ~/.codex/config.toml（custom provider → DeepSeek V4，key 走 auth.json）
 * 3. 写 ~/.codex/auth.json（用设置里的 DeepSeek API Key，已有文件先备份）
 * 4. 验证 codex --version
 */
export async function installCodex(options: {
  onLog?: (line: string) => void
  /** 跳过「已安装」检查，强制重装（测试/修复用）。 */
  force?: boolean
  /** 目标主目录（测试隔离用；默认 os.homedir()）。 */
  homeDir?: string
} = {}): Promise<CodexInstallResult> {
  const log = options.onLog ?? (() => {})
  const home = options.homeDir ?? homedir()
  const logPath = codexInstallLogPath(home)
  const step = (line: string) => {
    log(line)
    appendInstallLog(home, line)
  }

  const already = await detectCodex(home)
  if (already.installed && !options.force) {
    return { ok: true, message: "Codex 已安装，无需重复安装。", version: already.version, path: already.path }
  }

  const asset = codexPlatformAsset()
  if (!asset) {
    return {
      ok: false,
      message: `暂不支持 ${process.platform}/${process.arch} 的自动安装，可手动安装 ChatGPT 桌面版或 codex CLI。`,
    }
  }

  const apiKey = resolveDeepSeekApiKey()
  if (!apiKey) {
    return {
      ok: false,
      message: "请先在「设置 → 模型服务」中填写 DeepSeek API Key，再安装 Codex 引擎。",
    }
  }

  const binDir = path.join(home, ".aiang", "bin")
  const target = aiangCodexBinary(home)
  const tmpRoot = path.join(binDir, `.tmp-${Date.now()}`)
  const archive = path.join(tmpRoot, asset)
  const isWindows = process.platform === "win32"

  try {
    mkdirSync(tmpRoot, { recursive: true })
    step(`开始安装：platform=${process.platform} arch=${process.arch} target=${target} asset=${asset}`)
    step("下载 codex CLI（GitHub 官方 release）…")
    const response = await fetch(`${CODEX_DOWNLOAD_BASE}/${asset}`)
    if (!response.ok) {
      return { ok: false, message: `下载失败：HTTP ${response.status}` }
    }
    const bytes = new Uint8Array(await response.arrayBuffer())
    writeFileSync(archive, bytes)
    step(`下载完成（${(bytes.byteLength / 1024 / 1024).toFixed(1)} MB），解压中…`)

    let extract: { status: number | null; stderr?: string }
    if (isWindows) {
      extract = extractZip(archive, tmpRoot)
    } else {
      extract = spawnSync("tar", ["-xzf", archive, "-C", tmpRoot], { encoding: "utf8" })
    }
    step(`解压结果：status=${extract.status}${extract.stderr?.trim() ? ` stderr=${extract.stderr.trim().slice(0, 300)}` : ""}`)
    if (extract.status !== 0) {
      return { ok: false, message: `解压失败：${extract.stderr?.trim() || (isWindows ? "Expand-Archive 错误" : "tar 错误")}` }
    }

    // release 压缩包内是平台名主程序（可能还附带 command-runner /
    // sandbox-setup 等辅助 exe），排除压缩包自身后按体积选主程序。
    const archivePath = path.join(tmpRoot, asset)
    const candidates = readdirSync(tmpRoot)
      .map((name) => path.join(tmpRoot, name))
      .filter((candidate) => candidate !== archivePath)
    const extracted = pickCodexExecutable(candidates)
    if (!extracted) {
      return { ok: false, message: "解压后未找到 codex 可执行文件。" }
    }

    mkdirSync(binDir, { recursive: true })
    // 辅助 exe（command-runner / sandbox-setup）一并放入 bin 目录：新版主
    // 程序运行时从同目录查找它们。
    for (const candidate of candidates) {
      if (candidate === extracted) continue
      copyFileSync(candidate, path.join(binDir, path.basename(candidate)))
    }
    copyFileSync(extracted, target)
    if (!isWindows) chmodSync(target, 0o755)
    step(`已安装到 ${target}（${(statSync(target).size / 1024 / 1024).toFixed(1)} MB）`)

    step("写入 Codex 配置（DeepSeek V4 官方 API）…")
    const codexHome = path.join(home, ".codex")
    mkdirSync(codexHome, { recursive: true })

    const configPath = path.join(codexHome, "config.toml")
    if (existsSync(configPath)) {
      const backup = `${configPath}.bak-${Date.now()}`
      renameSync(configPath, backup)
      step(`已有配置已备份：${backup}`)
    }
    writeFileSync(configPath, CODEX_CONFIG_TEMPLATE, "utf8")

    const authPath = path.join(codexHome, "auth.json")
    if (existsSync(authPath)) {
      const backup = `${authPath}.bak-${Date.now()}`
      renameSync(authPath, backup)
      step(`已有登录态已备份：${backup}`)
    }
    writeFileSync(authPath, JSON.stringify({ OPENAI_API_KEY: apiKey }, null, 2), "utf8")

    step("验证安装…")
    const probe = spawnSync(target, ["--version"], { encoding: "utf8", timeout: 15_000 })
    appendInstallLog(
      home,
      `验证结果：status=${probe.status}${probe.error ? ` error=${probe.error.message}` : ""} stdout=${(probe.stdout?.toString() ?? "").trim().slice(0, 200)} stderr=${(probe.stderr?.toString() ?? "").trim().slice(0, 300)}`,
    )
    if (probe.status !== 0) {
      return { ok: false, message: `安装完成但验证失败：${describeCodexProbeFailure(probe, target, logPath)}` }
    }
    step(`验证通过：${probe.stdout.trim()}`)
    return {
      ok: true,
      message: "Codex 引擎安装成功",
      version: probe.stdout.trim(),
      path: target,
    }
  } catch (error) {
    appendInstallLog(home, `安装异常：${error instanceof Error ? error.stack ?? error.message : String(error)}`)
    return {
      ok: false,
      message: `${error instanceof Error ? error.message : String(error)}\n完整安装日志：${logPath}`,
    }
  } finally {
    rmSync(tmpRoot, { recursive: true, force: true })
  }
}

/** 读 ~/.codex/auth.json 是否已配置（供 UI 展示登录态）。 */
export function readCodexAuthSummary(home: string = homedir()): { configured: boolean; provider: string } {
  try {
    const raw = readFileSync(path.join(home, ".codex", "auth.json"), "utf8")
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const keys = Object.keys(parsed)
    return { configured: keys.length > 0, provider: keys.includes("OPENAI_API_KEY") ? "API Key" : keys[0] ?? "未知" }
  } catch {
    return { configured: false, provider: "未配置" }
  }
}
