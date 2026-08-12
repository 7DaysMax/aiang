import { createHighlighterCore, type HighlighterCore } from "shiki/core"
import { createJavaScriptRegexEngine } from "shiki/engine/javascript"
import darkTheme from "@shikijs/themes/github-dark"
import lightTheme from "@shikijs/themes/github-light"

export interface DetectedLanguage {
  /** Shiki 语言 id，用于 codeToHtml。 */
  id: string
  /** 展示名，如 "TypeScript"。 */
  name: string
}

/** 常见源码扩展名 → Shiki 语言。 */
const EXTENSION_LANGUAGES: Record<string, DetectedLanguage> = {
  ts: { id: "typescript", name: "TypeScript" },
  mts: { id: "typescript", name: "TypeScript" },
  cts: { id: "typescript", name: "TypeScript" },
  tsx: { id: "tsx", name: "TSX" },
  js: { id: "javascript", name: "JavaScript" },
  mjs: { id: "javascript", name: "JavaScript" },
  cjs: { id: "javascript", name: "JavaScript" },
  jsx: { id: "jsx", name: "JSX" },
  json: { id: "json", name: "JSON" },
  jsonc: { id: "json", name: "JSONC" },
  css: { id: "css", name: "CSS" },
  scss: { id: "scss", name: "SCSS" },
  less: { id: "less", name: "Less" },
  html: { id: "html", name: "HTML" },
  htm: { id: "html", name: "HTML" },
  md: { id: "markdown", name: "Markdown" },
  mdx: { id: "mdx", name: "MDX" },
  py: { id: "python", name: "Python" },
  rs: { id: "rust", name: "Rust" },
  go: { id: "go", name: "Go" },
  java: { id: "java", name: "Java" },
  c: { id: "c", name: "C" },
  h: { id: "cpp", name: "C/C++" },
  cpp: { id: "cpp", name: "C++" },
  cc: { id: "cpp", name: "C++" },
  cxx: { id: "cpp", name: "C++" },
  hpp: { id: "cpp", name: "C++" },
  sh: { id: "bash", name: "Shell" },
  bash: { id: "bash", name: "Bash" },
  zsh: { id: "bash", name: "Zsh" },
  fish: { id: "fish", name: "Fish" },
  yaml: { id: "yaml", name: "YAML" },
  yml: { id: "yaml", name: "YAML" },
  toml: { id: "toml", name: "TOML" },
  xml: { id: "xml", name: "XML" },
  svg: { id: "xml", name: "SVG" },
  sql: { id: "sql", name: "SQL" },
  vue: { id: "vue", name: "Vue" },
  svelte: { id: "svelte", name: "Svelte" },
  swift: { id: "swift", name: "Swift" },
  kt: { id: "kotlin", name: "Kotlin" },
  php: { id: "php", name: "PHP" },
  rb: { id: "ruby", name: "Ruby" },
  lua: { id: "lua", name: "Lua" },
  dart: { id: "dart", name: "Dart" },
  r: { id: "r", name: "R" },
  graphql: { id: "graphql", name: "GraphQL" },
  gql: { id: "graphql", name: "GraphQL" },
  proto: { id: "protobuf", name: "Protobuf" },
  prisma: { id: "prisma", name: "Prisma" },
  tf: { id: "terraform", name: "Terraform" },
  hcl: { id: "hcl", name: "HCL" },
  ini: { id: "ini", name: "INI" },
  conf: { id: "ini", name: "INI" },
  diff: { id: "diff", name: "Diff" },
  patch: { id: "diff", name: "Diff" },
  dockerfile: { id: "dockerfile", name: "Dockerfile" },
}

/** 固定文件名 → Shiki 语言。 */
const FILE_NAME_LANGUAGES: Record<string, DetectedLanguage> = {
  dockerfile: { id: "dockerfile", name: "Dockerfile" },
  makefile: { id: "makefile", name: "Makefile" },
  "gnumakefile": { id: "makefile", name: "Makefile" },
  "justfile": { id: "makefile", name: "Makefile" },
  "cmakelists.txt": { id: "cmake", name: "CMake" },
  "procfile": { id: "ini", name: "Procfile" },
}

/** 根据文件路径/名字识别语言；识别不到返回 null（按纯文本处理）。 */
export function detectLanguage(fileName: string): DetectedLanguage | null {
  const basename = fileName.split("/").at(-1)?.toLowerCase() ?? fileName.toLowerCase()
  if (!basename) return null
  const byName = FILE_NAME_LANGUAGES[basename]
  if (byName) return byName
  const extension = basename.includes(".") ? basename.split(".").at(-1)! : ""
  return EXTENSION_LANGUAGES[extension] ?? null
}

