import type { VisionProviderKind } from "./types"

/** 识图服务商预设（设置 UI 与服务端共用）。 */
export const VISION_PROVIDER_PRESETS: Record<
  VisionProviderKind,
  { label: string; baseUrl: string; model: string; siteUrl: string }
> = {
  qwen: {
    label: "千问 (DashScope)",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    model: "qwen-vl-max-latest",
    siteUrl: "https://dashscope.console.aliyun.com/",
  },
  glm: {
    label: "GLM (智谱 BigModel)",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    model: "glm-4v-flash",
    siteUrl: "https://open.bigmodel.cn/",
  },
}
