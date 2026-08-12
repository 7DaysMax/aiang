/**
 * API Key 的"看起来像 key"校验：只用来挡住明显粘贴错误（比如把错误提示、
 * 空白文本或短字符串存进了 key 字段），不校验 key 的真实性。
 * 真正的 key 不应包含空白、中文、引号，且有一定长度。
 */
export function isPlausibleApiKey(apiKey: string): boolean {
  const trimmed = apiKey.trim()
  if (trimmed.length < 8) return false
  return !/[\s\u4e00-\u9fff"']/.test(trimmed)
}
