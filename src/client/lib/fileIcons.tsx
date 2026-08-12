import {
  siBun,
  siC,
  siClojure,
  siComposer,
  siCplusplus,
  siCss,
  siDart,
  siDeno,
  siDocker,
  siDotenv,
  siDotnet,
  siElixir,
  siErlang,
  siEslint,
  siGit,
  siGnubash,
  siGo,
  siGraphql,
  siHaskell,
  siHcl,
  siHtml5,
  siJavascript,
  siJest,
  siJson,
  siJupyter,
  siKotlin,
  siLess,
  siLua,
  siMake,
  siMarkdown,
  siNextdotjs,
  siNixos,
  siNodedotjs,
  siNpm,
  siOpenjdk,
  siPhp,
  siPnpm,
  siPostcss,
  siPostgresql,
  siPrettier,
  siPrisma,
  siPython,
  siR,
  siRuby,
  siRust,
  siSass,
  siScala,
  siShell,
  siSolidity,
  siSqlite,
  siSvelte,
  siSvg,
  siSwift,
  siTailwindcss,
  siTerraform,
  siToml,
  siTypescript,
  siVercel,
  siVite,
  siVitest,
  siVuedotjs,
  siXml,
  siYaml,
  siYarn,
  siZig,
  siZsh,
} from "simple-icons"
import type { ReactNode } from "react"
import { cn } from "./utils"

export interface BrandIcon {
  title: string
  hex: string
  path: string
}

/** 扩展名 → 官方品牌图标。 */
const EXTENSION_ICONS: Record<string, BrandIcon> = {
  ts: siTypescript,
  mts: siTypescript,
  cts: siTypescript,
  tsx: siTypescript,
  js: siJavascript,
  mjs: siJavascript,
  cjs: siJavascript,
  jsx: siJavascript,
  json: siJson,
  jsonc: siJson,
  py: siPython,
  pyi: siPython,
  ipynb: siJupyter,
  rs: siRust,
  go: siGo,
  java: siOpenjdk,
  c: siC,
  h: siC,
  cpp: siCplusplus,
  cc: siCplusplus,
  cxx: siCplusplus,
  hpp: siCplusplus,
  hh: siCplusplus,
  cs: siDotnet,
  sh: siShell,
  bash: siGnubash,
  fish: siShell,
  zsh: siZsh,
  yaml: siYaml,
  yml: siYaml,
  toml: siToml,
  css: siCss,
  scss: siSass,
  sass: siSass,
  less: siLess,
  html: siHtml5,
  htm: siHtml5,
  md: siMarkdown,
  mdx: siMarkdown,
  vue: siVuedotjs,
  svelte: siSvelte,
  swift: siSwift,
  kt: siKotlin,
  kts: siKotlin,
  php: siPhp,
  rb: siRuby,
  lua: siLua,
  dart: siDart,
  r: siR,
  graphql: siGraphql,
  gql: siGraphql,
  prisma: siPrisma,
  tf: siTerraform,
  hcl: siHcl,
  xml: siXml,
  svg: siSvg,
  sql: siSqlite,
  psql: siPostgresql,
  zig: siZig,
  sol: siSolidity,
  ex: siElixir,
  exs: siElixir,
  erl: siErlang,
  hrl: siErlang,
  hs: siHaskell,
  clj: siClojure,
  cljs: siClojure,
  cljc: siClojure,
  scala: siScala,
  sc: siScala,
  nix: siNixos,
}

