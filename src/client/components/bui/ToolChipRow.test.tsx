import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { ToolChipRow } from "./ToolChipRow"
import { DiffChips } from "./DiffChips"

describe("ToolChipRow", () => {
  test("renders label, mono chip, and pending spinner", () => {
    const html = renderToStaticMarkup(
      <ToolChipRow icon="run" label="运行" chip="npm run freeze" pending detail={[{ text: "running…" }]} detailMono />
    )
    expect(html).toContain("运行")
    expect(html).toContain("npm run freeze")
    expect(html).toContain("rounded-chip")
    expect(html).toContain("bg-field")
    expect(html).toContain("font-mono")
    expect(html).toContain("running…")
  })

  test("keeps compact detail lines in the tree so expand is only a grid open", () => {
    const html = renderToStaticMarkup(
      <ToolChipRow
        icon="write"
        label="写入 204 行"
        chip="churn.ts"
        detail={[
          { text: "+ const windows = slots.filter((s) => s.temp <= -12)", tone: "add" },
          { text: "+ return schedule(windows, { hero: \"pistachio\" })", tone: "add" },
        ]}
        detailMono
      />
    )
    expect(html).toContain("写入 204 行")
    expect(html).toContain("churn.ts")
    expect(html).toContain("+ const windows")
    expect(html).toContain("text-green")
    expect(html).toContain("border-l")
  })
})

describe("DiffChips", () => {
  test("renders file chips with add/del counts", () => {
    const html = renderToStaticMarkup(
      <DiffChips
        files={[
          { file: "flavors.css", add: 13, del: 0 },
          { file: "ChurnSchedule.tsx", add: 74, del: 41 },
        ]}
      />
    )
    expect(html).toContain("flavors.css")
    expect(html).toContain("ChurnSchedule.tsx")
    expect(html).toContain("+13")
    expect(html).toContain("+74")
    expect(html).toContain("−41")
    expect(html).toContain("data-diffchip")
  })

  test("collapses extra files behind +N more", () => {
    const html = renderToStaticMarkup(
      <DiffChips
        maxVisible={2}
        files={[
          { file: "a.ts", add: 1, del: 0 },
          { file: "b.ts", add: 1, del: 0 },
          { file: "c.ts", add: 1, del: 0 },
        ]}
      />
    )
    expect(html).toContain("+1 more")
    expect(html).not.toContain(">c.ts<")
  })
})
