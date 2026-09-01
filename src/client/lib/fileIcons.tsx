import { getIcon } from "material-file-icons"
import type { ReactNode } from "react"
import { cn } from "./utils"

/**
 * VS Code Material Icon Theme 风格的文件图标。
 * 替代原先 simple-icons 品牌徽标（大小/颜色不统一，树里显得花）。
 */
export function FileTypeIcon({
  fileName,
  className,
  fallback = null,
}: {
  fileName: string
  className?: string
  /** 找不到匹配时渲染的占位内容；Material 几乎总能命中，一般用不到。 */
  fallback?: ReactNode
}): ReactNode {
  const base = fileName.split("/").at(-1) ?? fileName
  if (!base) return fallback

  const icon = getIcon(base)
  if (!icon?.svg) return fallback

  return (
    <span
      className={cn(
        "inline-flex h-4 w-4 shrink-0 items-center justify-center [&>svg]:h-full [&>svg]:w-full",
        className,
      )}
      // Material Icon Theme SVG 自带填充色，直接注入即可。
      dangerouslySetInnerHTML={{ __html: icon.svg }}
      aria-hidden="true"
    />
  )
}
