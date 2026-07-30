import { beforeEach, describe, expect, it, vi } from 'vitest'

const { requireAppUserForApi, deleteAccount } = vi.hoisted(() => ({
  requireAppUserForApi: vi.fn(),
  deleteAccount: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({ requireAppUserForApi }))
vi.mock('@/lib/account-deletion', () => ({ deleteAccount }))

import { DELETE } from '@/app/api/account/route'
import ja from '@/lib/i18n/dictionaries/ja'

const request = () => new Request('http://localhost/api/account', { method: 'DELETE' })

describe('DELETE /api/account', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requireAppUserForApi.mockResolvedValue({
      user: { id: 'user-1', supabaseUserId: 'sb-1' },
      response: null,
    })
    deleteAccount.mockResolvedValue({ removedStorageObjects: 3, storageFailed: false })
  })

  it('deletes the caller own account and reports the sweep', async () => {
    const response = await DELETE(request())

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      success: true,
      removedStorageObjects: 3,
      storageFailed: false,
    })
    // Scoped to the authenticated caller — the route takes no user id from the
    // request, so one account can never delete another.
    expect(deleteAccount).toHaveBeenCalledWith({ id: 'user-1', supabaseUserId: 'sb-1' })
  })

  it('refuses an unauthenticated caller without deleting anything', async () => {
    requireAppUserForApi.mockResolvedValue({
      user: null,
      response: new Response('nope', { status: 401 }),
    })

    const response = await DELETE(request())

    expect(response?.status).toBe(401)
    expect(deleteAccount).not.toHaveBeenCalled()
  })

  it('succeeds while reporting a partial storage sweep', async () => {
    // A stuck file must not leave the learner unable to delete their account.
    deleteAccount.mockResolvedValue({ removedStorageObjects: 1, storageFailed: true })

    const response = await DELETE(request())

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({ success: true, storageFailed: true })
  })

  it('reports a failure rather than claiming the account is gone', async () => {
    deleteAccount.mockRejectedValue(new Error('db down'))
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const response = await DELETE(request())

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({ error: ja.account.deleteFailed })
  })
})
