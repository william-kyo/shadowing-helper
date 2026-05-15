import { describe, expect, it } from 'vitest'
import { NextRequest } from 'next/server'

import { proxy } from '@/proxy'

function base64UrlEncode(input: string): string {
  return Buffer.from(input, 'utf-8')
    .toString('base64')
    .replace(/=+$/u, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
}

function makeJwt(exp: number): string {
  const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const body = base64UrlEncode(JSON.stringify({ exp, sub: 'user-1' }))
  return `${header}.${body}.signature`
}

function makeCookieValue(accessToken: string): string {
  const json = JSON.stringify({ access_token: accessToken })
  return 'base64-' + Buffer.from(json, 'utf-8').toString('base64')
}

function makeRequest(
  pathname: string,
  cookieHeader = '',
): NextRequest {
  const headers = new Headers()
  if (cookieHeader) headers.set('cookie', cookieHeader)
  return new NextRequest(new URL(pathname, 'http://localhost:3000'), { headers })
}

describe('proxy', () => {
  it('passes through public /login route', () => {
    const res = proxy(makeRequest('/login'))
    expect(res.status).toBe(200)
    expect(res.headers.get('location')).toBeNull()
  })

  it('redirects unauthenticated page requests to /login with next', () => {
    const res = proxy(makeRequest('/projects/abc'))
    expect(res.status).toBe(307)
    const location = res.headers.get('location') ?? ''
    expect(location).toContain('/login')
    expect(location).toContain('next=%2Fprojects%2Fabc')
  })

  it('returns 401 JSON for unauthenticated /api requests', async () => {
    const res = proxy(makeRequest('/api/projects'))
    expect(res.status).toBe(401)
    const body = (await res.json()) as { code?: string }
    expect(body.code).toBe('auth_required')
  })

  it('passes through requests with a valid token', () => {
    const future = Math.floor(Date.now() / 1000) + 3600
    const cookieValue = makeCookieValue(makeJwt(future))
    const res = proxy(makeRequest('/', `sb-test-auth-token=${cookieValue}`))
    expect(res.status).toBe(200)
    expect(res.headers.get('location')).toBeNull()
  })

  it('redirects when token is expired and clears cookies', () => {
    const past = Math.floor(Date.now() / 1000) - 60
    const cookieValue = makeCookieValue(makeJwt(past))
    const res = proxy(makeRequest('/projects', `sb-test-auth-token=${cookieValue}`))
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('/login')
    const setCookie = res.headers.get('set-cookie') ?? ''
    expect(setCookie).toContain('sb-test-auth-token=')
  })
})
