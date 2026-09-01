import { useCallback, useState, type ReactNode } from "react"
import { languageDisplayName, parseFenceInfo } from "../../lib/streamingMarkdown"
import { cn } from "../../lib/utils"

type TokKind = "kw" | "str" | "num" | "fn" | "dim" | "cmt"

type Tok = { t: string; c?: TokKind }

const COLORS: Record<TokKind, string> = {
  kw: "var(--accent-ink)",
  str: "var(--green)",
  num: "var(--orange)",
  fn: "var(--ink)",
  dim: "var(--ink-3)",
  cmt: "var(--ink-3)",
}

const KEYWORDS = new Set([
  "export", "import", "from", "async", "await", "function", "const", "let", "var",
  "return", "if", "else", "for", "while", "class", "type", "interface", "new",
  "this", "true", "false", "null", "undefined", "try", "catch", "throw", "of",
  "in", "def", "fn", "pub", "use", "mod", "struct", "impl", "match", "case",
  "break", "continue", "switch", "default", "void", "public", "private",
  "protected", "static", "extends", "implements", "package", "yield", "with",
  "as", "pass", "None", "True", "False", "self", "lambda", "typeof", "instanceof",
])

function tokenizeLine(line: string): Tok[] {
  const tokens: Tok[] = []
  let index = 0
  const push = (t: string, c?: TokKind) => {
    if (!t) return
    tokens.push(c ? { t, c } : { t })
  }

  while (index < line.length) {
    if (line.startsWith("//", index) || (line[index] === "#" && (index === 0 || /\s/.test(line[index - 1]!)))) {
      push(line.slice(index), "cmt")
      break
    }
    if (line.startsWith("/*", index)) {
      const end = line.indexOf("*/", index + 2)
      if (end === -1) {
        push(line.slice(index), "cmt")
        break
      }
      push(line.slice(index, end + 2), "cmt")
      index = end + 2
      continue
    }

    const ch = line[index]!
    if (ch === '"' || ch === "'" || ch === "`") {
      let cursor = index + 1
      while (cursor < line.length) {
        if (line[cursor] === "\\") {
          cursor += 2
          continue
        }
        if (line[cursor] === ch) {
          cursor++
          break
        }
        cursor++
      }
      push(line.slice(index, cursor), "str")
      index = cursor
      continue
    }

    if (/[0-9]/.test(ch) && (index === 0 || /[^\w]/.test(line[index - 1]!))) {
      let cursor = index + 1
      while (cursor < line.length && /[0-9_xXa-fA-F.]/.test(line[cursor]!)) cursor++
      push(line.slice(index, cursor), "num")
      index = cursor
      continue
    }

    if (/[A-Za-z_$]/.test(ch)) {
      let cursor = index + 1
      while (cursor < line.length && /[\w$]/.test(line[cursor]!)) cursor++
      const word = line.slice(index, cursor)
      const spaces = line.slice(cursor).match(/^\s*/)?.[0].length ?? 0
      const after = line[cursor + spaces]
      if (KEYWORDS.has(word)) push(word, "kw")
      else if (after === "(") push(word, "fn")
      else push(word)
      index = cursor
      continue
    }

    if ("{}()[];,.".includes(ch)) {
      push(ch, "dim")
      index++
      continue
    }

    push(ch)
    index++
  }

  return tokens
}

function CodeIcon() {
  return (
    <svg aria-hidden width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-ink-3">
      <path d="M17.25 6.75 22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3-4.5 16.5" />
    </svg>
  )
}

export function CodeBlock({
  code,
  filename,
  language,
  languageName,
  streaming = false,
  showLineNumbers = true,
  className,
}: {
  code: string
  filename?: string
  language?: string
  languageName?: string
  streaming?: boolean
  showLineNumbers?: boolean
  className?: string
}) {
  const [copied, setCopied] = useState(false)
  const fence = parseFenceInfo(language)
  const displayName = languageName ?? (filename ? fence.languageName : languageDisplayName(language ?? fence.language))
  const title = filename ?? (displayName === "Code" ? undefined : displayName)
  const lines = code.length === 0 ? [""] : code.replace(/\n$/, "").split("\n")

  const copy = useCallback(() => {
    void navigator.clipboard.writeText(code).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }, [code])

  return (
    <div data-bui-code-block className={cn("w-full overflow-hidden rounded-card bg-surface shadow-card", className)}>
      <div className="primitive-card-bar flex items-center justify-between border-b border-line">
        <span className="flex min-w-0 items-center gap-2">
          <CodeIcon />
          {title ? (
            <span className="truncate font-mono text-[12px] font-medium text-ink">{filename ?? title}</span>
          ) : (
            <span className="font-mono text-[12px] font-medium text-ink">Code</span>
          )}
          {filename && displayName && displayName !== "Code" ? (
            <span className="shrink-0 text-[11.5px] text-ink-3">{displayName}</span>
          ) : null}
        </span>
        <button
          type="button"
          aria-label="Copy code"
          onClick={copy}
          className={`flex h-6 items-center gap-1 rounded-[6px] px-1.5 text-[11.5px] font-medium transition-colors duration-100 hover:bg-hover ${
            copied ? "text-green" : "text-ink-3 hover:text-ink"
          }`}
        >
          {copied ? (
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
          ) : (
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="12" height="12" rx="2.5" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
          )}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="max-h-[min(28rem,70vh)] overflow-auto bg-inset px-3 py-2.5 font-mono text-[11.5px] leading-[1.7]">
        {lines.map((line, index) => (
          <div key={index} className="flex">
            {showLineNumbers ? (
              <span className="w-7 shrink-0 border-r border-line pr-2 text-right text-[10.5px] leading-[1.86] text-ink-3/60 select-none">
                {index + 1}
              </span>
            ) : null}
            <span className={cn("whitespace-pre", showLineNumbers ? "pl-3" : "")}>
              {tokenizeLine(line).map((tok, tokIndex) => (
                <span key={tokIndex} style={{ color: tok.c ? COLORS[tok.c] : "var(--ink-2)" }}>
                  {tok.t}
                </span>
              ))}
              {line.length === 0 ? " " : null}
              {streaming && index === lines.length - 1 ? (
                <span className="ml-0.5 inline-block h-3 w-[3px] translate-y-0.5 rounded-full bg-accent" />
              ) : null}
            </span>
          </div>
        ))}
      </pre>
    </div>
  )
}

export function CodeBlockFromMarkdown({
  code,
  info,
  streaming = false,
}: {
  code: string
  info?: string | null
  streaming?: boolean
}) {
  const parsed = parseFenceInfo(info)
  return (
    <CodeBlock
      code={code}
      filename={parsed.filename}
      language={parsed.language}
      languageName={parsed.languageName}
      streaming={streaming}
    />
  )
}

export function CodeBlockLabel({ children }: { children: ReactNode }) {
  return <span className="font-medium text-ink-2">{children}</span>
}
