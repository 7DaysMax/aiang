# 自行构建 Youmi

每位使用者从源码构建自己的版本，并在自己的电脑上配置模型服务。仓库不分发维护者的 API Key、登录令牌、模型档案或聊天记录；构建前端与安装包不需要模型 API Key。

## 准备环境

- Git 与 Git LFS。
- Bun ≥ 1.3.5，并确保 `bun` 在终端的 PATH 中。
- 使用 Electron 或打包 Windows 时，安装 Node.js；Windows 打包还需要 PowerShell。
- 各引擎的 CLI、系统和处理器架构兼容性仍需分别满足。Git LFS 下载成功不等于每个二进制都能在所有平台执行。

建议使用一个全新的源码目录：

```bash
git lfs install
git clone https://github.com/7DaysMax/aiang.git
cd aiang
git lfs pull
bun install --frozen-lockfile
```

不要复制其他人的 `.aiang`、`.aiang-dev`、`.codex/auth.json`、Claude 登录文件或整个用户目录。不要用源码 ZIP 代替需要 Git LFS 的完整克隆。

## 浏览器版

开发运行：

```bash
bun run dev
```

打开 [本地开发界面](http://localhost:5174)。生产前端构建与本地服务器运行：

```bash
bun run build
bun run start
```

首次使用时，在「设置 → 模型服务」填写自己的 API Key，或登录自己要使用的 Codex、Claude、Cursor 账号。没有模型凭据时可以构建界面，但不能凭空调用付费模型。

## Electron 桌面版

```bash
bun run build
bun run dev:desktop
```

桌面壳会启动本机后端，默认使用 `127.0.0.1:3210`。它加载已经构建的前端，不直接使用 Vite 开发页面。Bun 未被桌面进程找到时，可设置 `BUN_BIN` 为本机 Bun 可执行文件的绝对路径。

## Windows 安装器和便携版

仓库的 **Actions → Build Windows Desktop → Run workflow** 可以在干净的 Windows 构建机上生成安装器和便携版，无需上传 API Key 或账号配置。任务通过类型检查、测试、打包后端启动检查后，才上传包含两个 `.exe` 和 SHA-256 校验值的下载包；Actions 产物保留 14 天，下载需要登录 GitHub。此工作流不会发布 npm 包或创建正式 Release。

在 Windows x64 构建环境中，从上面的全新克隆执行：

```powershell
bun run pack:exe
```

输出位于 `release/electron/`：

- `Youmi-Aiagent-<version>-setup.exe`：NSIS 安装器。
- `Youmi-Aiagent-<version>-portable.exe`：便携版。

脚本会重建 `release/staging` 和 `release/electron`，先另存需要保留的旧产物。如果源码旁边存在 `../site/public`，现有脚本还会把安装器复制为其中的 `Youmi-Setup.exe`；使用独立目录构建可避免覆盖已有站点下载文件。

安装包从源码、前端构建产物和 `vendor` 引擎文件组装，不需要复制维护者的用户数据目录。不要向这些打包输入目录添加个人配置或密钥，也不要在构建代码中硬编码账号信息。

## 自己配置凭据

优先使用应用设置。需要环境变量时，可参考根目录的 `.env.example`，在本机自行创建 `.env` 并填写自己的值；示例中的 Key 均为空，不要把真实值填回 `.env.example`。

- `DEEPSEEK_API_KEY`：兼容的旧版 DeepSeek 配置入口。
- `OPENROUTER_API_KEY`：Pi 的 Model Registry 连接兜底。
- 完整的活动模型档案可能优先于环境变量；具体引擎配置见 [README](../README.md)。

常规运行的数据在 `~/.aiang`，开发模式的应用设置和对话数据在 `~/.aiang-dev`。这些目录可能包含明文凭据，不要提交或分享。也不要将真实密钥放入 `VITE_*` 变量：这类变量可能进入浏览器端构建产物。

## 提交与分享前检查

`.gitignore` 已排除 `.env`、构建输出和常见本地账号配置，但忽略规则不能识别源代码、测试或截图中的密钥，也不会清理已经存在的 Git 历史。

```bash
git status --short
git diff --cached --stat
```

逐个暂存需要分享的文件；在自己的电脑上审阅完整暂存差异，不要把可能含密钥的差异直接发给别人。测试只能使用明显的虚构值，运行真实服务时才从本机配置加载凭据。

如果你保留了历史清理前的克隆，不要直接把旧分支合并或推送回来。先备份尚未提交的非敏感工作，再重新克隆，并只迁移经过检查的改动。

发现凭据泄露时，先在对应服务商后台撤销或轮换，再处理历史。重写 Git 历史不能收回他人的旧克隆或保证立即清除 GitHub 缓存；处理原则见 [GitHub 敏感数据清理说明](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository)。
