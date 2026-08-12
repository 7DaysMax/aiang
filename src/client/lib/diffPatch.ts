import { createTwoFilesPatch } from "diff"

/**
 * 把一段旧文本 → 新文本转成 git 风格补丁（`diff --git a/x b/x` 头），
 * 供 @pierre/diffs 的 PatchDiff 渲染：带语法高亮、词级 diff 和行号。
 * 与服务端 diff-store 的快照补丁同款格式，语言由文件后缀识别。
 */
export function buildEditDiffPatch(
  filePath: string,
  oldString: string,
  newString: string,
): string {
  const body = createTwoFilesPatch(
    `a/${filePath}`,
    `b/${filePath}`,
    oldString,
    newString,
    "",
    "",
    { context: 3 },
  )
    .split("\n")
    .filter((line) => !/^(Index:|={7,})/.test(line))
    .join("\n")
  return `diff --git a/${filePath} b/${filePath}\n${body}`
}
