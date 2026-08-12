/**
 * DeepSeek V4 系列实际上下文窗口为 1M tokens。ccb / Codex 通道内置的模型
 * 元数据仍按 200k / 258.4k 上报，服务端与客户端在组装上下文快照时统一
 * 覆盖为这个值（DeepSeek 是 Aiang 唯一支持的模型供应商）。
 */
export const DEEPSEEK_CONTEXT_WINDOW_TOKENS = 1_000_000
