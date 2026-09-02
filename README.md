<p align="center">
  <img src="assets/icon.png" alt="Youmi Aiagent" width="80" />
</p>

<h1 align="center">Youmi Aiagent</h1>

<p align="center">
  <strong>用户自选引擎的编程 Agent 工作台</strong>
</p>

Youmi 基于 Kanna 工作台演进，将 Youmi、Codex、Claude、Cursor、DeepSeek、Reasonix 和 Pi 接入同一套项目、对话、工具与代码审阅界面。支持浏览器运行和 Electron 桌面壳，界面采用 Beautiful UI 组件体系，保留主要操作的中文提示。

产品名称为 **Youmi Aiagent**；仓库、包名和 CLI 命令继续使用 `aiang`。不同引擎有各自的执行方式与账号配置，并非全部通过 DeepSeek API 运行。

## 当前功能

- **多引擎与模型选择**：在输入框底部切换引擎、模型及其支持的思考档位，设置各引擎默认值。
- **跨引擎协作验收**：用户分别选择主控、实现、验收引擎；支持点击协作链路切换角色对应的引擎。
- **真实流式输出**：增量展示回答、思考、工具调用与执行结果；工具组和活动详情可折叠查看。
- **一体化项目工作区**：项目与会话侧边栏、文件和 Diff、Git、终端、浏览器，以及技能、插件和审批入口。
- **界面样式设置**：浅色/深色主题、窄屏布局，以及加载、思考、任务、输入框和代码展示样式的预览与保存。
- **用量与服务状态**：分别查看账号额度、DeepSeek 余额、官方服务事件和本地引擎状态，支持手动刷新。
- **本地对话记录**：通过 JSONL 事件记录与快照保存历史，跨引擎切换时交接对话上下文。

组件接入与已有验收记录见 [Beautiful UI 适配清单](docs/beautifului-adaptation.md)，产品定位见 [PRODUCT.md](PRODUCT.md)。

## 快速开始

仓库不提供个人 API Key 或登录凭据。构建无需模型密钥，运行时由每位使用者配置自己的账号；独立构建、Windows 打包与安全注意事项见 [自行构建指南](docs/self-build.md)。

### 1. 安装并运行源码

需要 Git、Git LFS 和 **Bun ≥ 1.3.5**，并确保命令可从终端调用。仓库中的引擎二进制由 Git LFS 管理；使用源码 ZIP 或只下载 LFS 指针文件，不能替代完整的引擎文件。

```bash
git lfs install
git clone https://github.com/7DaysMax/aiang.git
cd aiang
git lfs pull
bun install
bun run dev
```

