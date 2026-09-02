import { useState, type ReactNode } from "react"
import type { BeautifulUiPreferences } from "../../../shared/types"
import ApprovalCard from "../../../components/primitives/ApprovalCard"
import ChatComposer from "../../../components/primitives/ChatComposer"
import CodeBlock from "../../../components/primitives/CodeBlock"
import ContextCards from "../../../components/primitives/ContextCards"
import DiffTable from "../../../components/primitives/DiffTable"
import FilterTable from "../../../components/primitives/FilterTable"
import FineTuneCard from "../../../components/primitives/FineTuneCard"
import Flowchart from "../../../components/primitives/Flowchart"
import InsightCards from "../../../components/primitives/InsightCards"
import LoadingState from "../../../components/primitives/LoadingState"
import PromptBar from "../../../components/primitives/PromptBar"
import RecommendationCard from "../../../components/primitives/RecommendationCard"
import RecordsTable from "../../../components/primitives/RecordsTable"
import SearchList from "../../../components/primitives/SearchList"
import SelectionActions from "../../../components/primitives/SelectionActions"
import SidebarNav from "../../../components/primitives/SidebarNav"
import StreamingText from "../../../components/primitives/StreamingText"
import TaskRows from "../../../components/primitives/TaskRows"
import ThinkingState from "../../../components/primitives/ThinkingState"
import ToolChips from "../../../components/primitives/ToolChips"
import { cn } from "../../lib/utils"
import { SegmentedControl, type SegmentedOption } from "../../components/ui/segmented-control"

type GalleryCategory = "chat" | "tools" | "data" | "feedback" | "navigation"

type GalleryItem = {
  name: string
  description: string
  render: (preferences: BeautifulUiPreferences) => ReactNode
  wide?: boolean
  stageClassName?: string
}

type GalleryGroup = {
  label: string
  items: GalleryItem[]
}

export const BEAUTIFUL_UI_GALLERY: Record<GalleryCategory, GalleryGroup> = {
  chat: {
    label: "聊天",
    items: [
      {
        name: "Streaming Text",
        description: "逐段呈现回复、来源与后续操作。",
        render: () => <StreamingText loop={false} fill />,
        wide: true,
        stageClassName: "items-start",
      },
      {
        name: "Chat",
        description: "完整的对话与输入组合界面。",
        render: () => <ChatComposer />,
      },
      {
        name: "Prompt Bar",
        description: "支持输入、附件与模型入口的代理输入栏。",
        render: (preferences) => (
          <PromptBar
            variant={preferences.promptBar}
            demo={false}
            placeholder="描述你希望代理完成的任务…"
            onSend={() => undefined}
          />
        ),
        wide: true,
      },
      {
        name: "Selection Actions",
        description: "选中文字后的解释、改写与追问操作。",
        render: () => <SelectionActions />,
        wide: true,
        stageClassName: "min-h-80 items-start",
      },
    ],
  },
  tools: {
    label: "工具",
    items: [
      {
        name: "Loading State",
        description: "代理正在运行时的状态与耗时。",
        render: (preferences) => <LoadingState label="正在分析项目…" variant={preferences.loading} />,
      },
      {
        name: "Thinking",
        description: "可折叠的推理过程与阶段信息。",
        render: (preferences) => (
          <ThinkingState variant={preferences.thinking} working={false} defaultExpanded compact />
        ),
      },
      {
        name: "Tool Chips",
        description: "工具调用、结果与文件改动摘要。",
        render: () => <ToolChips />,
        wide: true,
        stageClassName: "items-start",
      },
      {
        name: "Task Rows",
        description: "代理任务计划、状态与子步骤。",
        render: (preferences) => <TaskRows variant={preferences.taskRows} />,
        wide: true,
        stageClassName: "items-start",
      },
      {
        name: "Code Block",
        description: "代码、语言、复制与差异模式。",
        render: (preferences) => <CodeBlock variant={preferences.codeBlock} fill />,
        wide: true,
        stageClassName: "items-start",
      },
    ],
  },
  data: {
    label: "数据",
    items: [
      {
        name: "Context Cards",
        description: "展示进入当前会话的上下文片段。",
        render: () => <ContextCards />,
      },
      {
        name: "Insight Cards",
        description: "可切换的指标洞察与行动建议。",
        render: () => <InsightCards />,
      },
      {
        name: "Diff Table",
        description: "逐行检查并选择是否接受差异。",
        render: () => <DiffTable />,
        wide: true,
        stageClassName: "items-start",
      },
      {
        name: "Records Table",
        description: "支持排序、选择、配置与扩展字段的数据表。",
        render: () => (
          <div className="w-full min-w-190">
            <RecordsTable fill />
          </div>
        ),
        wide: true,
        stageClassName: "max-h-112 items-start justify-start",
      },
      {
        name: "Filter Table",
        description: "按状态筛选任务记录。",
        render: () => <FilterTable />,
        wide: true,
        stageClassName: "items-start",
      },
      {
        name: "Flowchart",
        description: "可选择和拖动的任务流程节点。",
        render: () => (
          <div className="w-full min-w-130">
            <Flowchart />
          </div>
        ),
        wide: true,
        stageClassName: "max-h-120 items-start justify-start",
      },
    ],
  },
  feedback: {
    label: "反馈",
    items: [
      {
        name: "Approval Card",
        description: "收集单选、多选与自定义审批答案。",
        render: () => <ApprovalCard resettable />,
        wide: true,
        stageClassName: "items-start",
      },
      {
        name: "Recommendation Card",
        description: "比较候选方案并确认推荐项。",
        render: () => <RecommendationCard />,
      },
      {
        name: "Fine-tune Card",
        description: "调整分段选项与精细参数。",
        render: () => <FineTuneCard />,
      },
    ],
  },
  navigation: {
    label: "导航",
    items: [
      {
        name: "Search",
        description: "实时过滤并选择命令或记录。",
        render: () => <SearchList />,
      },
      {
        name: "Sidebar Nav",
        description: "工作区、主导航、搜索与最近会话。",
        render: () => <SidebarNav fill className="h-full" />,
        wide: true,
        stageClassName: "h-120 items-stretch justify-start overflow-hidden p-0",
      },
    ],
  },
}

