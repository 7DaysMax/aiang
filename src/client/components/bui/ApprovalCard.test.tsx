import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import ApprovalCard from "@/components/primitives/ApprovalCard"
import { LiveStreamingText } from "@/components/primitives/StreamingText"

describe("ApprovalCard", () => {
  test("renders the first question with Continue and rolling step count", () => {
    const html = renderToStaticMarkup(
      <ApprovalCard
        questions={[
          { key: "q1", question: "How many flavors should we launch?", options: [{ label: "Three" }, { label: "Five" }] },
          { key: "q2", question: "Which market?", options: [{ label: "Food trucks" }] },
        ]}
        onSubmit={() => undefined}
      />
    )
    expect(html).toContain("How many flavors should we launch?")
    expect(html).toContain("Three")
    expect(html).toContain("Continue")
    expect(html).toContain(">1<")
    expect(html).toContain(">/<")
    expect(html).toContain(">2<")
    expect(html).toContain("Something else")
  })
})

describe("LiveStreamingText", () => {
  test("shows compact answer actions without generated follow-ups", () => {
    const html = renderToStaticMarkup(
      <LiveStreamingText text="The scoop is ready.\nWant tests next?" retryPrompt="ship it">The scoop is ready.</LiveStreamingText>
    )
    expect(html).not.toContain("接下来")
    expect(html).toContain("Retry")
  })

  test("hides while streaming", () => {
    const html = renderToStaticMarkup(
      <LiveStreamingText text="partial" streaming>partial</LiveStreamingText>
    )
    expect(html).toContain("partial")
    expect(html).not.toContain('aria-label="Copy"')
  })
})