打开 [本地开发界面](http://localhost:5174)。开发脚本同时启动 Vite 客户端（`5174`）和后端（`5175`），客户端支持热更新。请在可信的本机或开发网络使用，不要直接暴露开发端口到公网。

端口被占用时，可用 `bun run dev --port 5184`；后端会使用相邻的 `5185` 端口。

### 2. 配置要使用的引擎

以 DeepSeek 为例：

1. 打开「设置 → 模型服务」，添加并启用 DeepSeek 模型档案。
2. 填写 API Key、Base URL（`https://api.deepseek.com`）和默认模型 ID，例如 `deepseek-v4-flash`，保存配置。
3. 在聊天底部选择 DeepSeek（ccb）或 Youmi 引擎，再选择模型并发送任务。

也兼容 `DEEPSEEK_API_KEY` 环境变量；完整的活动模型档案优先于旧版 Key 配置。不要把真实密钥写进仓库或提交记录。

使用 Codex、Cursor、Claude 或 Pi 时，请按下表配置对应账号或连接。仅填写 DeepSeek Key 并不会自动登录这些服务。

## 引擎与连接方式

“引擎”负责工具执行、会话和任务编排；“模型”负责推理与生成。切换模型不等于切换引擎。

| 引擎 | 执行方式 | 配置与模型来源 |
| --- | --- | --- |
| Youmi | `@prismshadow/penguin-core` 与 Penguin 技能系统 | 使用活动模型档案或兼容的旧版 DeepSeek Key；内置选择为 DeepSeek Flash / Pro，默认思考档位 `max` |
| DeepSeek（ccb） | 通过 Claude Agent SDK 驱动 `vendor/ccb` 中的适配引擎 | 使用 OpenAI 兼容模型档案或旧版 DeepSeek Key；支持应用内置的 DeepSeek 模型项 |
| Reasonix | 通过 ACP 驱动 `vendor/reasonix` 中的 Go 引擎 | 当前适配固定使用 DeepSeek 官方端点和 Flash / Pro，不是任意中转端点的通用适配器 |
| Codex | 本机官方 Codex CLI 的 `app-server` | 使用 Codex 自身的登录与配置；模型和可用思考档位以运行时返回为准，冷启动时使用内置兜底列表 |
| Claude | Claude Agent SDK；具体执行路径取决于活动档案和所选模型 | 原生路径使用 Claude 的认证或 Anthropic 档案；OpenAI 兼容档案或 DeepSeek 模型会走 ccb 适配路径 |
| Cursor | 本机 `cursor-agent` | 使用 Cursor 登录或 `CURSOR_API_KEY`；模型列表由 CLI 提供，当前不参与自动协作验收 |
| Pi | 进程内 `@mariozechner/pi-coding-agent` | 使用「设置 → 模型服务 → 快速回复模型」保存的 Model Registry 连接（OpenRouter、OpenAI 或自定义兼容端点），也支持 `OPENROUTER_API_KEY` 兜底 |

Codex 和 Cursor 需要先安装相应 CLI 并完成登录。原生 Codex 请求不会用 DeepSeek 档案覆盖其模型或账号配置；跨引擎协作也不代表不同厂商之间共享订阅额度。

### DeepSeek 模型选择

当前 DeepSeek（ccb）内置列表包含：

| 界面名称 | 请求模型 ID |
| --- | --- |
| DeepSeek Flash | `deepseek-v4-flash` |
| DeepSeek Pro | `deepseek-v4-pro` |
| DeepSeek Flash Vision (Exp) | `deepseek-v4-flash-vision-exp` |

- 这是应用维护的内置目录，**不是自动同步的 DeepSeek 全量模型列表**；连接测试拉取到的模型数量，不等于已经加入下拉框的数量。实际可用性仍取决于端点和账号。
- DeepSeek 档案下，在聊天中明确选择的 DeepSeek 模型优先于档案默认模型。自定义或中转档案仍使用该档案保存的模型 ID，避免把不同服务的模型名称直接混用。
- 旧 ID `deepseek-chat`、`deepseek-reasoner` 分别兼容映射到 Flash、Pro；Youmi 和 Reasonix 的内置选择当前仍为 Flash / Pro。
- Vision 模型项处于实验状态。选中它不等于开启原生图片消息传输；当前识图工具链需要在设置中配置独立的 Qwen / GLM 识图服务。

## 协作模式：用户决定谁实现、谁验收

例如，希望“Codex 主控，让 DeepSeek 写，再由 Codex 验收”：

1. 在聊天底部选择 Codex，并配置其模型。
2. 点击底部 **`+` → 协作模式** 开启协作，再打开菜单设置角色。
3. 设置「主控引擎：Codex」「实现引擎：DeepSeek」「验收引擎：与主控相同」。也可以为验收单独选择第三个引擎。
4. 输入框上方会显示协作链路；点击其中的「主控」「实现」「验收」可直接切换对应引擎。
5. 发送任务后，实现引擎先执行；完成后自动交接给验收引擎，对照任务给出验收结果。未通过时可点击「按意见再改」继续处理。

未单独指定实现或验收引擎时，默认与主控相同。这里是**实现后验收的串行流程**，不是三个引擎同时运行，也不是主控每次先执行一轮规划。Cursor 暂不支持此协作流程。

切换引擎会建立相应的新原生会话并交接已有对话记录，不是让两个引擎共用同一个原生会话。验收结论来自模型，应结合实际 Diff、测试输出和人工检查判断，不替代测试或发布审批。

## 用量、余额与服务状态

### 设置 → 用量

- **Codex**：按接口返回展示多个额度桶及时间窗口，区分已用比例、剩余比例和重置时间；返回模型相关额度时一并展示。
- **Claude**：展示当前认证方式能够获取的用量窗口；未登录或不支持读取时显示相应说明。
- **DeepSeek**：展示币种、总余额、赠送余额与充值余额。金额不是剩余 Token 数，也不是 Codex 的订阅额度。
- 页面打开时刷新，可见期间每分钟检查更新；可点击卡片的更新时间手动刷新。刷新失败、未配置、不支持读取和额度为零是不同状态。

没有可读额度接口的引擎不会凭空生成额度。对话中的 Token 统计与账号余额是不同口径，不能互相替代。

### 设置 → 服务状态

展示 Claude、Codex、Cursor、DeepSeek 的官方服务状态及详情入口，同时保留本地引擎的安装、配置等信息。数据来源分别为 `status.claude.com`、`status.openai.com`、`status.cursor.com` 和 `status.deepseek.com`。

状态详情区分正在发生的故障与已结束的历史事件，并按相关服务筛选事件。**官方状态正常不代表本机登录、代理、网络或 API Key 一定正常**；看到异常时，应先确认是当前服务故障、历史事件还是本地连接问题。

## 桌面运行与构建

源码启动 Electron 前先构建前端：

```bash
bun run build
bun run dev:desktop
```

桌面壳默认自行启动本地 Bun 后端（`127.0.0.1:3210`），加载构建后的前端，不直接连接 Vite 热更新页面。可通过 `AIANG_DESKTOP_PORT` 调整桌面后端端口，通过 `BUN_BIN` 指定 Bun 路径。

| 命令 | 用途 |
| --- | --- |
| `bun run dev` | 同时启动开发客户端和后端 |
| `bun run build` | 构建客户端与导出查看器 |
| `bun run start` | 启动应用服务器；浏览器使用前先完成构建 |
| `bun run dev:desktop` | 启动源码 Electron 桌面壳；先运行构建 |
| `bun run check` | TypeScript 类型检查与两项生产构建，不包含测试 |
| `bun test` | 运行测试；部分集成测试依赖本机环境或服务配置 |
| `bun run pack:exe` | 打包 Windows x64 的 NSIS 安装器与便携版 |
| `bun run youmi:bench` | 运行 Youmi 编程评测 |
| `bun run youmi:evolve` | 运行 Youmi 评测驱动的迭代流程 |

Windows 打包应在具备 Bun、Node.js 和相应构建依赖的 Windows 环境执行。产物位于 `release/electron/`，名称为 `Youmi-Aiagent-<version>-setup.exe` 和 `Youmi-Aiagent-<version>-portable.exe`；脚本会重建暂存与输出目录，请先另存需要保留的产物。

评测和迭代可能调用真实模型、产生费用或修改评测工作区，运行前请检查对应脚本和配置。存在评测脚本不代表已有超越其他引擎的性能结论。

## 数据与配置

- 常规运行的应用设置和对话数据位于 `~/.aiang`；`bun run dev` 使用 `~/.aiang-dev`。切换启动方式后看不到原设置时，先确认使用的是哪个目录。
- 设置位于对应根目录的 `data/settings.json`，对话事件位于 `data/transcripts/`；Model Registry 连接保存于 `llm-provider.json`。
- Youmi 和 Reasonix 的引擎数据默认分别位于 `~/.aiang/youmi`、`~/.aiang/reasonix`，有各自的目录覆盖选项，并不自动随开发模式切换。
- API Key 等配置可能以明文保存在本机配置文件中，请保护目录权限，不要上传配置、对话记录或包含密钥的日志。
- 本地保存历史不等于离线推理：请求、任务所需代码和上下文仍会发送给所选模型服务；启用识图后，相关图片也可能发送给识图服务。

## 常见问题

**模型请求返回 400**

先核对当前引擎、实际模型 ID、活动档案的协议与 Base URL 是否匹配。Codex 应选其运行时支持的模型；自定义中转应填写端点实际接受的模型 ID。ccb 路径还支持 `AIANG_MODEL` 显式覆盖，旧环境变量可能覆盖界面选择。连接测试成功也不保证所有模型和参数都被端点支持。

**额度没有显示，或数字看起来不对**

检查当前登录账号和认证方式，确认显示的是“已用”还是“剩余”，再查看更新时间并手动刷新。DeepSeek 余额与 Codex 额度来自不同服务；未知值不能当作零。服务状态页也不能替代账号用量查询。

**找不到引擎，或二进制无法执行**

先执行 `git lfs pull`，确认下载的不是文本指针文件，并检查二进制是否匹配本机系统和架构。Codex、Cursor 需要各自的 CLI；ccb 可通过 `CLAUDE_EXECUTABLE`，Reasonix 可通过 `REASONIX_EXECUTABLE` 指向兼容的自备可执行文件。

## 项目结构与许可

| 路径 | 职责 |
| --- | --- |
| `src/client` | 工作台页面、会话渲染、设置与交互 |
| `src/components/primitives`、`src/components/atoms` | Beautiful UI 组件实现 |
| `src/server` | WebSocket 路由、Agent 编排、引擎适配、用量与状态获取 |
| `src/shared` | 协议、类型、模型目录、协作规则与品牌配置 |
| `electron` | 桌面窗口与本地后端启动 |
| `vendor` | 随仓库分发的引擎文件（Git LFS） |
| `scripts` | 开发、构建、打包与 Youmi 评测工具 |

仓库许可条款见 [LICENSE](LICENSE)。上游引擎、SDK 与界面组件各有其许可和使用条款；随仓库分发不代表对这些依赖重新授权。请同时查看相应上游声明，包括 [界面组件许可](src/client/components/bui/LICENSE)。
