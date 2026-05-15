import { describe, expect, it } from 'vitest'

import {
  extractAccessTokenFromCookies,
  inspectAccessToken,
  isSupabaseAuthCookieName,
} from '@/lib/auth-cookies'

function base64UrlEncode(input: string): string {
  return Buffer.from(input, 'utf-8')
    .toString('base64')
    .replace(/=+$/u, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
}

function makeJwt(payload: Record<string, unknown>): string {
  const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const body = base64UrlEncode(JSON.stringify(payload))
  return `${header}.${body}.signature`
}

function makeCookieValue(accessToken: string | null): string {
  const json = JSON.stringify({ access_token: accessToken })
  return 'base64-' + Buffer.from(json, 'utf-8').toString('base64')
}

describe('isSupabaseAuthCookieName', () => {
  it('matches Supabase auth cookies', () => {
    expect(isSupabaseAuthCookieName('sb-xyz-auth-token')).toBe(true)
    expect(isSupabaseAuthCookieName('sb-xyz-auth-token.0')).toBe(true)
  })
  it('rejects unrelated cookies', () => {
    expect(isSupabaseAuthCookieName('next-locale')).toBe(false)
  })
})

describe('extractAccessTokenFromCookies', () => {
  it('returns null when no auth cookies present', () => {
    expect(extractAccessTokenFromCookies([{ name: 'foo', value: 'bar' }])).toBeNull()
  })

  it('reassembles chunked cookies and decodes base64 wrapper', () => {
    const token = makeJwt({ exp: 9999999999 })
    const full = makeCookieValue(token)
    const mid = Math.floor(full.length / 2)
    const cookies = [
      { name: 'sb-test-auth-token.1', value: full.slice(mid) },
      { name: 'sb-test-auth-token.0', value: full.slice(0, mid) },
    ]
    expect(extractAccessTokenFromCookies(cookies)).toBe(token)
  })

  it('returns null on malformed cookie content', () => {
    expect(
      extractAccessTokenFromCookies([{ name: 'sb-x-auth-token', value: 'not json' }]),
    ).toBeNull()
  })
})

describe('inspectAccessToken', () => {
  it('reports missing for null token', () => {
    expect(inspectAccessToken(null)).toBe('missing')
  })
  it('reports invalid for non-jwt', () => {
    expect(inspectAccessToken('abc')).toBe('invalid')
  })
  it('reports valid when exp in the future', () => {
    const token = makeJwt({ exp: 9999999999 })
    expect(inspectAccessToken(token, 1_000_000)).toBe('valid')
  })
  it('reports expired when exp in the past', () => {
    const token = makeJwt({ exp: 100 })
    expect(inspectAccessToken(token, 9_999_999)).toBe('expired')
  })
  it('reports invalid when exp missing', () => {
    const token = makeJwt({ sub: 'abc' })
    expect(inspectAccessToken(token)).toBe('invalid')
  })
})
