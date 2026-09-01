<p align="center">
  <img src="assets/icon.png" alt="Aiang" width="80" />
</p>

<h1 align="center">Aiang</h1>

<p align="center">
  <strong>DeepSeek 原生驱动的桌面级 Coding Agent UI（Kanna 1:1 界面）</strong>
</p>

<br />

Aiang 是 Kanna 的中文化移植版：界面与 Kanna 原版保持一致，但 AI 能力
全部由 **DeepSeek API** 驱动。除 ccb / Reasonix / Codex 外，另提供
**Youmi** 引擎：基于开源 [PenguinHarness](https://github.com/Prism-Shadow/penguin-harness)
（`@prismshadow/penguin-core`）的编程向 Agent，默认思考档位 `max`，并支持
编程评测驱动的自我迭代。

## 功能

- **Youmi（PenguinHarness · 编程）** — 主打写代码 / 修 bug / 多步工具调用，默认 max 思考
- **DeepSeek / Reasonix / Codex / Claude / Cursor** — 多引擎可选（Cursor 走本机 `cursor-agent`，即原 Kanna 控制 Cursor 的能力）
- **原生 API Key 配置** — 设置页直接填写，或使用环境变量 `DEEPSEEK_API_KEY`
- **全中文界面** — 侧边栏、输入框、设置、对话记录均中文化
- **项目优先的侧边栏** — 按项目分组对话，实时状态指示（空闲/运行中/等待/失败）
- **丰富的 transcript 渲染** — 工具调用、折叠的工具组、完整结果展示
- **本地持久化历史** — JSONL 事件日志 + 压缩快照，刷新不丢上下文

## 快速开始

```bash
bun install
bun run dev
```

浏览器打开 <http://localhost:5174>，在「设置 → 模型服务」里填入你的
DeepSeek API Key（或先设置环境变量）：

```bash
export DEEPSEEK_API_KEY=sk-...
bun run dev
```

## Youmi 引擎

- SDK：`@prismshadow/penguin-core` + `@prismshadow/penguin-skills`
- 数据目录：`~/.aiang/youmi`（不污染 `~/.penguin`）
- 模型：始终 DeepSeek V4 Flash / Pro（复用设置里的 DeepSeek Key），默认思考 `max`
- 对标对象：Claude Code **Agent 引擎**（vendored ccb）同样跑 DeepSeek——比的是 Agent 能力，不是 Anthropic 模型
- 编程评测：`bun run scripts/youmi-bench/run.ts`（Youmi/Penguin+DP vs ccb/Claude-agent+DP）
- 自我迭代：`bun run scripts/youmi-evolve.ts`（门禁：Youmi 能力通过率 ≥ ccb 基线）
- 无能力对标数据前，不宣称「更聪明 / 已超过 Claude」

## Cursor 引擎

原 Kanna 的 Cursor 控制能力：对话走本机 [`cursor-agent`](https://cursor.com/docs/cli/installation)（不是「用外部编辑器打开」）。

1. 在「设置 → 模型服务 → Cursor 引擎」安装 CLI 并登录 Cursor 账号
2. 聊天底部栏切换到 **Cursor**，即可用账号内模型（默认 Composer 2.5，支持 Fast）

安装命令：

- Windows：`irm 'https://cursor.com/install?win32=true' | iex`（设置页一键安装会跑这条）
- macOS / Linux：`curl https://cursor.com/install -fsS | bash`

也可设置环境变量 `CURSOR_API_KEY` 代替 `cursor-agent login`。

## 引擎说明

- 逆向版 Claude Code CLI 二进制位于 `vendor/ccb/ccb-bin`（约 90MB，来自
  claude-code-best 仓库，编译自 patched 源码）。
- 服务器通过 `@anthropic-ai/claude-agent-sdk` 驱动该二进制，并注入：
  - `CLAUDE_CODE_USE_OPENAI=1`
  - `OPENAI_BASE_URL=https://api.deepseek.com`（可用 `AIANG_BASE_URL` 覆盖）
  - `OPENAI_MODEL=deepseek-chat`（可用 `AIANG_MODEL` 覆盖）
  - `OPENAI_API_KEY=<设置的 Key>`
  - `CLAUDE_CONFIG_DIR=~/.aiang/claude-config`（隔离的会话/配置目录）
- 替换引擎：设置 `CLAUDE_EXECUTABLE=/path/to/claude` 可覆盖内置二进制。

## 命令

- `bun run dev` — 同时启动客户端（Vite）+ 服务器
- `bun test` — 单元/集成测试（Bun test）
- `bun run check` — 类型检查 + 生产构建
- `bun run build` — 客户端 + export-viewer 打包
- `bun run pack:exe` — Windows Electron 无边框包：NSIS 安装器 + 便携版（`Youmi-Aiagent-*-setup.exe`）
- `bun run dev:desktop` — 本地用 Electron 壳调试（需先起后端或让壳自启 bun server）
- `bun run youmi:bench` — Youmi 编程评测
- `bun run youmi:evolve` — Youmi 自我迭代一轮

## 架构速览

```
React 客户端 (src/client)
  socket.ts ── 单条 WebSocket ──► WSRouter (src/server/ws-router.ts)
                                    ├─ 命令分发（shared/protocol.ts）
                                    ├─ 快照推送（sidebar/chat/app-settings/...）
                                    ├─ AgentCoordinator (agent.ts)
                                    │    ├─ Youmi ──► penguin-core ──► DeepSeek API
                                    │    └─ SDK 通道 ──► vendor/ccb/ccb-bin ──► DeepSeek API
                                    └─ EventStore (event-store.ts): JSONL 日志 + 快照
```

## 注意

- 内置引擎来自逆向工程，仅供学习与研究使用；生产使用请遵守相关许可。
- `vendor/ccb/ccb-bin` 体积较大（约 90MB），如需精简可从仓库中移除并改用
  `CLAUDE_EXECUTABLE` 指向自己的构建。
- 无 Claude 对标 bench 数据前，不要宣称 Youmi「已超过 Claude / 更聪明」。首期门禁是打平 Claude。
