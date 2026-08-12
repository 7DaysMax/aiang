import { useEffect, useState } from "react"
import CodeMirror from "@uiw/react-codemirror"
import { languages } from "@codemirror/language-data"
import { EditorView, keymap, lineNumbers } from "@codemirror/view"
import { indentWithTab } from "@codemirror/commands"
import { oneDark } from "@codemirror/theme-one-dark"
import { LanguageDescription, type LanguageSupport } from "@codemirror/language"
import { cn } from "../../lib/utils"

function isDarkMode() {
  return typeof document !== "undefined" && document.documentElement.classList.contains("dark")
}

/** 与面板底色融合的编辑区样式，行号列跟随应用主题。 */
const editorTheme = EditorView.theme({
  "&": {
    height: "100%",
    backgroundColor: "transparent",
    fontSize: "12px",
  },
  ".cm-scroller": {
    fontFamily: "var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace)",
    lineHeight: "1.6",
  },
  ".cm-gutters": {
    backgroundColor: "transparent",
    borderRight: "1px solid var(--border)",
    color: "var(--muted-foreground)",
  },
  ".cm-activeLine": {
    backgroundColor: "var(--accent)",
  },
  ".cm-activeLineGutter": {
    backgroundColor: "transparent",
  },
  "&.cm-focused": {
    outline: "none",
  },
  ".cm-content": {
    caretColor: "var(--foreground)",
  },
})

/** 点击行号选中整行（类似 VSCode）；Shift+点击从当前选区锚点行扩展到目标行。 */
const selectLineOnGutterClick = lineNumbers({
  domEventHandlers: {
    click(view, line, event) {
      const mouseEvent = event as MouseEvent
      if (mouseEvent.button !== 0) return false
      const docLine = view.state.doc.lineAt(line.from)
      if (mouseEvent.shiftKey) {
        const anchorLine = view.state.doc.lineAt(view.state.selection.main.anchor)
        view.dispatch({
          selection: {
            anchor: Math.min(anchorLine.from, docLine.from),
            head: Math.max(anchorLine.to, docLine.to),
          },
          userEvent: "select.line",
        })
      } else {
        view.dispatch({
          selection: { anchor: docLine.from, head: docLine.to },
          userEvent: "select.line",
        })
      }
      view.focus()
      return true
    },
  },
})

/** 用文件名从 CodeMirror 语言包中挑出对应的语言支持（异步加载）。 */
function useLanguageSupport(fileName: string) {
  const [support, setSupport] = useState<LanguageSupport | null>(null)

  useEffect(() => {
    let cancelled = false
    const description = LanguageDescription.matchFilename(languages, fileName)
    if (!description) {
      setSupport(null)
      return
    }
    void description.load().then((loaded) => {
      if (!cancelled) setSupport(loaded)
    })
    return () => {
      cancelled = true
    }
  }, [fileName])

  return support
}

/**
 * 基于 CodeMirror 6 的代码编辑器：
 * 点击行号选中整行、选区与显示完全一致，按文件名自动语法高亮。
 */
export function CodeEditor({
  value,
  onChange,
  fileName,
  className,
}: {
  value: string
  onChange: (value: string) => void
  fileName: string
  className?: string
}) {
  const [dark, setDark] = useState(isDarkMode)
  const languageSupport = useLanguageSupport(fileName)

  useEffect(() => {
    const element = document.documentElement
    const observer = new MutationObserver(() => setDark(element.classList.contains("dark")))
    observer.observe(element, { attributes: true, attributeFilter: ["class"] })
    return () => observer.disconnect()
  }, [])

  return (
    <div className={cn("relative min-h-0 flex-1 overflow-hidden", className)}>
      <CodeMirror
        value={value}
        onChange={onChange}
        className="h-full"
        height="100%"
        theme={dark ? [oneDark, editorTheme] : [editorTheme]}
        extensions={[
          keymap.of([indentWithTab]),
          selectLineOnGutterClick,
          languageSupport ? [languageSupport] : [],
        ]}
        basicSetup={{
          lineNumbers: false,
          foldGutter: true,
          highlightActiveLine: true,
          highlightActiveLineGutter: true,
          bracketMatching: true,
          closeBrackets: true,
          autocompletion: false,
          indentOnInput: true,
        }}
      />
    </div>
  )
}
