// Cross-site request detection for state-changing methods, used by the proxy
// (middleware) as defense-in-depth on top of SameSite=Lax session cookies.
//
// Philosophy: only block when the request PROVABLY comes from another site.
// Browsers attach `Origin` to every cross-origin (and most same-origin)
// POST/PUT/PATCH/DELETE, and `Sec-Fetch-Site` on all fetches. Non-browser
// clients (curl, tests, server-to-server) send neither and pass through —
// they carry no ambient cookie, so CSRF does not apply to them.

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

export function isCrossSiteRequest(params: {
  method: string
  // `Origin` request header, if any.
  origin: string | null
  // `Sec-Fetch-Site` request header, if any.
  secFetchSite: string | null
  // Host the request targets (x-forwarded-host behind a proxy, else host).
  requestHost: string | null
}): boolean {
  if (SAFE_METHODS.has(params.method.toUpperCase())) return false

  // Origin is the strongest signal — when present, decide solely on it.
  if (params.origin) {
    try {
      const originHost = new URL(params.origin).host
      return params.requestHost !== null && originHost !== params.requestHost
    } catch {
      // Malformed or opaque ("null") Origin on a mutating request: block.
      return true
    }
  }

  // No Origin — fall back to the fetch metadata hint. `same-origin`,
  // `same-site`, and `none` (direct navigation) are all acceptable.
  return params.secFetchSite === 'cross-site'
}
