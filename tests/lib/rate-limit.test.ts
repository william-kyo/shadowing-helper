import { afterEach, describe, expect, it, vi } from 'vitest'

const { findMany, create, deleteMany } = vi.hoisted(() => ({
  findMany: vi.fn(),
  create: vi.fn(),
  deleteMany: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  db: {
    rateLimitHit: { findMany, create, deleteMany },
  },
}))

import { enforceRateLimit, rateLimitResponseOrNull } from '@/lib/rate-limit'

afterEach(() => {
  vi.clearAllMocks()
})

describe('enforceRateLimit', () => {
  it('allows and records a hit when under the limit', async () => {
    findMany.mockResolvedValue([]) // no prior hits in window
    create.mockResolvedValue({})
    deleteMany.mockResolvedValue({})

    const result = await enforceRateLimit('user-1', 'transcribe')

    expect(result.allowed).toBe(true)
    expect(result.remaining).toBe(59) // transcribe limit 60 - 1
    expect(create).toHaveBeenCalledWith({ data: { userId: 'user-1', bucket: 'transcribe' } })
  })

  it('blocks without recording a new hit once the window is full', async () => {
    // stage4_recording limit is 40 per minute; oldest hit was 10s ago.
    const oldest = new Date(Date.now() - 10_000)
    findMany.mockResolvedValue(Array.from({ length: 40 }, () => ({ createdAt: oldest })))

    const result = await enforceRateLimit('user-1', 'stage4_recording')

    expect(result.allowed).toBe(false)
    expect(result.remaining).toBe(0)
    // ~50s left in the 60s window after a 10s-old oldest hit.
    expect(result.retryAfterSeconds).toBeGreaterThan(0)
    expect(result.retryAfterSeconds).toBeLessThanOrEqual(60)
    expect(create).not.toHaveBeenCalled()
  })
})

describe('rateLimitResponseOrNull', () => {
  it('returns null when the call is allowed', async () => {
    findMany.mockResolvedValue([])
    create.mockResolvedValue({})
    deleteMany.mockResolvedValue({})

    const response = await rateLimitResponseOrNull('user-1', 'project_create')
    expect(response).toBeNull()
  })

  it('returns a 429 with a Retry-After header when over the limit', async () => {
    const oldest = new Date(Date.now() - 1_000)
    findMany.mockResolvedValue(Array.from({ length: 15 }, () => ({ createdAt: oldest }))) // project_create limit 15

    const response = await rateLimitResponseOrNull('user-1', 'project_create')
    expect(response).not.toBeNull()
    expect(response!.status).toBe(429)
    expect(response!.headers.get('Retry-After')).toBeTruthy()
    const body = (await response!.json()) as { code?: string }
    expect(body.code).toBe('rate_limited')
  })
})
