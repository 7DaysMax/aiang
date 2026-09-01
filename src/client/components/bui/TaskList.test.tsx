import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { TaskList } from "./TaskList"

describe("TaskList", () => {
  test("renders capsule rows with completed and running pills", () => {
    const html = renderToStaticMarkup(
      <TaskList
        items={[
          { content: "Verify vendors", status: "completed", activeForm: "Verifying vendors" },
          { content: "Build reorder list", status: "in_progress", activeForm: "Building reorder list" },
          { content: "Draft emails", status: "pending", activeForm: "Drafting emails" },
        ]}
      />
    )
    expect(html).toContain("Verify vendors")
    expect(html).toContain("Building reorder list")
    expect(html).toContain("Draft emails")
    expect(html).toContain("Completed")
    expect(html).toContain("Running")
    expect(html).toContain("shadow-card")
    expect(html).toContain('aria-expanded="true"')
  })
})
