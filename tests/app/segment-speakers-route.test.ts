import { beforeEach, describe, expect, it, vi } from 'vitest'

const { segmentFindFirst, segmentUpdate } = vi.hoisted(() => ({
  segmentFindFirst: vi.fn(),
  segmentUpdate: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({
  requireAppUserForApi: vi.fn().mockResolvedValue({
    user: { id: 'user-1', supabaseUserId: 'sb-user-1', email: 'owner@example.com' },
    response: null,
  }),
}))

vi.mock('@/lib/db', () => ({
  db: { segment: { findFirst: segmentFindFirst, update: segmentUpdate } },
}))

import { PATCH } from '@/app/api/segments/[segmentId]/speakers/route'

function buildRequest(body: unknown) {
  return new Request('http://localhost/api/segments/seg-1/speakers', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const buildContext = () => ({ params: Promise.resolve({ segmentId: 'seg-1' }) })

const CHUNKS = [
  { text: '一文目', startMs: 0, endMs: 1500 },
  { text: '二文目', startMs: 1700, endMs: 3200, speaker: 'B' as const },
  { text: '三文目', startMs: 3300, endMs: 4800 },
]

describe('PATCH /api/segments/[segmentId]/speakers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    segmentFindFirst.mockResolvedValue({ id: 'seg-1', whisperSegments: CHUNKS })
    segmentUpdate.mockResolvedValue({})
  })

  it('applies a partial edit without disturbing labels it was not sent', async () => {
    const response = await PATCH(
      buildRequest({ labels: [{ index: 0, speaker: 'A' }] }),
      buildContext(),
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ labels: ['A', 'B', null] })
    expect(segmentUpdate).toHaveBeenCalledWith({
      where: { id: 'seg-1' },
      data: {
        whisperSegments: [
          { text: '一文目', startMs: 0, endMs: 1500, speaker: 'A' },
          { text: '二文目', startMs: 1700, endMs: 3200, speaker: 'B' },
          { text: '三文目', startMs: 3300, endMs: 4800 },
        ],
      },
    })
  })

  it('clears a label when the speaker is null', async () => {
    const response = await PATCH(
      buildRequest({ labels: [{ index: 1, speaker: null }] }),
      buildContext(),
    )

    expect(response.status).toBe(200)
    const persisted = segmentUpdate.mock.calls[0]?.[0]?.data?.whisperSegments
    expect(persisted[1]).not.toHaveProperty('speaker')
  })

  it('rejects an index past the end of the transcription', async () => {
    const response = await PATCH(
      buildRequest({ labels: [{ index: 9, speaker: 'A' }] }),
      buildContext(),
    )

    expect(response.status).toBe(400)
    expect(segmentUpdate).not.toHaveBeenCalled()
  })

  it('rejects an unknown speaker value', async () => {
    const response = await PATCH(
      buildRequest({ labels: [{ index: 0, speaker: 'C' }] }),
      buildContext(),
    )

    expect(response.status).toBe(400)
    expect(segmentUpdate).not.toHaveBeenCalled()
  })

  it('404s for a segment the user does not own', async () => {
    segmentFindFirst.mockResolvedValue(null)

    const response = await PATCH(
      buildRequest({ labels: [{ index: 0, speaker: 'A' }] }),
      buildContext(),
    )

    expect(response.status).toBe(404)
    expect(segmentUpdate).not.toHaveBeenCalled()
  })

  it('409s when the segment has not been transcribed yet', async () => {
    segmentFindFirst.mockResolvedValue({ id: 'seg-1', whisperSegments: null })

    const response = await PATCH(
      buildRequest({ labels: [{ index: 0, speaker: 'A' }] }),
      buildContext(),
    )

    expect(response.status).toBe(409)
    expect(segmentUpdate).not.toHaveBeenCalled()
  })
})
