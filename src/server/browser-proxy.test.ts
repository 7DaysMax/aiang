import { describe, expect, test } from "bun:test"
import {
  BROWSER_PROXY_PATH,
  handleBrowserProxy,
  isBrowserProxyRequest,
  rewriteCssUrls,
  rewriteHtmlDocument,
} from "./browser-proxy"

const page = new URL("https://example.com/docs/page.html")

describe("isBrowserProxyRequest", () => {
  test("matches only the proxy path", () => {
    expect(isBrowserProxyRequest(new URL("http://localhost:5174/api/browser-proxy"))).toBe(true)
    expect(isBrowserProxyRequest(new URL("http://localhost:5174/api/browser-proxy?url=x"))).toBe(true)
    expect(isBrowserProxyRequest(new URL("http://localhost:5174/api/projects"))).toBe(false)
    expect(isBrowserProxyRequest(new URL("http://localhost:5174/"))).toBe(false)
  })
})

describe("rewriteHtmlDocument", () => {
  test("rewrites href/src/action/poster attributes to proxy URLs", () => {
    const html = `<a href="guide.html">Guide</a>
<img src="/assets/logo.png" alt="">
<form action="/login" method="post"></form>
<video poster="thumb.jpg"></video>
<link rel="stylesheet" href="../style.css">`
    const out = rewriteHtmlDocument(html, page)
    expect(out).toContain(`href="${BROWSER_PROXY_PATH}?url=${encodeURIComponent("https://example.com/docs/guide.html")}"`)
    expect(out).toContain(`src="${BROWSER_PROXY_PATH}?url=${encodeURIComponent("https://example.com/assets/logo.png")}"`)
    expect(out).toContain(`action="${BROWSER_PROXY_PATH}?url=${encodeURIComponent("https://example.com/login")}"`)
    expect(out).toContain(`poster="${BROWSER_PROXY_PATH}?url=${encodeURIComponent("https://example.com/docs/thumb.jpg")}"`)
    expect(out).toContain(`href="${BROWSER_PROXY_PATH}?url=${encodeURIComponent("https://example.com/style.css")}"`)
  })

  test("leaves javascript/data/mailto/anchor URLs untouched", () => {
    const html = `<a href="javascript:void(0)">a</a>
<img src="data:image/png;base64,AAAA" alt="">
<a href="mailto:hi@example.com">mail</a>
<a href="#section">anchor</a>`
    const out = rewriteHtmlDocument(html, page)
    expect(out).toContain(`href="javascript:void(0)"`)
    expect(out).toContain(`src="data:image/png;base64,AAAA"`)
    expect(out).toContain(`href="mailto:hi@example.com"`)
    expect(out).toContain(`href="#section"`)
  })

  test("rewrites srcset candidates", () => {
    const html = `<img srcset="a.png 1x, /images/b.png 2x" src="a.png">`
    const out = rewriteHtmlDocument(html, page)
    expect(out).toContain(`${BROWSER_PROXY_PATH}?url=${encodeURIComponent("https://example.com/docs/a.png")} 1x`)
    expect(out).toContain(`${BROWSER_PROXY_PATH}?url=${encodeURIComponent("https://example.com/images/b.png")} 2x`)
  })

  test("rewrites css url() in style attributes and style blocks", () => {
    const html = `<div style="background: url(bg.png)"></div>
<style>.x { background-image: url("../img/hero.webp"); }</style>`
    const out = rewriteHtmlDocument(html, page)
    expect(out).toContain(`style="background: url(${BROWSER_PROXY_PATH}?url=${encodeURIComponent("https://example.com/docs/bg.png")})"`)
    expect(out).toContain(`url("${BROWSER_PROXY_PATH}?url=${encodeURIComponent("https://example.com/img/hero.webp")}")`)
  })

  test("removes base tags and CSP meta tags", () => {
    const html = `<base href="https://evil.example/"><meta http-equiv="Content-Security-Policy" content="frame-ancestors 'none'">`
    const out = rewriteHtmlDocument(html, page)
    expect(out).not.toContain("<base")
    expect(out).not.toContain("Content-Security-Policy")
  })

  test("rewrites meta refresh urls and drops integrity attributes", () => {
    const html = `<meta http-equiv="refresh" content="0; url=/new-home">
<script src="app.js" integrity="sha256-abc"></script>`
    const out = rewriteHtmlDocument(html, page)
    expect(out).toContain(`${BROWSER_PROXY_PATH}?url=${encodeURIComponent("https://example.com/new-home")}`)
    expect(out).not.toContain("integrity=")
    expect(out).toContain(`${BROWSER_PROXY_PATH}?url=${encodeURIComponent("https://example.com/docs/app.js")}`)
  })
})

