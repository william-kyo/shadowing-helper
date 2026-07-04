// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { envState, ensureWebPushConfigured, sendDailyReminders } = vi.hoisted(() => ({
  envState: { CRON_SECRET: 'test-secret' as string | undefined },
  ensureWebPushConfigured: vi.fn(),
  sendDailyReminders: vi.fn(),
}))

vi.mock('@/lib/env', () => ({
  env: envState,
}))

vi.mock('@/lib/push-server', () => ({
  ensureWebPushConfigured,
  sendDailyReminders,
}))

import { POST } from '@/app/api/cron/notify/route'

function cronRequest(authorization?: string) {
  return new Request('http://localhost/api/cron/notify', {
    method: 'POST',
    headers: authorization ? { authorization } : {},
    body: '{}',
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  envState.CRON_SECRET = 'test-secret'
  ensureWebPushConfigured.mockReturnValue(true)
  sendDailyReminders.mockResolvedValue({ subscriptions: 3, sent: 2, failed: 0, removed: 1 })
})

describe('POST /api/cron/notify', () => {
  it('returns 503 when the cron secret is not configured', async () => {
    envState.CRON_SECRET = undefined
    const res = await POST(cronRequest('Bearer whatever'))
    expect(res.status).toBe(503)
    expect(sendDailyReminders).not.toHaveBeenCalled()
  })

  it('returns 503 when VAPID keys are not configured', async () => {
    ensureWebPushConfigured.mockReturnValue(false)
    const res = await POST(cronRequest('Bearer test-secret'))
    expect(res.status).toBe(503)
  })

  it('rejects a missing bearer token', async () => {
    const res = await POST(cronRequest())
    expect(res.status).toBe(401)
    expect(sendDailyReminders).not.toHaveBeenCalled()
  })

  it('rejects a wrong bearer token', async () => {
    const res = await POST(cronRequest('Bearer wrong-secret'))
    expect(res.status).toBe(401)
    expect(sendDailyReminders).not.toHaveBeenCalled()
  })

  it('runs the reminder fan-out with the correct secret and returns stats', async () => {
    const res = await POST(cronRequest('Bearer test-secret'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ subscriptions: 3, sent: 2, failed: 0, removed: 1 })
  })
})
