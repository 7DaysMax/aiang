import type { ReactNode } from "react"
import ThinkingState from "@/components/primitives/ThinkingState"

export function ThinkingTrace({
  working,
  title = "思考中",
  doneTitle = "思考过程",
  meta,
  children,
  defaultOpen,
}: {
  working: boolean
  title?: string
  doneTitle?: string
  meta?: ReactNode
  children?: ReactNode
  defaultOpen?: boolean
}) {
  return (
    <ThinkingState
      working={working}
      activeLabel={title}
      doneLabel={doneTitle}
      meta={meta}
      defaultExpanded={defaultOpen}
      compact
    >
      {children}
    </ThinkingState>
  )
}
