// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { pushSubscriptionFindMany, pushSubscriptionDelete, stageProgressFindMany, sendNotification } =
  vi.hoisted(() => ({
    pushSubscriptionFindMany: vi.fn(),
    pushSubscriptionDelete: vi.fn(),
    stageProgressFindMany: vi.fn(),
    sendNotification: vi.fn(),
  }))

vi.mock('@/lib/db', () => ({
  db: {
    pushSubscription: { findMany: pushSubscriptionFindMany, delete: pushSubscriptionDelete },
    stageProgress: { findMany: stageProgressFindMany },
  },
}))

vi.mock('web-push', () => ({
  default: { setVapidDetails: vi.fn(), sendNotification },
}))

vi.mock('@/lib/env', () => ({
  env: {
    NEXT_PUBLIC_VAPID_PUBLIC_KEY: 'test-public-key',
    VAPID_PRIVATE_KEY: 'test-private-key',
    VAPID_SUBJECT: 'mailto:test@example.com',
  },
}))

import { findSubscriptionsNeedingReminder, sendDailyReminders } from '@/lib/push-server'

// 22:00 JST on 2026-07-04 — when the cron job fires.
const NOW = new Date('2026-07-04T22:00:00+09:00')

const sub = (id: string, userId: string) => ({
  id,
  userId,
  endpoint: `https://push.example.com/${id}`,
  p256dh: 'p256dh-key',
  auth: 'auth-key',
})

const activityFor = (userId: string) => ({
  segment: { project: { userId } },
})

beforeEach(() => {
  vi.clearAllMocks()
  pushSubscriptionDelete.mockResolvedValue({})
  sendNotification.mockResolvedValue({})
})

describe('findSubscriptionsNeedingReminder', () => {
  it('returns empty when there are no subscriptions', async () => {
    pushSubscriptionFindMany.mockResolvedValue([])
    expect(await findSubscriptionsNeedingReminder(NOW)).toEqual([])
    expect(stageProgressFindMany).not.toHaveBeenCalled()
  })

  it('excludes subscriptions of users who practiced today', async () => {
    pushSubscriptionFindMany.mockResolvedValue([sub('s1', 'user-active'), sub('s2', 'user-idle')])
    stageProgressFindMany.mockResolvedValue([activityFor('user-active')])

    const result = await findSubscriptionsNeedingReminder(NOW)
    expect(result.map((s) => s.id)).toEqual(['s2'])

    // Activity is scoped to the JST day start (13:00 previous day in UTC).
    const where = stageProgressFindMany.mock.calls[0]![0].where
    expect(where.updatedAt.gte.toISOString()).toBe('2026-07-03T15:00:00.000Z')
  })

  it('keeps all subscriptions when nobody practiced today', async () => {
    pushSubscriptionFindMany.mockResolvedValue([sub('s1', 'u1'), sub('s2', 'u2')])
    stageProgressFindMany.mockResolvedValue([])

    const result = await findSubscriptionsNeedingReminder(NOW)
    expect(result).toHaveLength(2)
  })
})

describe('sendDailyReminders', () => {
  it('sends one push per lapsed subscription and reports stats', async () => {
    pushSubscriptionFindMany.mockResolvedValue([sub('s1', 'u1'), sub('s2', 'u2')])
    stageProgressFindMany.mockResolvedValue([])

    const stats = await sendDailyReminders(NOW)
    expect(stats).toEqual({ subscriptions: 2, sent: 2, failed: 0, removed: 0 })
    expect(sendNotification).toHaveBeenCalledTimes(2)

    const [subscriptionArg, payloadArg] = sendNotification.mock.calls[0]!
    expect(subscriptionArg).toEqual({
      endpoint: 'https://push.example.com/s1',
      keys: { p256dh: 'p256dh-key', auth: 'auth-key' },
    })
    expect(JSON.parse(payloadArg)).toMatchObject({ url: '/' })
  })

  it('deletes subscriptions the push service reports as gone (410)', async () => {
    pushSubscriptionFindMany.mockResolvedValue([sub('s1', 'u1'), sub('s2', 'u2')])
    stageProgressFindMany.mockResolvedValue([])
    sendNotification
      .mockRejectedValueOnce(Object.assign(new Error('gone'), { statusCode: 410 }))
      .mockResolvedValueOnce({})

    const stats = await sendDailyReminders(NOW)
    expect(stats).toEqual({ subscriptions: 2, sent: 1, failed: 0, removed: 1 })
    expect(pushSubscriptionDelete).toHaveBeenCalledWith({ where: { id: 's1' } })
  })

  it('counts transient failures without deleting the subscription', async () => {
    pushSubscriptionFindMany.mockResolvedValue([sub('s1', 'u1')])
    stageProgressFindMany.mockResolvedValue([])
    sendNotification.mockRejectedValueOnce(Object.assign(new Error('server'), { statusCode: 500 }))

    const stats = await sendDailyReminders(NOW)
    expect(stats).toEqual({ subscriptions: 1, sent: 0, failed: 1, removed: 0 })
    expect(pushSubscriptionDelete).not.toHaveBeenCalled()
  })
})