const CATEGORY_OPTIONS: SegmentedOption<GalleryCategory>[] = (
  Object.entries(BEAUTIFUL_UI_GALLERY) as [GalleryCategory, GalleryGroup][]
).map(([value, group]) => ({ value, label: `${group.label} ${group.items.length}` }))

export const BEAUTIFUL_UI_COMPONENT_COUNT = Object.values(BEAUTIFUL_UI_GALLERY).reduce(
  (total, group) => total + group.items.length,
  0,
)

function GalleryPreview({ item, preferences }: { item: GalleryItem; preferences: BeautifulUiPreferences }) {
  return (
    <article className={cn("min-w-0", item.wide && "lg:col-span-2")}>
      <div className="mb-2 flex items-baseline justify-between gap-4 px-0.5">
        <div className="min-w-0">
          <h4 className="text-sm font-medium text-foreground">{item.name}</h4>
          <p className="mt-0.5 text-xs text-muted-foreground">{item.description}</p>
        </div>
        <span className="shrink-0 text-[11px] text-muted-foreground">真实组件</span>
      </div>
      <div
        data-beautiful-ui-preview={item.name}
        className={cn(
          "flex min-h-64 min-w-0 items-center justify-center overflow-auto rounded-xl bg-inset p-4 md:p-6",
          item.stageClassName,
        )}
      >
        {item.render(preferences)}
      </div>
    </article>
  )
}

export function BeautifulUiGallery({ preferences }: { preferences: BeautifulUiPreferences }) {
  const [activeCategory, setActiveCategory] = useState<GalleryCategory>("chat")
  const group = BEAUTIFUL_UI_GALLERY[activeCategory]

  return (
    <section aria-labelledby="beautiful-ui-gallery-title" className="border-t border-border pt-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="max-w-xl">
          <h3 id="beautiful-ui-gallery-title" className="text-sm font-medium text-foreground">
            全部组件预览
          </h3>
          <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
            Beautiful UI 官网的 {BEAUTIFUL_UI_COMPONENT_COUNT} 个组件已全部接入。分类切换只控制展厅长度，不会隐藏任何可用组件。
          </p>
        </div>
        <div className="max-w-full overflow-x-auto pb-0.5">
          <SegmentedControl
            value={activeCategory}
            onValueChange={setActiveCategory}
            options={CATEGORY_OPTIONS}
            size="sm"
            className="min-w-max"
          />
        </div>
      </div>

      <div className="mt-5 grid min-w-0 gap-x-5 gap-y-8 lg:grid-cols-2">
        {group.items.map((item) => (
          <GalleryPreview key={item.name} item={item} preferences={preferences} />
        ))}
      </div>
    </section>
  )
}
