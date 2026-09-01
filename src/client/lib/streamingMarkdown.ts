/**
 * Streaming-safe markdown helpers.
 *
 * An unclosed ``` fence eats the rest of a live answer; we close it virtually
 * so the committed prefix still parses, and mark the open body so the Code Block
 * can keep a caret on the last line.
 */

export interface OpenFence {
  marker: string
  info: string
  code: string
}

export interface PreparedStreamingMarkdown {
  source: string
  streamingFence: boolean
  openCode: string | null
  openInfo: string | null
}

const OPEN_FENCE = /^( {0,3})(`{3,}|~{3,})(.*)$/

export function findUnclosedFence(text: string): OpenFence | null {
  const lines = text.split(/\r?\n/)
  let open: { marker: string; info: string; startLine: number } | null = null

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]!
    const match = OPEN_FENCE.exec(line)
    if (!match) continue

    const marker = match[2]!
    const info = match[3] ?? ""
    if (!open) {
      if (marker.startsWith("`") && info.includes("`")) continue
      open = { marker, info: info.trim(), startLine: index }
      continue
    }

    if (
      marker[0] === open.marker[0]
      && marker.length >= open.marker.length
      && info.trim() === ""
    ) {
      open = null
    }
  }

  if (!open) return null
  return {
    marker: open.marker,
    info: open.info,
    code: lines.slice(open.startLine + 1).join("\n"),
  }
}

export function prepareStreamingMarkdown(text: string, streaming: boolean): PreparedStreamingMarkdown {
  if (!streaming) {
    return { source: text, streamingFence: false, openCode: null, openInfo: null }
  }

  const open = findUnclosedFence(text)
  if (!open) {
    return { source: text, streamingFence: false, openCode: null, openInfo: null }
  }

  const needsNewline = !text.endsWith("\n")
  return {
    source: `${text}${needsNewline ? "\n" : ""}${open.marker}`,
    streamingFence: true,
    openCode: open.code,
    openInfo: open.info || null,
  }
}

export function sameStreamingCode(left: string, right: string): boolean {
  return left.replace(/\s+$/, "") === right.replace(/\s+$/, "")
}

export interface ParsedFenceInfo {
  language: string
  languageName: string
  filename?: string
}

const LANGUAGE_NAMES: Record<string, string> = {
  ts: "TypeScript",
  typescript: "TypeScript",
  js: "JavaScript",
  javascript: "JavaScript",
  tsx: "TSX",
  jsx: "JSX",
  py: "Python",
  python: "Python",
  rs: "Rust",
  rust: "Rust",
  go: "Go",
  json: "JSON",
  jsonc: "JSONC",
  bash: "Bash",
  sh: "Shell",
  shell: "Shell",
  zsh: "Zsh",
  css: "CSS",
  scss: "SCSS",
  html: "HTML",
  md: "Markdown",
  markdown: "Markdown",
  yaml: "YAML",
  yml: "YAML",
  toml: "TOML",
  sql: "SQL",
  c: "C",
  cpp: "C++",
  java: "Java",
  ruby: "Ruby",
  rb: "Ruby",
  php: "PHP",
  swift: "Swift",
  kotlin: "Kotlin",
  kt: "Kotlin",
  dart: "Dart",
  lua: "Lua",
  diff: "Diff",
  xml: "XML",
  vue: "Vue",
  svelte: "Svelte",
  text: "Plain text",
  txt: "Plain text",
}

export function languageDisplayName(id: string): string {
  if (!id) return "Code"
  return LANGUAGE_NAMES[id.toLowerCase()] ?? id
}

export function parseFenceInfo(info: string | undefined | null): ParsedFenceInfo {
  const trimmed = (info ?? "").trim().replace(/^language-/, "")
  if (!trimmed) return { language: "", languageName: "Code" }

  const first = trimmed.split(/[\s:]+/)[0] ?? ""
  const rest = trimmed.slice(first.length).replace(/^[\s:=]+/, "").replace(/^["']|["']$/g, "")
  const looksLikePath = first.includes("/") || /\.[A-Za-z0-9]+$/.test(first)

  if (looksLikePath && !rest) {
    const filename = first.split("/").pop()
    const extension = filename?.includes(".") ? filename.split(".").pop() ?? "" : ""
    const language = extension.toLowerCase()
    return {
      language,
      languageName: languageDisplayName(language),
      filename,
    }
  }

  return {
    language: first,
    languageName: languageDisplayName(first),
    filename: rest || undefined,
  }
}
