import { useEffect, useState, type CSSProperties, type ReactNode } from "react"
import { Minus, Square, X, Copy } from "lucide-react"
import { APP_NAME } from "../../shared/branding"
import { cn } from "../lib/utils"

declare global {
  interface Window {
    aiangDesktop?: {
      isDesktop: boolean
      frameless?: boolean
      minimize: () => Promise<unknown>
      maximize: () => Promise<{ ok?: boolean; maximized?: boolean }>
      close: () => Promise<unknown>
      isMaximized: () => Promise<boolean>
    }
  }
}

export function useIsDesktopShell() {
  return Boolean(typeof window !== "undefined" && window.aiangDesktop?.isDesktop)
}

/**
 * Frameless Electron chrome: drag region + window controls.
 */
export function DesktopTitlebar() {
  const desktop = typeof window !== "undefined" ? window.aiangDesktop : undefined
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    if (!desktop) return
    void desktop.isMaximized().then(setMaximized).catch(() => {})
  }, [desktop])

  if (!desktop?.frameless) return null

  return (
    <div
      className="fixed top-0 left-0 right-0 z-[200] h-9 flex items-center border-b border-border/40 bg-background/95 backdrop-blur-sm select-none"
      style={{ WebkitAppRegion: "drag" } as CSSProperties}
    >
      <div className="pl-3 text-xs font-medium text-muted-foreground tracking-wide">
        {APP_NAME}
      </div>
      <div className="flex-1" />
      <div
        className="flex h-full items-stretch"
        style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
      >
        <TitleButton
          label="Minimize"
          onClick={() => void desktop.minimize()}
        >
          <Minus className="h-3.5 w-3.5" />
        </TitleButton>
        <TitleButton
          label={maximized ? "Restore" : "Maximize"}
          onClick={() => {
            void desktop.maximize().then((result) => {
              if (typeof result?.maximized === "boolean") setMaximized(result.maximized)
              else void desktop.isMaximized().then(setMaximized)
            })
          }}
        >
          {maximized ? <Copy className="h-3 w-3 rotate-180" /> : <Square className="h-3 w-3" />}
        </TitleButton>
        <TitleButton
          label="Close"
          danger
          onClick={() => void desktop.close()}
        >
          <X className="h-3.5 w-3.5" />
        </TitleButton>
      </div>
    </div>
  )
}

function TitleButton({
  children,
  onClick,
  label,
  danger,
}: {
  children: ReactNode
  onClick: () => void
  label: string
  danger?: boolean
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className={cn(
        "h-9 w-11 inline-flex items-center justify-center text-muted-foreground transition-colors",
        danger ? "hover:bg-red-500 hover:text-white" : "hover:bg-muted hover:text-foreground",
      )}
    >
      {children}
    </button>
  )
}
