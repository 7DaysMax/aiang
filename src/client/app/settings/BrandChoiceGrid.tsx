import type { ComponentType, SVGProps } from "react"
import { cn } from "../../lib/utils"

type BrandIcon = ComponentType<{ className?: string } & SVGProps<SVGSVGElement>>

export interface BrandChoiceOption<T extends string> {
  value: T
  label: string
  icon: BrandIcon
  description?: string
  badge?: string
}

export function BrandChoiceGrid<T extends string>({
  options,
  value,
  onChange,
  columnsClassName = "grid-cols-2 sm:grid-cols-4",
}: {
  options: Array<BrandChoiceOption<T>>
  value: T
  onChange: (value: T) => void
  columnsClassName?: string
}) {
  return (
    <div className={cn("grid gap-2", columnsClassName)}>
      {options.map((option) => {
        const Icon = option.icon
        const selected = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={cn(
              "flex min-h-[4.25rem] flex-col items-start gap-2 rounded-xl border px-3 py-2.5 text-left transition-colors",
              selected
                ? "border-line-strong bg-surface shadow-card"
                : "border-line bg-surface hover:bg-hover",
            )}
          >
            <span className="flex w-full items-center gap-2">
              <Icon className="h-4 w-4 text-foreground" />
              <span className="truncate text-sm font-medium text-foreground">{option.label}</span>
              {option.badge ? (
                <span className="ml-auto shrink-0 rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                  {option.badge}
                </span>
              ) : null}
            </span>
            {option.description ? (
              <span className="line-clamp-2 text-[11px] leading-4 text-muted-foreground">
                {option.description}
              </span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}