export const DARK_THEME_NAME = "github-dark"
export const LIGHT_THEME_NAME = "github-light"

/** 需要时按 id 动态加载语言的静态导入表（Vite 可静态分析）。 */
const LANGUAGE_LOADERS: Record<string, () => Promise<{ default: unknown }>> = {
  typescript: () => import("@shikijs/langs/typescript"),
  javascript: () => import("@shikijs/langs/javascript"),
  tsx: () => import("@shikijs/langs/tsx"),
  jsx: () => import("@shikijs/langs/jsx"),
  json: () => import("@shikijs/langs/json"),
  css: () => import("@shikijs/langs/css"),
  scss: () => import("@shikijs/langs/scss"),
  less: () => import("@shikijs/langs/less"),
  html: () => import("@shikijs/langs/html"),
  markdown: () => import("@shikijs/langs/markdown"),
  mdx: () => import("@shikijs/langs/mdx"),
  python: () => import("@shikijs/langs/python"),
  rust: () => import("@shikijs/langs/rust"),
  go: () => import("@shikijs/langs/go"),
  java: () => import("@shikijs/langs/java"),
  c: () => import("@shikijs/langs/c"),
  cpp: () => import("@shikijs/langs/cpp"),
  bash: () => import("@shikijs/langs/bash"),
  fish: () => import("@shikijs/langs/fish"),
  yaml: () => import("@shikijs/langs/yaml"),
  toml: () => import("@shikijs/langs/toml"),
  xml: () => import("@shikijs/langs/xml"),
  sql: () => import("@shikijs/langs/sql"),
  vue: () => import("@shikijs/langs/vue"),
  svelte: () => import("@shikijs/langs/svelte"),
  swift: () => import("@shikijs/langs/swift"),
  kotlin: () => import("@shikijs/langs/kotlin"),
  php: () => import("@shikijs/langs/php"),
  ruby: () => import("@shikijs/langs/ruby"),
  lua: () => import("@shikijs/langs/lua"),
  dart: () => import("@shikijs/langs/dart"),
  r: () => import("@shikijs/langs/r"),
  graphql: () => import("@shikijs/langs/graphql"),
  protobuf: () => import("@shikijs/langs/protobuf"),
  prisma: () => import("@shikijs/langs/prisma"),
  terraform: () => import("@shikijs/langs/terraform"),
  hcl: () => import("@shikijs/langs/hcl"),
  ini: () => import("@shikijs/langs/ini"),
  diff: () => import("@shikijs/langs/diff"),
  dockerfile: () => import("@shikijs/langs/dockerfile"),
  makefile: () => import("@shikijs/langs/makefile"),
  cmake: () => import("@shikijs/langs/cmake"),
}

let highlighterPromise: Promise<HighlighterCore> | null = null

function getHighlighter(): Promise<HighlighterCore> {
  highlighterPromise ??= createHighlighterCore({
    themes: [darkTheme, lightTheme],
    langs: [],
    engine: createJavaScriptRegexEngine(),
  })
  return highlighterPromise
}

async function ensureLanguage(highlighter: HighlighterCore, langId: string) {
  if (highlighter.getLoadedLanguages().includes(langId)) return
  const loader = LANGUAGE_LOADERS[langId]
  if (!loader) return
  const module = await loader()
  const lang = (module.default ?? module) as Parameters<HighlighterCore["loadLanguage"]>[0]
  await highlighter.loadLanguage(lang)
}

/** 超过该长度的代码跳过高亮（性能保护）。 */
export const MAX_HIGHLIGHT_CHARS = 300_000

/**
 * 把代码渲染成带语法高亮的 HTML（Shiki 输出）。主题跟随 dark 标志。
 * 语言缺失或代码过长时返回 null，调用方应回退为纯文本。
 */
export async function highlightToHtml(code: string, langId: string, dark: boolean): Promise<string | null> {
  if (!code || code.length > MAX_HIGHLIGHT_CHARS) return null
  try {
    const highlighter = await getHighlighter()
    await ensureLanguage(highlighter, langId)
    if (!highlighter.getLoadedLanguages().includes(langId)) return null
    return highlighter.codeToHtml(code, {
      lang: langId,
      theme: dark ? DARK_THEME_NAME : LIGHT_THEME_NAME,
    })
  } catch {
    return null
  }
}
