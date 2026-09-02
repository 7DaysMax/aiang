export const COMPOSER_INSERT_EVENT = "kanna:composer-insert"

export type ComposerInsertDetail = {
  text: string
  replace?: boolean
  submit?: boolean
}

export function insertComposerText(text: string, options?: { replace?: boolean; submit?: boolean }) {
  if (typeof window === "undefined") return
  window.dispatchEvent(new CustomEvent<ComposerInsertDetail>(COMPOSER_INSERT_EVENT, {
    detail: { text, replace: options?.replace, submit: options?.submit },
  }))
}

export function extractAnswerSources(text: string): Array<{ name: string; href: string }> {
  const sources: Array<{ name: string; href: string }> = []
  const seen = new Set<string>()
  const pattern = /\[([^\]]+)\]\((https?:[^)\s]+)\)/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(text)) !== null) {
    const href = match[2]!
    if (seen.has(href)) continue
    seen.add(href)
    try {
      const host = new URL(href).hostname.replace(/^www\./, "")
      sources.push({ name: match[1]!.trim() || host, href })
    } catch {
      sources.push({ name: match[1]!.trim(), href })
    }
    if (sources.length >= 6) break
  }
  return sources
}
