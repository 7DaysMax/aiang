import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { DEFAULT_BEAUTIFUL_UI_PREFERENCES, type AppSettingsSnapshot } from "../../../shared/types"
import { AppearanceSection } from "./AppearanceSection"
import { BEAUTIFUL_UI_COMPONENT_COUNT, BEAUTIFUL_UI_GALLERY } from "./BeautifulUiGallery"

describe("AppearanceSection", () => {
  test("renders the live preview and every official variant control", () => {
    const html = renderToStaticMarkup(
      <AppearanceSection
        state={{
          appSettings: {
            beautifulUi: DEFAULT_BEAUTIFUL_UI_PREFERENCES,
          } as AppSettingsSnapshot,
          handleWriteAppSettings: async () => undefined,
        }}
      />,
    )

    expect(html).toContain("实时预览 · Loading State · Drive")
    expect(html).toContain('data-beautifului="loading-state"')
    for (const label of [
      "Drive", "Dots", "Orbit", "Surfer",
      "Steps", "Reasoning", "Search", "Coding",
      "Capsules", "List", "Rounded", "Pill", "Code", "Diff",
    ]) {
      expect(html).toContain(`>${label}<`)
    }
  })

  test("catalogs every Beautiful UI registry component across the preview categories", () => {
    const names = Object.values(BEAUTIFUL_UI_GALLERY).flatMap((group) => group.items.map((item) => item.name))

    expect(BEAUTIFUL_UI_COMPONENT_COUNT).toBe(20)
    expect(new Set(names).size).toBe(20)
    expect(names).toEqual(expect.arrayContaining([
      "Loading State",
      "Thinking",
      "Streaming Text",
      "Approval Card",
      "Tool Chips",
      "Task Rows",
      "Chat",
      "Prompt Bar",
      "Recommendation Card",
      "Context Cards",
      "Diff Table",
      "Records Table",
      "Filter Table",
      "Sidebar Nav",
      "Search",
      "Flowchart",
      "Insight Cards",
      "Code Block",
      "Fine-tune Card",
      "Selection Actions",
    ]))
  })
})
