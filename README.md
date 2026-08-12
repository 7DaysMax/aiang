<p align="center">
  <img src="assets/icon.png" alt="Aiang" width="80" />
</p>

<h1 align="center">Aiang</h1>

<p align="center">
  <strong>DeepSeek 原生驱动的桌面级 Coding Agent UI（Kanna 1:1 界面）</strong>
</p>

<br />

Aiang 是 Kanna 的中文化移植版：界面与 Kanna 原版保持一致，但 AI 能力
全部由 **DeepSeek API** 驱动。底层推理引擎直接使用逆向版 Claude Code CLI
（来自 GitHub 上的 claude-code-best 仓库，`vendor/ccb/ccb-bin`），以
OpenAI 兼容模式把所有请求转发到 DeepSeek——因此 Kanna 的 transcript
渲染、工具调用、权限交互等能力原样保留，模型推理则是纯 DeepSeek。

## 功能

- **只支持 DeepSeek** — 唯一的模型服务商，支持 `deepseek-chat` / `deepseek-reasoner`
- **原生 API Key 配置** — 设置页直接填写，或使用环境变量 `DEEPSEEK_API_KEY`
- **逆向版 Claude Code CLI 引擎** — 工具调用、plan 模式、会话恢复全部可用
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

## 架构速览

```
React 客户端 (src/client)
  socket.ts ── 单条 WebSocket ──► WSRouter (src/server/ws-router.ts)
                                    ├─ 命令分发（shared/protocol.ts）
                                    ├─ 快照推送（sidebar/chat/app-settings/...）
                                    ├─ AgentCoordinator (agent.ts)
                                    │    └─ SDK 通道 ──► vendor/ccb/ccb-bin ──► DeepSeek API
                                    └─ EventStore (event-store.ts): JSONL 日志 + 快照
```

## 注意

- 内置引擎来自逆向工程，仅供学习与研究使用；生产使用请遵守相关许可。
- `vendor/ccb/ccb-bin` 体积较大（约 90MB），如需精简可从仓库中移除并改用
  `CLAUDE_EXECUTABLE` 指向自己的构建。
