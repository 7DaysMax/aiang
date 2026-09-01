import { useState } from "react"
import { extractAnswerSources, insertComposerText, suggestFollowUps } from "../../lib/composerInsert"

const ACTION_CLASS =
  "flex size-6 items-center justify-center rounded-[6px] text-ink-3 transition-colors duration-100 hover:bg-hover-2 hover:text-ink-2"

export function AnswerActions({
  text,
  retryPrompt,
  streaming = false,
}: {
  text: string
  retryPrompt?: string
  streaming?: boolean
}) {
  const [copied, setCopied] = useState(false)
  const [sourcesOpen, setSourcesOpen] = useState(false)
  const followUps = suggestFollowUps(text)
  const sources = extractAnswerSources(text)
  const done = !streaming && text.trim().length > 0

  if (!done) return null

  return (
    <div className="mt-2" style={{ animation: "fade-up 350ms cubic-bezier(0.23,1,0.32,1) both" }}>
      <div className="flex items-center gap-0.5">
        <button
          type="button"
          aria-label="Copy"
          className={ACTION_CLASS}
          onClick={() => {
            void navigator.clipboard.writeText(text).then(() => {
              setCopied(true)
              setTimeout(() => setCopied(false), 1500)
            })
          }}
        >
          {copied ? (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
          ) : (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="12" height="12" rx="2.5" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
          )}
        </button>
        {retryPrompt ? (
          <button
            type="button"
            aria-label="Retry"
            className={ACTION_CLASS}
            onClick={() => insertComposerText(retryPrompt, { replace: true })}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6" /></svg>
          </button>
        ) : null}
        {sources.length > 0 ? (
          <button
            type="button"
            aria-expanded={sourcesOpen}
            onClick={() => setSourcesOpen((current) => !current)}
            className="ml-1.5 flex items-center gap-1.5 rounded-[6px] px-1 py-0.5 text-left transition-colors duration-150 hover:bg-hover"
          >
            <span className="text-[12px] text-ink-2">{sources.length} sources</span>
          </button>
        ) : null}
      </div>
      {sourcesOpen && sources.length > 0 ? (
        <div className="mt-1.5 flex flex-col rounded-[10px] bg-inset p-1 shadow-hairline">
          {sources.map((source) => (
            <a
              key={source.href}
              href={source.href}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 rounded-[6px] px-1.5 py-1 text-[12px] text-ink-2 transition-colors duration-150 hover:bg-hover hover:text-ink"
            >
              <span className="animated-underline">{source.name}</span>
              <span className="ml-auto font-mono text-[10.5px] text-ink-3">{new URL(source.href).hostname.replace(/^www\./, "")}</span>
            </a>
          ))}
        </div>
      ) : null}
      {followUps.length > 0 ? (
        <div className="mt-2.5">
          <p className="text-[12px] font-medium text-ink-2">Follow-ups</p>
          <div className="mt-0.5 flex flex-col">
            {followUps.map((item, index) => (
              <button
                key={item}
                type="button"
                onClick={() => insertComposerText(item, { replace: true })}
                className="-mx-1.5 flex items-center gap-2 rounded-[7px] border-b border-line px-1.5 py-1.5 text-left text-[12.5px] text-ink transition-colors duration-100 hover:bg-hover-2 last:border-0"
                style={{ animation: `fade-up 350ms cubic-bezier(0.23,1,0.32,1) ${index * 90}ms both` }}
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--ink-3)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                  <path d="M9 10l-5 5 5 5" />
                  <path d="M20 4v7a4 4 0 0 1-4 4H4" />
                </svg>
                {item}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}
