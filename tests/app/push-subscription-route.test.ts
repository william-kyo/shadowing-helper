// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { requireAppUserForApi, pushSubscriptionUpsert, pushSubscriptionDeleteMany } = vi.hoisted(
  () => ({
    requireAppUserForApi: vi.fn(),
    pushSubscriptionUpsert: vi.fn(),
    pushSubscriptionDeleteMany: vi.fn(),
  }),
)

vi.mock('@/lib/auth', () => ({
  requireAppUserForApi,
}))

vi.mock('@/lib/db', () => ({
  db: {
    pushSubscription: { upsert: pushSubscriptionUpsert, deleteMany: pushSubscriptionDeleteMany },
  },
}))

import { NextResponse } from 'next/server'

import { DELETE, POST } from '@/app/api/push/subscription/route'

const ENDPOINT = 'https://push.example.com/reg/abc123'

function jsonRequest(method: string, body: unknown) {
  return new Request('http://localhost/api/push/subscription', {
    method,
    headers: { 'Content-Type': 'application/json', 'user-agent': 'test-agent' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  requireAppUserForApi.mockResolvedValue({
    user: { id: 'user-1', supabaseUserId: 'sb-1', email: 'u@example.com' },
    response: null,
  })
  pushSubscriptionUpsert.mockResolvedValue({})
  pushSubscriptionDeleteMany.mockResolvedValue({ count: 1 })
})

describe('POST /api/push/subscription', () => {
  it('rejects unauthenticated requests', async () => {
    requireAppUserForApi.mockResolvedValue({
      user: null,
      response: NextResponse.json({ error: 'auth' }, { status: 401 }),
    })
    const res = await POST(
      jsonRequest('POST', { endpoint: ENDPOINT, keys: { p256dh: 'p', auth: 'a' } }),
    )
    expect(res!.status).toBe(401)
    expect(pushSubscriptionUpsert).not.toHaveBeenCalled()
  })

  it('rejects a non-https endpoint', async () => {
    const res = await POST(
      jsonRequest('POST', { endpoint: 'http://evil.example.com/x', keys: { p256dh: 'p', auth: 'a' } }),
    )
    expect(res!.status).toBe(400)
    expect(pushSubscriptionUpsert).not.toHaveBeenCalled()
  })

  it('rejects a malformed body', async () => {
    const res = await POST(jsonRequest('POST', { endpoint: ENDPOINT }))
    expect(res!.status).toBe(400)
  })

  it('upserts the subscription keyed by endpoint', async () => {
    const res = await POST(
      jsonRequest('POST', { endpoint: ENDPOINT, keys: { p256dh: 'p-key', auth: 'a-key' } }),
    )
    expect(res!.status).toBe(200)
    expect(pushSubscriptionUpsert).toHaveBeenCalledWith({
      where: { endpoint: ENDPOINT },
      update: { userId: 'user-1', p256dh: 'p-key', auth: 'a-key', userAgent: 'test-agent' },
      create: {
        userId: 'user-1',
        endpoint: ENDPOINT,
        p256dh: 'p-key',
        auth: 'a-key',
        userAgent: 'test-agent',
      },
    })
  })
})

describe('DELETE /api/push/subscription', () => {
  it('deletes only the current user\'s subscription for the endpoint', async () => {
    const res = await DELETE(jsonRequest('DELETE', { endpoint: ENDPOINT }))
    expect(res!.status).toBe(200)
    expect(pushSubscriptionDeleteMany).toHaveBeenCalledWith({
      where: { endpoint: ENDPOINT, userId: 'user-1' },
    })
  })

  it('rejects a malformed body', async () => {
    const res = await DELETE(jsonRequest('DELETE', {}))
    expect(res!.status).toBe(400)
    expect(pushSubscriptionDeleteMany).not.toHaveBeenCalled()
  })
})
