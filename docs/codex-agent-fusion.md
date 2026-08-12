# Codex agent 能力融合路线(ccb / Claude 通道)

目标:把 openai/codex 的 agent 工程能力融合进 aiang 的 Claude 通道(ccb),不换引擎。
模型仍是 DeepSeek;引擎仍是 claude-code-best(ccb);补上 Codex 的能力模块。

## Codex 能力模块 × aiang 现状(2026-08 盘点,基于 openai/codex@main)

| Codex 模块 | 内容 | aiang/ccb 现状 | 差距 |
|---|---|---|---|
| `core-skills` + `skills` | SKILL.md 加载/注入/config_rules | 已有简化版(设置页安装 + 同步 ccb + `/` 菜单) | 中:无 config_rules、无注入管理 |
| `core-plugins` | plugin.json manifest、marketplace add/remove/upgrade、npm source、remote、startup_sync、MCP routing | **无** | 大:全新模块 |
| `memories` | 两阶段记忆(rollout 提取 → 全局合并 → 注入) | 无(ccb 自带 /memory 未接) | 大:先做简化版 |
| `hooks` | 生命周期钩子(HooksFile) | 无 | 中 |
| `mcp-server`/`rmcp-client` | MCP 服务器/客户端 | ccb(Claude Agent SDK)自带 | 低:验证即可 |
| `thread-store`/`message-history` | 线程持久化/消息历史 | EventStore JSONL + 会话恢复 | 低 |
| `context-fragments` | 上下文片段(注入) | ccb 内置 | 低 |
| `apply-patch`/`exec`/`file-search` | 文件补丁/命令执行/搜索 | ccb 自带工具 | 低 |
| `sandboxing` | 沙箱(linux/windows) | 无(ccb 直跑) | 中:可选 |
| slash 命令 | `/` 菜单 | ccb 内置 + 内置命令列表 | 低 |

## 融合顺序(按用户价值/依赖排)

1. **插件 marketplace**(新):plugin.json 规范 + 从 GitHub marketplace 安装/卸载 + 插件内
   skills 自动同步进 ccb。和现有技能面板一体,用户可见。
2. **记忆简化版**(新):回合结束自动摘要 → `~/.aiang/memories/` 记忆文件 → 下个回合注入。
   两阶段先做单阶段(每回合摘要合并),稳定后再升级。
3. **hooks**(新):turn 开始/结束、工具调用前后,执行用户配置的脚本/命令。
4. **MCP 验证 + 配置 UI**:ccb 支持 MCP,补设置页配置入口。

## 插件 manifest 规范(对齐 Codex `plugin.json`)

```jsonc
{
  "name": "my-plugin",
  "version": "1.0.0",
  "description": "...",
  "keywords": ["codex", "skills"],
  "skills": ["./skills"],          // 插件内置技能目录(SKILL.md)
  "mcpServers": { "name": { "command": "...", "args": [], "env": {} } },
  "commands": ["./commands"],       // 斜杠命令 md
  "hooks": { "preTurn": "...", "postToolUse": "..." },
  "interface": { "displayName": "...", "category": "...", "capabilities": [] }
}
```

安装位置:`~/.aiang/plugins/<name>/`(对应 ccb 的 CLAUDE_CONFIG_DIR 同级)。
插件 skills 同步到 `~/.aiang/claude-config/skills/<name>__<skill>/`(前缀命名空间防冲突)。