describe("rewriteCssUrls", () => {
  test("rewrites url() and @import to proxy URLs", () => {
    const css = `@import "theme.css";
.a { background: url(./img/a.png); }
.b { background: url("https://cdn.example.com/x.png"); }
.c { background: url(data:image/png;base64,AAAA); }`
    const out = rewriteCssUrls(css, page)
    expect(out).toContain(`${BROWSER_PROXY_PATH}?url=${encodeURIComponent("https://example.com/docs/theme.css")}`)
    expect(out).toContain(`${BROWSER_PROXY_PATH}?url=${encodeURIComponent("https://example.com/docs/img/a.png")}`)
    expect(out).toContain(`${BROWSER_PROXY_PATH}?url=${encodeURIComponent("https://cdn.example.com/x.png")}`)
    expect(out).toContain("url(data:image/png;base64,AAAA)")
  })
})

describe("handleBrowserProxy", () => {
  function stubFetch(response: Response): typeof fetch {
    return (() => Promise.resolve(response)) as unknown as typeof fetch
  }

  test("strips X-Frame-Options and CSP from html responses and rewrites links", async () => {
    const html = `<!doctype html><html><head>
      <meta http-equiv="Content-Security-Policy" content="frame-ancestors 'none'">
      <link rel="stylesheet" href="/app.css">
    </head><body><a href="/next">Next</a><img src="pic.png"></body></html>`
    const upstream = new Response(html, {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "x-frame-options": "DENY",
        "content-security-policy": "frame-ancestors 'none'",
      },
    })

    const req = new Request("http://localhost:5174/api/browser-proxy?url=https%3A%2F%2Fdocs.example.com%2Fstart")
    const response = await handleBrowserProxy(req, new URL(req.url), { fetchImpl: stubFetch(upstream) })

    expect(response).not.toBeNull()
    expect(response!.status).toBe(200)
    expect(response!.headers.get("x-frame-options")).toBeNull()
    expect(response!.headers.get("content-security-policy")).toBeNull()
    const body = await response!.text()
    expect(body).toContain(`${BROWSER_PROXY_PATH}?url=${encodeURIComponent("https://docs.example.com/app.css")}`)
    expect(body).toContain(`${BROWSER_PROXY_PATH}?url=${encodeURIComponent("https://docs.example.com/next")}`)
    expect(body).toContain(`${BROWSER_PROXY_PATH}?url=${encodeURIComponent("https://docs.example.com/pic.png")}`)
    expect(body).toContain("__aiangBrowserProxy")
  })

  test("forwards form posts with their body", async () => {
    let captured: { url: string; method: string; body: string; contentType: string | null } | null = null
    const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      captured = {
        url: String(input),
        method: init?.method ?? "GET",
        body: init?.body ? new TextDecoder().decode(init.body as ArrayBuffer) : "",
        contentType: init?.headers ? new Headers(init.headers).get("content-type") : null,
      }
      return new Response("<html><body>ok</body></html>", { headers: { "content-type": "text/html" } })
    }) as typeof fetch

    const formBody = "user=eason&action=save"
    const req = new Request("http://localhost:5174/api/browser-proxy?url=https%3A%2F%2Fexample.com%2Fsubmit", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: formBody,
    })
    await handleBrowserProxy(req, new URL(req.url), { fetchImpl })

    expect(captured).not.toBeNull()
    expect(captured!.url).toBe("https://example.com/submit")
    expect(captured!.method).toBe("POST")
    expect(captured!.body).toBe(formBody)
    expect(captured!.contentType).toBe("application/x-www-form-urlencoded")
  })

  test("rejects non-http protocols and proxying the app itself", async () => {
    const req1 = new Request("http://localhost:5174/api/browser-proxy?url=file%3A%2F%2F%2Fetc%2Fpasswd")
    const r1 = await handleBrowserProxy(req1, new URL(req1.url))
    expect(r1!.status).toBe(502)

    const req2 = new Request("http://localhost:5174/api/browser-proxy?url=http%3A%2F%2Flocalhost%3A5174%2F")
    const r2 = await handleBrowserProxy(req2, new URL(req2.url))
    expect(r2!.status).toBe(502)
  })
})