/** 固定文件名 → 官方品牌图标。 */
const FILE_NAME_ICONS: Record<string, BrandIcon> = {
  "dockerfile": siDocker,
  "makefile": siMake,
  "gnumakefile": siMake,
  "justfile": siMake,
  "cargo.toml": siRust,
  "go.mod": siGo,
  "go.sum": siGo,
  "package.json": siNodedotjs,
  "package-lock.json": siNpm,
  "pnpm-lock.yaml": siPnpm,
  "yarn.lock": siYarn,
  "bun.lockb": siBun,
  "bun.lock": siBun,
  "composer.json": siComposer,
  "composer.lock": siComposer,
  "gemfile": siRuby,
  "rakefile": siRuby,
  "podfile": siRuby,
  "requirements.txt": siPython,
  "pyproject.toml": siPython,
  "schema.prisma": siPrisma,
  "vite.config.ts": siVite,
  "vite.config.js": siVite,
  "vite.config.mjs": siVite,
  "vitest.config.ts": siVitest,
  "vitest.config.js": siVitest,
  "vitest.config.mts": siVitest,
  "jest.config.ts": siJest,
  "jest.config.js": siJest,
  "jest.config.mjs": siJest,
  "next.config.js": siNextdotjs,
  "next.config.mjs": siNextdotjs,
  "next.config.ts": siNextdotjs,
  "nuxt.config.ts": siVuedotjs,
  "nuxt.config.js": siVuedotjs,
  "tailwind.config.ts": siTailwindcss,
  "tailwind.config.js": siTailwindcss,
  "postcss.config.js": siPostcss,
  "postcss.config.cjs": siPostcss,
  "postcss.config.mjs": siPostcss,
  "eslint.config.js": siEslint,
  "eslint.config.mjs": siEslint,
  "eslint.config.cjs": siEslint,
  "prettier.config.js": siPrettier,
  "prettier.config.cjs": siPrettier,
  ".prettierrc": siPrettier,
  "docker-compose.yml": siDocker,
  "docker-compose.yaml": siDocker,
  "vercel.json": siVercel,
  ".gitignore": siGit,
  ".gitattributes": siGit,
  ".gitmodules": siGit,
  ".env": siDotenv,
  "deno.json": siDeno,
  "deno.jsonc": siDeno,
  "mod.ts": siDeno,
  "index.ts": siDeno,
}

/** 文件名前缀匹配（如 Dockerfile.dev、Dockerfile.prod）。 */
const FILE_NAME_PREFIX_ICONS: Array<{ prefix: string; icon: BrandIcon }> = [
  { prefix: "dockerfile", icon: siDocker },
  { prefix: ".eslintrc", icon: siEslint },
  { prefix: ".env", icon: siDotenv },
]

function lookupFileIcon(fileName: string): BrandIcon | null {
  const base = fileName.split("/").at(-1) ?? fileName
  const lower = base.toLowerCase()
  const byName = FILE_NAME_ICONS[lower]
  if (byName) return byName
  for (const { prefix, icon } of FILE_NAME_PREFIX_ICONS) {
    if (lower.startsWith(prefix)) return icon
  }
  const dot = lower.lastIndexOf(".")
  if (dot > 0) {
    return EXTENSION_ICONS[lower.slice(dot + 1)] ?? null
  }
  return null
}

/**
 * 文件类型的官方品牌图标。找不到匹配时返回 null，
 * 由调用方回退到通用文件图标。
 */
export function FileTypeIcon({
  fileName,
  className,
  fallback = null,
}: {
  fileName: string
  className?: string
  /** 找不到匹配品牌图标时渲染的占位内容，例如通用文件图标。 */
  fallback?: ReactNode
}): ReactNode {
  const icon = lookupFileIcon(fileName)
  if (!icon) return fallback
  // simple-icons 的 hex 不带 "#" 前缀，先补全成合法 CSS 颜色。
  const hex = icon.hex.startsWith("#") ? icon.hex : `#${icon.hex}`
  // 黑/白底色的品牌徽标（如 Rust）在深色/浅色主题下用当前文字色，保证可见。
  const fill = hex === "#000000" || hex === "#FFFFFF" ? "currentColor" : hex
  return (
    <svg
      viewBox="0 0 24 24"
      className={cn("h-3.5 w-3.5 shrink-0", className)}
      style={{ fill }}
      aria-hidden="true"
      role="img"
    >
      <title>{icon.title}</title>
      <path d={icon.path} />
    </svg>
  )
}
