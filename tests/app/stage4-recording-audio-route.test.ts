import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  segmentFindFirst,
  recordingFindFirst,
  downloadStorageObject,
  createSupabaseServerClient,
} = vi.hoisted(() => ({
  segmentFindFirst: vi.fn(),
  recordingFindFirst: vi.fn(),
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
    recording: { findFirst: recordingFindFirst },
  },
}))

vi.mock('@/lib/storage', () => ({
  downloadStorageObject,
}))

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient,
}))

import { GET } from '@/app/api/segments/[segmentId]/stage4/recordings/[index]/audio/route'

function buildContext(segmentId: string, index: string) {
  return { params: Promise.resolve({ segmentId, index }) }
}

describe('GET /api/segments/[segmentId]/stage4/recordings/[index]/audio', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('streams the latest recording with a MIME inferred from the key', async () => {
    segmentFindFirst.mockResolvedValue({ id: 'seg-1' })
    recordingFindFirst.mockResolvedValue({
      filePath: 'sb-user-1/projects/proj-1/recordings/seg-1/4/0/abc.webm',
    })
    createSupabaseServerClient.mockResolvedValue({})
    downloadStorageObject.mockResolvedValue(Buffer.from('take-bytes').buffer)

    const response = await GET(
      new Request('http://localhost/api/segments/seg-1/stage4/recordings/0/audio?v=rec-2'),
      buildContext('seg-1', '0'),
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('audio/webm')
    // Latest take is selected: newest-first ordering on createdAt.
    expect(recordingFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { segmentId: 'seg-1', stage: 4, sentenceIndex: 0 },
        orderBy: { createdAt: 'desc' },
      }),
    )
  })

  it('infers audio/mp4 for Safari recordings', async () => {
    segmentFindFirst.mockResolvedValue({ id: 'seg-1' })
    recordingFindFirst.mockResolvedValue({
      filePath: 'sb-user-1/projects/proj-1/recordings/seg-1/4/1/abc.mp4',
    })
    createSupabaseServerClient.mockResolvedValue({})
    downloadStorageObject.mockResolvedValue(Buffer.from('take-bytes').buffer)

    const response = await GET(
      new Request('http://localhost/api/segments/seg-1/stage4/recordings/1/audio'),
      buildContext('seg-1', '1'),
    )
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('audio/mp4')
  })

  it('sets a private, cache-busted Cache-Control header (no shared cache for private audio)', async () => {
    segmentFindFirst.mockResolvedValue({ id: 'seg-1' })
    recordingFindFirst.mockResolvedValue({
      filePath: 'sb-user-1/projects/proj-1/recordings/seg-1/4/0/abc.webm',
    })
    createSupabaseServerClient.mockResolvedValue({})
    downloadStorageObject.mockResolvedValue(Buffer.from('take-bytes').buffer)

    const response = await GET(
      new Request('http://localhost/api/segments/seg-1/stage4/recordings/0/audio?v=rec-2'),
      buildContext('seg-1', '0'),
    )
    const cacheControl = response.headers.get('cache-control') ?? ''
    expect(cacheControl).toContain('private')
    expect(cacheControl).not.toContain('public')
  })

  it('serves a 206 partial response for a range request', async () => {
    segmentFindFirst.mockResolvedValue({ id: 'seg-1' })
    recordingFindFirst.mockResolvedValue({
      filePath: 'sb-user-1/projects/proj-1/recordings/seg-1/4/0/abc.webm',
    })
    createSupabaseServerClient.mockResolvedValue({})
    downloadStorageObject.mockResolvedValue(Buffer.from('take-bytes').buffer)

    const response = await GET(
      new Request('http://localhost/api/segments/seg-1/stage4/recordings/0/audio', {
        headers: { range: 'bytes=0-3' },
      }),
      buildContext('seg-1', '0'),
    )
    expect(response.status).toBe(206)
    expect(response.headers.get('content-range')).toMatch(/^bytes 0-3\//)
  })

  it('returns 400 for a non-numeric index', async () => {
    const response = await GET(
      new Request('http://localhost/api/segments/seg-1/stage4/recordings/foo/audio'),
      buildContext('seg-1', 'foo'),
    )
    expect(response.status).toBe(400)
  })

  it('returns 400 for a negative index', async () => {
    const response = await GET(
      new Request('http://localhost/api/segments/seg-1/stage4/recordings/-1/audio'),
      buildContext('seg-1', '-1'),
    )
    expect(response.status).toBe(400)
    expect(segmentFindFirst).not.toHaveBeenCalled()
  })

  it('returns 404 when the segment is not owned by the user', async () => {
    segmentFindFirst.mockResolvedValue(null)
    const response = await GET(
      new Request('http://localhost/api/segments/missing/stage4/recordings/0/audio'),
      buildContext('missing', '0'),
    )
    expect(response.status).toBe(404)
    expect(recordingFindFirst).not.toHaveBeenCalled()
  })

  it('returns 404 when no recording exists for the sentence', async () => {
    segmentFindFirst.mockResolvedValue({ id: 'seg-1' })
    recordingFindFirst.mockResolvedValue(null)
    const response = await GET(
      new Request('http://localhost/api/segments/seg-1/stage4/recordings/0/audio'),
      buildContext('seg-1', '0'),
    )
    expect(response.status).toBe(404)
  })

  it('returns 404 when the stored object is missing', async () => {
    segmentFindFirst.mockResolvedValue({ id: 'seg-1' })
    recordingFindFirst.mockResolvedValue({
      filePath: 'sb-user-1/projects/proj-1/recordings/seg-1/4/0/abc.webm',
    })
    createSupabaseServerClient.mockResolvedValue({})
    downloadStorageObject.mockRejectedValue(new Error('not found'))

    const response = await GET(
      new Request('http://localhost/api/segments/seg-1/stage4/recordings/0/audio'),
      buildContext('seg-1', '0'),
    )
    expect(response.status).toBe(404)
  })
})
