import { describe, expect, it } from 'vitest'

import { isCrossSiteRequest } from '@/lib/csrf'

const HOST = 'shadowing.fanchiikawa.com'

function req(overrides: Partial<Parameters<typeof isCrossSiteRequest>[0]> = {}) {
  return {
    method: 'POST',
    origin: null,
    secFetchSite: null,
    requestHost: HOST,
    ...overrides,
  }
}

describe('isCrossSiteRequest', () => {
  it('never blocks safe methods, even with a foreign origin', () => {
    for (const method of ['GET', 'HEAD', 'OPTIONS', 'get']) {
      expect(
        isCrossSiteRequest(req({ method, origin: 'https://evil.example', secFetchSite: 'cross-site' })),
      ).toBe(false)
    }
  })

  it('allows a mutating request whose Origin matches the request host', () => {
    expect(isCrossSiteRequest(req({ origin: `https://${HOST}` }))).toBe(false)
  })

  it('blocks a mutating request whose Origin is another site', () => {
    expect(isCrossSiteRequest(req({ origin: 'https://evil.example' }))).toBe(true)
    expect(isCrossSiteRequest(req({ method: 'DELETE', origin: 'https://evil.example' }))).toBe(true)
    expect(isCrossSiteRequest(req({ method: 'PATCH', origin: 'https://evil.example' }))).toBe(true)
  })

  it('blocks an opaque or malformed Origin on a mutating request', () => {
    // Sandboxed iframes / some redirects send the literal string "null".
    expect(isCrossSiteRequest(req({ origin: 'null' }))).toBe(true)
    expect(isCrossSiteRequest(req({ origin: 'not a url' }))).toBe(true)
  })

  it('decides by Origin when both headers are present', () => {
    // Origin matches → allowed even if the fetch metadata looks odd.
    expect(isCrossSiteRequest(req({ origin: `https://${HOST}`, secFetchSite: 'cross-site' }))).toBe(false)
  })

  it('falls back to Sec-Fetch-Site when Origin is absent', () => {
    expect(isCrossSiteRequest(req({ secFetchSite: 'cross-site' }))).toBe(true)
    expect(isCrossSiteRequest(req({ secFetchSite: 'same-origin' }))).toBe(false)
    expect(isCrossSiteRequest(req({ secFetchSite: 'same-site' }))).toBe(false)
    // Direct navigation / address bar.
    expect(isCrossSiteRequest(req({ secFetchSite: 'none' }))).toBe(false)
  })

  it('passes header-less clients (curl, server-to-server, tests)', () => {
    expect(isCrossSiteRequest(req())).toBe(false)
  })

  it('does not block on Origin when the request host is unknown', () => {
    // Can't prove a mismatch without a host to compare against.
    expect(isCrossSiteRequest(req({ origin: 'https://evil.example', requestHost: null }))).toBe(false)
  })

  it('compares host including port', () => {
    expect(
      isCrossSiteRequest(req({ origin: 'http://localhost:3000', requestHost: 'localhost:3000' })),
    ).toBe(false)
    expect(
      isCrossSiteRequest(req({ origin: 'http://localhost:4000', requestHost: 'localhost:3000' })),
    ).toBe(true)
  })
})
