// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  projectDeleteMany,
  pushSubscriptionDeleteMany,
  streakMakeupDeleteMany,
  rateLimitHitDeleteMany,
  userUpdate,
  transaction,
  listStorageObjectKeys,
  removeStorageObjects,
} = vi.hoisted(() => ({
  projectDeleteMany: vi.fn(),
  pushSubscriptionDeleteMany: vi.fn(),
  streakMakeupDeleteMany: vi.fn(),
  rateLimitHitDeleteMany: vi.fn(),
  userUpdate: vi.fn(),
  transaction: vi.fn(),
  listStorageObjectKeys: vi.fn(),
  removeStorageObjects: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  db: {
    project: { deleteMany: projectDeleteMany },
    pushSubscription: { deleteMany: pushSubscriptionDeleteMany },
    streakMakeup: { deleteMany: streakMakeupDeleteMany },
    rateLimitHit: { deleteMany: rateLimitHitDeleteMany },
    user: { update: userUpdate },
    $transaction: transaction,
  },
}))
vi.mock('@/lib/storage', () => ({ listStorageObjectKeys, removeStorageObjects }))
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: vi.fn().mockResolvedValue({}),
}))

import { deleteAccount } from '@/lib/account-deletion'

const USER = { id: 'user-1', supabaseUserId: 'sb-user-1' }

describe('deleteAccount', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    listStorageObjectKeys.mockResolvedValue([])
    removeStorageObjects.mockResolvedValue(undefined)
    transaction.mockImplementation((ops: unknown[]) => Promise.resolve(ops))
  })

  it('clears every table that holds the account, in one transaction', async () => {
    await deleteAccount(USER)

    expect(transaction).toHaveBeenCalledOnce()
    expect(projectDeleteMany).toHaveBeenCalledWith({ where: { userId: 'user-1' } })
    expect(pushSubscriptionDeleteMany).toHaveBeenCalledWith({ where: { userId: 'user-1' } })
    expect(streakMakeupDeleteMany).toHaveBeenCalledWith({ where: { userId: 'user-1' } })
    // RateLimitHit has no foreign key, so nothing cascades to it — it would be
    // silently left behind if this were dropped.
    expect(rateLimitHitDeleteMany).toHaveBeenCalledWith({ where: { userId: 'user-1' } })
  })

  it('leaves a tombstone rather than removing the row', async () => {
    await deleteAccount(USER)

    const args = userUpdate.mock.calls[0][0]
    expect(args.where).toEqual({ id: 'user-1' })
    expect(args.data.deletedAt).toBeInstanceOf(Date)
    // Without the surviving row the same Supabase identity would sign straight
    // back in and be handed a brand-new account.
    expect(userUpdate).toHaveBeenCalledOnce()
  })

  it('sweeps the account own storage prefix and nothing else', async () => {
    listStorageObjectKeys.mockResolvedValue([
      'sb-user-1/projects/p1/audio/a.mp3',
      'sb-user-1/recordings/seg-1/4/0/ref.mp3',
    ])

    const result = await deleteAccount(USER)

    // Scoped to the learner's own prefix, which is why the shared sample under
    // examples/ cannot be caught up in it.
    expect(listStorageObjectKeys).toHaveBeenCalledWith({
      client: expect.anything(),
      prefix: 'sb-user-1',
    })
    expect(removeStorageObjects).toHaveBeenCalledWith({
      client: expect.anything(),
      objectKeys: [
        'sb-user-1/projects/p1/audio/a.mp3',
        'sb-user-1/recordings/seg-1/4/0/ref.mp3',
      ],
    })
    expect(result.removedStorageObjects).toBe(2)
    expect(result.storageFailed).toBe(false)
  })

  it('batches large sweeps instead of sending one huge request', async () => {
    listStorageObjectKeys.mockResolvedValue(
      Array.from({ length: 250 }, (_, index) => `sb-user-1/f${index}.mp3`),
    )

    const result = await deleteAccount(USER)

    expect(removeStorageObjects).toHaveBeenCalledTimes(3)
    expect(result.removedStorageObjects).toBe(250)
  })

  it('still deletes the account when the storage sweep fails', async () => {
    // A stuck file must never trap someone in an account they asked to leave.
    listStorageObjectKeys.mockRejectedValue(new Error('storage down'))
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = await deleteAccount(USER)

    expect(result.storageFailed).toBe(true)
    expect(transaction).toHaveBeenCalledOnce()
    expect(userUpdate).toHaveBeenCalledOnce()
  })

  it('removes storage before the rows, so a failed sweep is still traceable', async () => {
    const order: string[] = []
    listStorageObjectKeys.mockImplementation(() => {
      order.push('storage')
      return Promise.resolve([])
    })
    transaction.mockImplementation((ops: unknown[]) => {
      order.push('db')
      return Promise.resolve(ops)
    })

    await deleteAccount(USER)

    expect(order).toEqual(['storage', 'db'])
  })
})
