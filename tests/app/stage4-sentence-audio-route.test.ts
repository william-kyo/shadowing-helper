import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  segmentFindFirst,
  downloadStorageObject,
  createSupabaseServerClient,
} = vi.hoisted(() => ({
  segmentFindFirst: vi.fn(),
  downloadStorageObject: vi.fn(),
  createSupabaseServerClient: vi.fn(),
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
  },
}))

vi.mock('@/lib/storage', () => ({
  downloadStorageObject,
}))

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient,
}))

import { GET } from '@/app/api/segments/[segmentId]/stage4/sentences/[index]/audio/route'

function buildContext(segmentId: string, index: string) {
  return { params: Promise.resolve({ segmentId, index }) }
}

describe('GET /api/segments/[segmentId]/stage4/sentences/[index]/audio', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('streams the pre-cut sentence audio with the project mime type', async () => {
    segmentFindFirst.mockResolvedValue({
      id: 'seg-1',
      text: 'merged',
      audioPath: 'sb-user-1/audio/seg-1.mp3',
      startMs: 0,
      endMs: 10000,
      whisperSegments: [
        { text: '一文目', startMs: 100, endMs: 1500 },
        { text: '二文目', startMs: 1700, endMs: 3200 },
      ],
      project: { audioMimeType: 'audio/mpeg' },
    })
    createSupabaseServerClient.mockResolvedValue({})
    const fakeBuffer = Buffer.from('audio-slice-bytes')
    downloadStorageObject.mockResolvedValue(fakeBuffer.buffer)

    const response = await GET(
      new Request('http://localhost/api/segments/seg-1/stage4/sentences/0/audio'),
      buildContext('seg-1', '0'),
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('audio/mpeg')
    expect(downloadStorageObject).toHaveBeenCalledWith(
      expect.objectContaining({ objectKey: 'sb-user-1/audio/sentences/seg-1/0.mp3' }),
    )
  })

  it('returns 400 for a non-numeric index', async () => {
    const response = await GET(
      new Request('http://localhost/api/segments/seg-1/stage4/sentences/foo/audio'),
      buildContext('seg-1', 'foo'),
    )
    expect(response.status).toBe(400)
  })

  it('returns 404 when the sentence index is out of range', async () => {
    segmentFindFirst.mockResolvedValue({
      id: 'seg-1',
      text: 'merged',
      audioPath: 'sb-user-1/audio/seg-1.mp3',
      startMs: 0,
      endMs: 10000,
      whisperSegments: [{ text: '一文目', startMs: 100, endMs: 1500 }],
      project: { audioMimeType: 'audio/mpeg' },
    })
    const response = await GET(
      new Request('http://localhost/api/segments/seg-1/stage4/sentences/99/audio'),
      buildContext('seg-1', '99'),
    )
    expect(response.status).toBe(404)
  })

  it('returns 404 when the pre-cut audio is missing from storage', async () => {
    segmentFindFirst.mockResolvedValue({
      id: 'seg-1',
      text: 'merged',
      audioPath: 'sb-user-1/audio/seg-1.mp3',
      startMs: 0,
      endMs: 10000,
      whisperSegments: [{ text: '一文目', startMs: 100, endMs: 1500 }],
      project: { audioMimeType: 'audio/mpeg' },
    })
    createSupabaseServerClient.mockResolvedValue({})
    downloadStorageObject.mockRejectedValue(new Error('not found'))

    const response = await GET(
      new Request('http://localhost/api/segments/seg-1/stage4/sentences/0/audio'),
      buildContext('seg-1', '0'),
    )
    expect(response.status).toBe(404)
  })

  it('returns 404 when the segment is not owned by the user', async () => {
    segmentFindFirst.mockResolvedValue(null)
    const response = await GET(
      new Request('http://localhost/api/segments/missing/stage4/sentences/0/audio'),
      buildContext('missing', '0'),
    )
    expect(response.status).toBe(404)
  })
})
