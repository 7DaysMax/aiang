/**
 * Server-side proxy for the built-in Browser panel.
 *
 * Many external sites refuse to render inside an <iframe> via
 * `X-Frame-Options` / CSP `frame-ancestors`. The panel loads
 * `/api/browser-proxy?url=<target>` instead of the raw URL: this module
 * fetches the page server-side, strips framing restrictions, and rewrites URL
 * attributes (links, scripts, styles, images, forms) so every subsequent
 * request keeps flowing through the proxy. Local dev servers (localhost) skip
 * the proxy and load directly in the panel.
 */

export const BROWSER_PROXY_PATH = "/api/browser-proxy"

const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"

const MAX_REWRITTEN_RESPONSE_BYTES = 25 * 1024 * 1024
const PROXY_TIMEOUT_MS = 20_000

const DROP_RESPONSE_HEADERS = new Set([
  "connection",
  "content-encoding",
  "content-length",
  "content-security-policy",
  "content-security-policy-report-only",
  "etag",
  "keep-alive",
  "last-modified",
  "location",
  "set-cookie",
  "transfer-encoding",
  "upgrade",
  "x-frame-options",
])

export function isBrowserProxyRequest(url: URL): boolean {
  return url.pathname === BROWSER_PROXY_PATH
}

export async function handleBrowserProxy(
  req: Request,
  requestUrl: URL,
  deps: { fetchImpl?: typeof fetch } = {}
): Promise<Response | null> {
  if (!isBrowserProxyRequest(requestUrl)) return null

  const target = requestUrl.searchParams.get("url")
  if (!target) {
    return proxyErrorPage("Missing ?url= parameter.")
  }

  let targetUrl: URL
  try {
    targetUrl = new URL(target)
  } catch {
    return proxyErrorPage(`Invalid URL: ${target.slice(0, 200)}`)
  }

  if (targetUrl.protocol !== "http:" && targetUrl.protocol !== "https:") {
    return proxyErrorPage(`Unsupported protocol: ${targetUrl.protocol}`)
  }

  // Never proxy back into this server (infinite-loop guard).
  if (targetUrl.host === requestUrl.host) {
    return proxyErrorPage("Cannot proxy the app itself.")
  }

  if (req.method !== "GET" && req.method !== "POST") {
    return new Response(null, { status: 405, headers: { Allow: "GET, POST" } })
  }

  const upstreamHeaders = new Headers()
  upstreamHeaders.set("user-agent", BROWSER_USER_AGENT)
  upstreamHeaders.set("accept", req.headers.get("accept") ?? "*/*")
  upstreamHeaders.set("accept-language", req.headers.get("accept-language") ?? "zh-CN,zh;q=0.9,en;q=0.8")
  const requestContentType = req.headers.get("content-type")
  if (req.method === "POST" && requestContentType) {
    upstreamHeaders.set("content-type", requestContentType)
  }

  let upstream: Response
  try {
    upstream = await (deps.fetchImpl ?? fetch)(targetUrl, {
      method: req.method,
      headers: upstreamHeaders,
      body: req.method === "POST" ? await req.arrayBuffer() : undefined,
      redirect: "follow",
      signal: AbortSignal.timeout(PROXY_TIMEOUT_MS),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return proxyErrorPage(`Failed to load ${targetUrl.host}: ${message}`)
  }

  const upstreamContentType = upstream.headers.get("content-type") ?? ""
  const mime = upstreamContentType.split(";")[0].trim().toLowerCase()
  const isHtml = mime === "text/html" || mime === "application/xhtml+xml"
  const isCss = mime === "text/css"

  const responseHeaders = new Headers()
  for (const [name, value] of upstream.headers) {
    if (DROP_RESPONSE_HEADERS.has(name.toLowerCase())) continue
    responseHeaders.set(name, value)
  }

  if (isHtml || isCss) {
    const bytes = new Uint8Array(await upstream.arrayBuffer())
    if (bytes.byteLength > MAX_REWRITTEN_RESPONSE_BYTES) {
      return proxyErrorPage(
        `Page too large (${Math.round(bytes.byteLength / 1024 / 1024)} MB, limit ${Math.round(MAX_REWRITTEN_RESPONSE_BYTES / 1024 / 1024)} MB).`
      )
    }

    let text: string
    try {
      const charsetMatch = upstreamContentType.match(/charset\s*=\s*["']?([^"';]+)/i)
      text = new TextDecoder(charsetMatch?.[1]?.trim() ?? "utf-8").decode(bytes)
    } catch {
      text = new TextDecoder("utf-8").decode(bytes)
    }

    const rewritten = isHtml
      ? rewriteHtmlDocument(text, targetUrl)
      : rewriteCssUrls(text, targetUrl)

    responseHeaders.set("content-type", upstreamContentType || (isHtml ? "text/html; charset=utf-8" : "text/css; charset=utf-8"))
    responseHeaders.set("cache-control", "no-store")
    return new Response(rewritten, { status: upstream.status, headers: responseHeaders })
  }

  // Binary / unknown content: stream through untouched (cookies still not
  // shared, so authed downloads may fail — acceptable for the panel).
  responseHeaders.set("cache-control", "no-store")
  return new Response(upstream.body, { status: upstream.status, headers: responseHeaders })
}

function proxyUrlFor(target: URL): string {
  return `${BROWSER_PROXY_PATH}?url=${encodeURIComponent(target.href)}`
}

interface RewriteOptions {
  pageUrl: URL
}

function rewriteUrlValue(raw: string, opts: RewriteOptions): string {
  const trimmed = raw.trim()
  if (!trimmed) return raw

  const lower = trimmed.toLowerCase()
  if (
    lower.startsWith("javascript:")
    || lower.startsWith("data:")
    || lower.startsWith("mailto:")
    || lower.startsWith("tel:")
    || lower.startsWith("sms:")
    || lower.startsWith("about:")
    || lower.startsWith("blob:")
    || trimmed.startsWith("#")
  ) {
    return raw
  }

  let candidate = trimmed.replace(/&amp;/gi, "&")
  if (candidate.startsWith("//")) {
    candidate = `${opts.pageUrl.protocol}${candidate}`
  }

  try {
    const resolved = new URL(candidate, opts.pageUrl)
    if (resolved.protocol !== "http:" && resolved.protocol !== "https:") return raw
    return proxyUrlFor(resolved)
  } catch {
    return raw
  }
}

function rewriteAttribute(output: string, attribute: string, opts: RewriteOptions): string {
  const pattern = new RegExp(`\\s${attribute}\\s*=\\s*(["'])(.*?)\\1`, "gi")
  return output.replace(pattern, (match, quote: string, value: string) => {
    return ` ${attribute}=${quote}${rewriteUrlValue(value, opts)}${quote}`
  })
}

export function rewriteHtmlDocument(html: string, pageUrl: URL): string {
  const opts = { pageUrl }

  // Remove <base> so remaining relative refs can't escape the proxy, and
  // strip CSP / refresh meta tags that would block or redirect framing.
  let output = html
    .replace(/<base\b[^>]*>/gi, "")
    .replace(/<meta\b[^>]*http-equiv\s*=\s*["']?content-security-policy["']?[^>]*>/gi, "")

  output = output.replace(/<meta\b[^>]*http-equiv\s*=\s*["']?refresh["']?[^>]*>/gi, (tag) => {
    return tag.replace(/(content\s*=\s*(["'])(.*?)\2)/i, (match, _all, quote: string, content: string) => {
      const next = content.replace(/(url\s*=\s*)([^;\s]+)/i, (prefixMatch, prefix: string, urlValue: string) => {
        return `${prefix}${rewriteUrlValue(urlValue, opts)}`
      })
      return `content=${quote}${next}${quote}`
    })
  })

  for (const attribute of ["href", "src", "action", "poster"]) {
    output = rewriteAttribute(output, attribute, opts)
  }

  output = output.replace(/\sdata\s*=\s*(["'])(.*?)\1/gi, (match, quote: string, value: string) => {
    // Only <object data="..."> carries a resource URL; other data= uses are
    // rare enough to keep proxying (harmless if it isn't a URL).
    return ` data=${quote}${rewriteUrlValue(value, opts)}${quote}`
  })

  output = output.replace(/\ssrcset\s*=\s*(["'])(.*?)\1/gi, (match, quote: string, value: string) => {
    const next = value
      .split(",")
      .map((candidate) => {
        const parts = candidate.trim().split(/\s+/)
        if (parts.length === 0) return candidate
        parts[0] = rewriteUrlValue(parts[0], opts)
        return parts.join(" ")
      })
      .join(", ")
    return ` srcset=${quote}${next}${quote}`
  })

  output = output.replace(/\sstyle\s*=\s*(["'])(.*?)\1/gi, (match, quote: string, value: string) => {
    return ` style=${quote}${rewriteCssUrls(value, pageUrl)}${quote}`
  })

  output = output.replace(/<style\b([^>]*)>([\s\S]*?)<\/style>/gi, (match, attrs: string, css: string) => {
    return `<style${attrs}>${rewriteCssUrls(css, pageUrl)}</style>`
  })

  // SRI hashes target the original resource URLs; drop them so proxied
  // subresources aren't rejected.
  output = output.replace(/\s+integrity\s*=\s*["'][^"']*["']/gi, "")

  return injectBrowserBeacon(output)
}

const BROWSER_BEACON = `<script>(function(){try{var ping=function(){var h=location.href;if(h&&window.parent&&window.parent!==window){window.parent.postMessage({__aiangBrowserProxy:h},"*")}};if(document.readyState==="complete"){ping()}else{window.addEventListener("load",ping)}}catch(e){}})()<\/script>`

function injectBrowserBeacon(html: string): string {
  if (html.includes("__aiangBrowserProxy")) return html
  const bodyEnd = html.lastIndexOf("</body>")
  if (bodyEnd === -1) return `${html}\n${BROWSER_BEACON}`
  return `${html.slice(0, bodyEnd)}${BROWSER_BEACON}${html.slice(bodyEnd)}`
}

export function rewriteCssUrls(css: string, pageUrl: URL): string {
  const opts = { pageUrl }
  return css
    .replace(/url\(\s*(['"]?)([^)'"]+)\1\s*\)/gi, (match, quote: string, urlValue: string) => {
      return `url(${quote}${rewriteUrlValue(urlValue, opts)}${quote})`
    })
    .replace(/@import\s+(['"])([^'"]+)\1/gi, (match, quote: string, urlValue: string) => {
      return `@import ${quote}${rewriteUrlValue(urlValue, opts)}${quote}`
    })
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
}

function proxyErrorPage(message: string): Response {
  const body = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <title>无法打开页面</title>
    <style>
      body { margin: 0; height: 100vh; display: flex; align-items: center; justify-content: center; background: #0b0b0f; color: #e5e5e5; font-family: system-ui, -apple-system, sans-serif; }
      .card { text-align: center; max-width: 420px; padding: 24px; }
      .icon { font-size: 40px; }
      h2 { margin: 12px 0 8px; font-size: 16px; }
      p { color: #9ca3af; font-size: 13px; line-height: 1.6; word-break: break-all; }
    </style>
  </head>
  <body>
    <div class="card">
      <div class="icon">🌐</div>
      <h2>无法打开页面</h2>
      <p>${escapeHtml(message)}</p>
    </div>
  </body>
</html>`
  return new Response(body, {
    status: 502,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  })
}
