import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { ApprovalCard } from "./ApprovalCard"
import { AnswerActions } from "./AnswerActions"

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

describe("AnswerActions", () => {
  test("shows copy and follow-ups after the answer settles", () => {
    const html = renderToStaticMarkup(
      <AnswerActions text="The scoop is ready.\nWant tests next?" retryPrompt="ship it" />
    )
    expect(html).toContain("Follow-ups")
    expect(html).toContain("Want tests next?")
    expect(html).toContain("Retry")
  })

  test("hides while streaming", () => {
    const html = renderToStaticMarkup(
      <AnswerActions text="partial" streaming />
    )
    expect(html).toBe("")
  })
})
