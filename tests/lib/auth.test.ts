// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { jwtVerify, createRemoteJWKSet, cookiesFn, userUpsert, JWKS_SENTINEL } = vi.hoisted(() => {
  const JWKS_SENTINEL = { jwks: true }
  return {
    jwtVerify: vi.fn(),
    createRemoteJWKSet: vi.fn().mockReturnValue(JWKS_SENTINEL),
    cookiesFn: vi.fn(),
    userUpsert: vi.fn(),
    JWKS_SENTINEL,
  }
})

vi.mock('jose', () => ({ jwtVerify, createRemoteJWKSet }))
vi.mock('next/headers', () => ({ cookies: cookiesFn }))
vi.mock('next/navigation', () => ({ redirect: vi.fn() }))
vi.mock('@/lib/db', () => ({ db: { user: { upsert: userUpsert } } }))

import { getCurrentAppUser } from '@/lib/auth'

// A Supabase SSR auth cookie carrying a plain-JSON session with access_token.
function cookieStoreWith(accessToken: string | null) {
  const all = accessToken
    ? [{ name: 'sb-test-auth-token', value: JSON.stringify({ access_token: accessToken }) }]
    : []
  return {
    getAll: () => all,
    delete: vi.fn(),
  }
}

describe('getCurrentAppUser JWT verification', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    cookiesFn.mockResolvedValue(cookieStoreWith('token-1'))
    userUpsert.mockResolvedValue({ id: 'app-1', supabaseUserId: 'sb-1', email: 'a@example.com' })
  })

  it('pins issuer, audience, and asymmetric algorithms on jwtVerify', async () => {
    jwtVerify.mockResolvedValue({
      payload: { sub: 'sb-1', email: 'a@example.com', role: 'authenticated' },
    })

    const user = await getCurrentAppUser()

    expect(user).toMatchObject({ supabaseUserId: 'sb-1' })
    expect(jwtVerify).toHaveBeenCalledWith(
      'token-1',
      JWKS_SENTINEL,
      expect.objectContaining({
        issuer: expect.stringContaining('/auth/v1'),
        audience: 'authenticated',
        algorithms: ['ES256', 'RS256'],
      }),
    )
  })

  it('rejects a validly-signed token whose role is not "authenticated"', async () => {
    jwtVerify.mockResolvedValue({
      payload: { sub: 'sb-1', email: 'a@example.com', role: 'service_role' },
    })

    const user = await getCurrentAppUser()

    expect(user).toBeNull()
    expect(userUpsert).not.toHaveBeenCalled()
  })

  it('returns null when jwtVerify throws (bad audience/signature/expiry)', async () => {
    jwtVerify.mockRejectedValue(new Error('unexpected "aud" claim value'))

    const user = await getCurrentAppUser()

    expect(user).toBeNull()
    expect(userUpsert).not.toHaveBeenCalled()
  })

  it('returns null with no auth cookie at all', async () => {
    cookiesFn.mockResolvedValue(cookieStoreWith(null))

    const user = await getCurrentAppUser()

    expect(user).toBeNull()
    expect(jwtVerify).not.toHaveBeenCalled()
  })
})
