import { beforeEach, describe, expect, it, vi } from 'vitest'

const { segmentFindFirst, stageProgressUpsert } = vi.hoisted(() => ({
  segmentFindFirst: vi.fn(),
  stageProgressUpsert: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({
  requireAppUserForApi: vi.fn().mockResolvedValue({
    user: { id: 'user-1', supabaseUserId: 'sb-user-1', email: 'owner@example.com' },
    response: null,
  }),
}))

vi.mock('@/lib/db', () => ({
  db: {
    segment: { findFirst: segmentFindFirst },
    stageProgress: { upsert: stageProgressUpsert },
  },
}))

import { POST } from '@/app/api/segments/[segmentId]/stage4/complete/route'

function buildRequest() {
  return new Request('http://localhost/api/segments/seg-1/stage4/complete', { method: 'POST' })
}

function buildContext(segmentId = 'seg-1') {
  return { params: Promise.resolve({ segmentId }) }
}

describe('POST /api/segments/[segmentId]/stage4/complete', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('marks stage 4 as completed on a fresh segment', async () => {
    segmentFindFirst.mockResolvedValue({ id: 'seg-1' })
    stageProgressUpsert.mockResolvedValue({
      stage: 4,
      status: 'completed',
      completedAt: new Date('2026-06-01T00:00:00.000Z'),
    })

    const response = await POST(buildRequest(), buildContext())
    expect(response.status).toBe(200)
    const json = await response.json()
    expect(json.status).toBe('completed')
    expect(stageProgressUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ status: 'completed', stage: 4 }),
      }),
    )
  })

  it('returns 404 when the segment is not owned by the user', async () => {
    segmentFindFirst.mockResolvedValue(null)
    const response = await POST(buildRequest(), buildContext('missing'))
    expect(response.status).toBe(404)
    expect(stageProgressUpsert).not.toHaveBeenCalled()
  })
})
