import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { PROVIDERS } from "../../../shared/types"
import { ChatPreferenceControls } from "./ChatPreferenceControls"

describe("ChatPreferenceControls", () => {
  test("renders codex-specific controls and can omit plan mode", () => {
    const html = renderToStaticMarkup(
      <ChatPreferenceControls
        availableProviders={PROVIDERS}
        selectedProvider="codex"
        model="deepseek-v4-flash"
        modelOptions={{ reasoningEffort: "high", fastMode: true }}
        onProviderChange={() => {}}
        onModelChange={() => {}}
        onModelOptionChange={() => {}}
        includeMode={false}
      />
    )

    expect(html).toContain("Codex")
    expect(html).toContain("DeepSeek Flash")
    expect(html).toContain("High")
    // DeepSeek V4 无 fast mode：即使传了 fastMode 也不渲染快速模式开关。
    expect(html).not.toContain("快速模式")
    expect(html).not.toContain("Plan Mode")
  })

  test("hides the fast mode toggle for codex models without fast mode support", () => {
    const html = renderToStaticMarkup(
      <ChatPreferenceControls
        availableProviders={PROVIDERS}
        selectedProvider="codex"
        model="deepseek-v4-pro"
        modelOptions={{ reasoningEffort: "max", fastMode: false }}
        onProviderChange={() => {}}
        onModelChange={() => {}}
        onModelOptionChange={() => {}}
        includeMode={false}
      />
    )

    expect(html).toContain("DeepSeek Pro")
    expect(html).not.toContain("快速模式")
  })

  test("renders Max as a reasoning level for supported Codex engine models", () => {
    const html = renderToStaticMarkup(
      <ChatPreferenceControls
        availableProviders={PROVIDERS}
        selectedProvider="codex"
        model="deepseek-v4-pro"
        modelOptions={{ reasoningEffort: "max", fastMode: false }}
        onProviderChange={() => {}}
        onModelChange={() => {}}
        onModelOptionChange={() => {}}
        includeMode={false}
      />
    )

    expect(html).toContain("DeepSeek Pro")
    expect(html).toContain("Max")
  })

  test("renders claude plan mode controls when enabled", () => {
    const html = renderToStaticMarkup(
      <ChatPreferenceControls
        availableProviders={PROVIDERS}
        selectedProvider="claude"
        model="opus"
        modelOptions={{ reasoningEffort: "max", contextWindow: "1m" }}
        onProviderChange={() => {}}
        onModelChange={() => {}}
        onModelOptionChange={() => {}}
        mode="plan"
        onModeChange={() => {}}
        includeMode
      />
    )

    expect(html).toContain("Claude")
    expect(html).not.toContain("Claude Code")
    expect(html).toContain("Opus")
    expect(html).toContain("Max")
    expect(html).toContain("1M")
    expect(html).toContain("计划模式")
  })

  test("renders Fable as a Claude model option", () => {
    const html = renderToStaticMarkup(
      <ChatPreferenceControls
        availableProviders={PROVIDERS}
        selectedProvider="claude"
        model="fable"
        modelOptions={{ reasoningEffort: "high", contextWindow: "1m" }}
        onProviderChange={() => {}}
        onModelChange={() => {}}
        onModelOptionChange={() => {}}
        includeMode={false}
      />
    )

    expect(html).toContain("Fable")
    expect(html).toContain("High")
  })
})
