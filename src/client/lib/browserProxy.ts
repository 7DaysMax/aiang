/**
 * Built-in Browser panel URL helpers.
 *
 * External sites are loaded through the server-side proxy
 * (`/api/browser-proxy`) so they can render inside the panel's iframe even
 * when the origin sends X-Frame-Options / CSP frame-ancestors. Local dev
 * servers stay direct.
 */

export const BROWSER_PROXY_PATH = "/api/browser-proxy"

export function isLocalHostname(hostname: string): boolean {
  return (
    hostname === "localhost"
    || hostname === "127.0.0.1"
    || hostname === "::1"
    || hostname === "0.0.0.0"
    || hostname.endsWith(".localhost")
  )
}

export function browserProxyUrl(address: string): string | null {
  if (!address) return null

  let url: URL
  try {
    url = new URL(address)
  } catch {
    return null
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") return null
  if (isLocalHostname(url.hostname)) return null

  return `${BROWSER_PROXY_PATH}?url=${encodeURIComponent(url.href)}`
}
