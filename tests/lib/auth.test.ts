// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  jwtVerify,
  createRemoteJWKSet,
  cookiesFn,
  userFindUnique,
  userCreate,
  userUpdate,
  provisionExampleProject,
  JWKS_SENTINEL,
} = vi.hoisted(() => {
  const JWKS_SENTINEL = { jwks: true }
  return {
    jwtVerify: vi.fn(),
    createRemoteJWKSet: vi.fn().mockReturnValue(JWKS_SENTINEL),
    cookiesFn: vi.fn(),
    userFindUnique: vi.fn(),
    userCreate: vi.fn(),
    userUpdate: vi.fn(),
    provisionExampleProject: vi.fn(),
    JWKS_SENTINEL,
  }
})

vi.mock('jose', () => ({ jwtVerify, createRemoteJWKSet }))
vi.mock('next/headers', () => ({ cookies: cookiesFn }))
vi.mock('next/navigation', () => ({ redirect: vi.fn() }))
vi.mock('@/lib/db', () => ({
  db: { user: { findUnique: userFindUnique, create: userCreate, update: userUpdate } },
}))
vi.mock('@/lib/example-project', () => ({ provisionExampleProject }))

import { getAccountState, getCurrentAppUser } from '@/lib/auth'

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

const EXISTING_USER = {
  id: 'app-1',
  supabaseUserId: 'sb-1',
  email: 'a@example.com',
  habitAchievedAt: null,
  deletedAt: null,
}

function authenticateAs(email = 'a@example.com') {
  jwtVerify.mockResolvedValue({
    payload: { sub: 'sb-1', email, role: 'authenticated' },
  })
}

describe('getCurrentAppUser JWT verification', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    cookiesFn.mockResolvedValue(cookieStoreWith('token-1'))
    userFindUnique.mockResolvedValue(EXISTING_USER)
    userCreate.mockResolvedValue(EXISTING_USER)
    userUpdate.mockResolvedValue(EXISTING_USER)
    provisionExampleProject.mockResolvedValue(undefined)
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
    expect(userFindUnique).not.toHaveBeenCalled()
    expect(userCreate).not.toHaveBeenCalled()
  })

  it('returns null when jwtVerify throws (bad audience/signature/expiry)', async () => {
    jwtVerify.mockRejectedValue(new Error('unexpected "aud" claim value'))

    const user = await getCurrentAppUser()

    expect(user).toBeNull()
    expect(userFindUnique).not.toHaveBeenCalled()
    expect(userCreate).not.toHaveBeenCalled()
  })

  it('returns null with no auth cookie at all', async () => {
    cookiesFn.mockResolvedValue(cookieStoreWith(null))

    const user = await getCurrentAppUser()

    expect(user).toBeNull()
    expect(jwtVerify).not.toHaveBeenCalled()
  })
})

describe('getCurrentAppUser example project seeding', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    cookiesFn.mockResolvedValue(cookieStoreWith('token-1'))
    userFindUnique.mockResolvedValue(EXISTING_USER)
    userCreate.mockResolvedValue({ ...EXISTING_USER, id: 'app-new' })
    userUpdate.mockResolvedValue(EXISTING_USER)
    provisionExampleProject.mockResolvedValue(undefined)
    authenticateAs()
  })

  it('seeds the sample project the first time an account is seen', async () => {
    userFindUnique.mockResolvedValue(null)

    const user = await getCurrentAppUser()

    expect(user).toMatchObject({ id: 'app-new' })
    expect(userCreate).toHaveBeenCalledOnce()
    expect(provisionExampleProject).toHaveBeenCalledWith('app-new')
  })

  it('never re-seeds an account that already exists', async () => {
    const user = await getCurrentAppUser()

    expect(user).toMatchObject({ id: 'app-1', email: 'a@example.com' })
    expect(userCreate).not.toHaveBeenCalled()
    expect(provisionExampleProject).not.toHaveBeenCalled()
  })

  it('still signs the user in when seeding the sample fails', async () => {
    userFindUnique.mockResolvedValue(null)
    provisionExampleProject.mockRejectedValue(new Error('storage down'))
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const user = await getCurrentAppUser()

    expect(user).toMatchObject({ id: 'app-new' })
  })

  it('reads back the winner when two first requests race to create the row', async () => {
    userFindUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(EXISTING_USER)
    userCreate.mockRejectedValue(new Error('unique constraint failed'))

    const user = await getCurrentAppUser()

    expect(user).toMatchObject({ id: 'app-1' })
    // The loser must not seed a second sample for the same account.
    expect(provisionExampleProject).not.toHaveBeenCalled()
  })

  it('refreshes a changed email without touching the sample', async () => {
    authenticateAs('new@example.com')

    await getCurrentAppUser()

    expect(userUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { email: 'new@example.com' } }),
    )
    expect(provisionExampleProject).not.toHaveBeenCalled()
  })
})

describe('deleted accounts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    cookiesFn.mockResolvedValue(cookieStoreWith('token-1'))
    provisionExampleProject.mockResolvedValue(undefined)
    authenticateAs()
  })

  it('reports a tombstone as deleted rather than as a live account', async () => {
    userFindUnique.mockResolvedValue({ ...EXISTING_USER, deletedAt: new Date() })

    await expect(getAccountState()).resolves.toEqual({ status: 'deleted', user: null })
  })

  it('resolves a deleted account to no user, so existing callers cannot leak it', async () => {
    userFindUnique.mockResolvedValue({ ...EXISTING_USER, deletedAt: new Date() })

    await expect(getCurrentAppUser()).resolves.toBeNull()
  })

  it('never revives the account by signing in again', async () => {
    // The Supabase identity still authenticates after deletion, so this is the
    // path a returning learner actually takes — it must not hand them an account.
    userFindUnique.mockResolvedValue({ ...EXISTING_USER, deletedAt: new Date() })

    await getAccountState()

    expect(userCreate).not.toHaveBeenCalled()
    expect(userUpdate).not.toHaveBeenCalled()
    expect(provisionExampleProject).not.toHaveBeenCalled()
  })

  it('does not refresh a changed email on a deleted account', async () => {
    userFindUnique.mockResolvedValue({ ...EXISTING_USER, deletedAt: new Date() })
    authenticateAs('renamed@example.com')

    await expect(getAccountState()).resolves.toEqual({ status: 'deleted', user: null })
    expect(userUpdate).not.toHaveBeenCalled()
  })

  it('still treats a live account as active', async () => {
    userFindUnique.mockResolvedValue({ ...EXISTING_USER, deletedAt: null })

    const state = await getAccountState()

    expect(state.status).toBe('active')
    expect(state.user).toMatchObject({ id: 'app-1' })
  })

  it('distinguishes anonymous from deleted', async () => {
    cookiesFn.mockResolvedValue(cookieStoreWith(null))

    await expect(getAccountState()).resolves.toEqual({ status: 'anonymous', user: null })
  })

  it('reports deleted when a race read comes back as a tombstone', async () => {
    userFindUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ ...EXISTING_USER, deletedAt: new Date() })
    userCreate.mockRejectedValue(new Error('unique constraint failed'))

    await expect(getAccountState()).resolves.toEqual({ status: 'deleted', user: null })
  })
})
