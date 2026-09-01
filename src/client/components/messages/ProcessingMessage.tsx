import { X } from "lucide-react"
import { MetaRow, MetaContent } from "./shared"
import { PixelLoader } from "../bui/PixelLoader"
import { Shimmer } from "../bui/atoms/Shimmer"

const STATUS_LABELS: Record<string, string> = {
  connecting: "连接中…",
  acquiring_sandbox: "启动沙箱…",
  initializing: "初始化中…",
  starting: "启动中…",
  running: "运行中…",
  waiting_for_user: "等待输入…",
  failed: "失败",
}

interface ProcessingMessageProps {
  status?: string
}

export function ProcessingMessage({ status }: ProcessingMessageProps) {
  const label = (status ? STATUS_LABELS[status] : undefined) || "处理中…"
  const isFailed = status === "failed"

  return (
    <MetaRow className="ml-[1px] mt-3">
      <MetaContent>
        {isFailed ? (
          <X className="size-4.5 text-red" />
        ) : (
          <PixelLoader />
        )}
        {isFailed ? (
          <span className="ml-[1px] text-sm text-red">{label}</span>
        ) : (
          <Shimmer className="ml-[1px] text-sm">{label}</Shimmer>
        )}
      </MetaContent>
    </MetaRow>
  )
}
