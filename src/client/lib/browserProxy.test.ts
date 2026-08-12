import { describe, expect, test } from "bun:test"
import { BROWSER_PROXY_PATH, browserProxyUrl, isLocalHostname } from "./browserProxy"

describe("isLocalHostname", () => {
  test("detects localhost variants", () => {
    expect(isLocalHostname("localhost")).toBe(true)
    expect(isLocalHostname("127.0.0.1")).toBe(true)
    expect(isLocalHostname("::1")).toBe(true)
    expect(isLocalHostname("0.0.0.0")).toBe(true)
    expect(isLocalHostname("app.localhost")).toBe(true)
    expect(isLocalHostname("example.com")).toBe(false)
    expect(isLocalHostname("192.168.1.10")).toBe(false)
  })
})

describe("browserProxyUrl", () => {
  test("proxies external http(s) URLs", () => {
    expect(browserProxyUrl("https://example.com/docs")).toBe(
      `${BROWSER_PROXY_PATH}?url=${encodeURIComponent("https://example.com/docs")}`
    )
    expect(browserProxyUrl("http://example.com/")).toContain("http%3A%2F%2Fexample.com%2F")
  })

  test("keeps local dev servers direct", () => {
    expect(browserProxyUrl("http://localhost:5175")).toBeNull()
    expect(browserProxyUrl("http://127.0.0.1:3000/app")).toBeNull()
  })

  test("ignores empty and non-http values", () => {
    expect(browserProxyUrl("")).toBeNull()
    expect(browserProxyUrl("file:///etc/passwd")).toBeNull()
    expect(browserProxyUrl("not a url")).toBeNull()
  })
})
