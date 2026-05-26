import { describe, expect, it, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockGetUser = vi.fn()

vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({
    auth: { getUser: mockGetUser },
  }),
}))

const { proxy } = await import('@/proxy')

function makeRequest(
  pathname: string,
  cookieHeader = '',
): NextRequest {
  const headers = new Headers()
  if (cookieHeader) headers.set('cookie', cookieHeader)
  return new NextRequest(new URL(pathname, 'http://localhost:3000'), { headers })
}

describe('proxy', () => {
  beforeEach(() => {
    mockGetUser.mockReset()
  })

  it('passes through public /login route without calling getUser', async () => {
    const res = await proxy(makeRequest('/login'))
    expect(res.status).toBe(200)
    expect(res.headers.get('location')).toBeNull()
    expect(mockGetUser).not.toHaveBeenCalled()
  })

  it('redirects unauthenticated page requests to /login with next', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null })
    const res = await proxy(makeRequest('/projects/abc'))
    expect(res.status).toBe(307)
    const location = res.headers.get('location') ?? ''
    expect(location).toContain('/login')
    expect(location).toContain('next=%2Fprojects%2Fabc')
  })

  it('returns 401 JSON for unauthenticated /api requests', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null })
    const res = await proxy(makeRequest('/api/projects'))
    expect(res.status).toBe(401)
    const body = (await res.json()) as { code?: string }
    expect(body.code).toBe('auth_required')
  })

  it('passes through when getUser returns a valid user', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-1', email: 'test@example.com' } },
      error: null,
    })
    const res = await proxy(makeRequest('/'))
    expect(res.status).toBe(200)
    expect(res.headers.get('location')).toBeNull()
  })

  it('clears auth cookies on unauthenticated page request', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null })
    const res = await proxy(makeRequest('/projects', 'sb-test-auth-token=stale'))
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('/login')
    const setCookie = res.headers.get('set-cookie') ?? ''
    expect(setCookie).toContain('sb-test-auth-token=')
  })
})
