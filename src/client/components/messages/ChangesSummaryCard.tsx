import { memo, useMemo } from "react"
import type { ChatDiffFile } from "../../../shared/types"
import { ProjectDiffTable, type ProjectDiffRow } from "@/components/primitives/DiffTable"

export interface ChangesSummaryActions {
  onOpenFile: (path: string) => void
  onDiscardFile: (path: string) => void
  onDiscardAll: () => void
  onReview: () => void
}

function fileName(path: string): string {
  const parts = path.split("/")
  return parts[parts.length - 1] || path
}

export const ChangesSummaryCard = memo(function ChangesSummaryCard({
  files,
  actions,
}: {
  files: ChatDiffFile[]
  actions: ChangesSummaryActions
}) {
  const rows = useMemo<ProjectDiffRow[]>(
    () => files.map((file) => ({
      key: file.path,
      file: fileName(file.path),
      kind: file.changeType,
      add: file.additions ?? 0,
      del: file.deletions ?? 0,
      path: file.path,
    })),
    [files],
  )

  if (rows.length === 0) return null

  return (
    <ProjectDiffTable
      title="Proposed edits"
      rows={rows}
      onOpenFile={actions.onOpenFile}
      onApply={() => actions.onReview()}
      onDiscardAll={actions.onDiscardAll}
    />
  )
})
