import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  segmentFindFirst,
  segmentUpdate,
  stageProgressUpdateMany,
  transaction,
  transcribeAudioWithSegments,
  punctuateText,
  extractAudioSegmentFromBuffer,
  downloadStorageObject,
  uploadBufferToStorage,
  removeStorageObjects,
  createSupabaseServerClient,
} = vi.hoisted(() => ({
  segmentFindFirst: vi.fn(),
  segmentUpdate: vi.fn(),
  stageProgressUpdateMany: vi.fn(),
  transaction: vi.fn(),
  transcribeAudioWithSegments: vi.fn(),
  punctuateText: vi.fn(),
  extractAudioSegmentFromBuffer: vi.fn(),
  downloadStorageObject: vi.fn(),
  uploadBufferToStorage: vi.fn(),
  removeStorageObjects: vi.fn(),
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
    segment: { findFirst: segmentFindFirst, update: segmentUpdate },
    stageProgress: { updateMany: stageProgressUpdateMany },
    $transaction: transaction,
  },
}))

vi.mock('@/lib/rate-limit', () => ({
  rateLimitResponseOrNull: vi.fn().mockResolvedValue(null),
}))

vi.mock('@/lib/groq', () => ({ transcribeAudioWithSegments }))
vi.mock('@/lib/segment-analysis', () => ({ punctuateText }))
vi.mock('@/lib/segment-audio', () => ({ extractAudioSegmentFromBuffer }))
vi.mock('@/lib/storage', () => ({
  downloadStorageObject,
  uploadBufferToStorage,
  removeStorageObjects,
  getProjectStoragePaths: () => ({ audioDir: 'sb-user-1/projects/proj-1/audio' }),
  buildStorageObjectKey: (dir: string, name: string) => `${dir}/${name}`,
  createStoredFileName: (name: string) => name,
}))
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient }))

import { POST } from '@/app/api/segments/[segmentId]/resplit/route'

function buildRequest(body: unknown) {
  return new Request('http://localhost/api/segments/seg-1/resplit', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function buildContext(segmentId = 'seg-1') {
  return { params: Promise.resolve({ segmentId }) }
}

const BASE_SEGMENT = {
  id: 'seg-1',
  audioPath: 'sb-user-1/audio/seg-1-old.mp3',
  whisperSegments: [
    { text: '一文目', startMs: 100, endMs: 1500 },
    { text: '二文目', startMs: 1700, endMs: 3200 },
  ],
  project: {
    id: 'proj-1',
    audioPath: 'sb-user-1/audio/full.mp3',
    audioMimeType: 'audio/mpeg',
    audioOriginalName: 'full.mp3',
    audioDurationMs: 60000,
  },
}

describe('POST /api/segments/[segmentId]/resplit', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    segmentFindFirst.mockResolvedValue(BASE_SEGMENT)
    createSupabaseServerClient.mockResolvedValue({})
    downloadStorageObject.mockResolvedValue(Buffer.from('full-audio').buffer)
    extractAudioSegmentFromBuffer.mockResolvedValue(Buffer.from('new-slice'))
    uploadBufferToStorage.mockResolvedValue(undefined)
    transcribeAudioWithSegments.mockResolvedValue({
      task: 'transcribe',
      language: 'ja',
      duration: 8,
      text: '新しい一文目 新しい二文目',
      segments: [
        { id: 0, seek: 0, start: 0, end: 2, text: '新しい一文目', tokens: [], temperature: 0, avg_logprob: 0, compression_ratio: 0, no_speech_prob: 0 },
      ],
    })
    punctuateText.mockResolvedValue('新しい一文目。新しい二文目。')
    segmentUpdate.mockResolvedValue({ startMs: 2000, endMs: 10000, text: '新しい一文目。新しい二文目。', updatedAt: new Date() })
    stageProgressUpdateMany.mockResolvedValue({ count: 1 })
    transaction.mockImplementation((ops: Promise<unknown>[]) => Promise.all(ops))
    removeStorageObjects.mockResolvedValue(undefined)
  })

  it('re-cuts the audio, regenerates the script, and resets stage 4', async () => {
    const response = await POST(buildRequest({ startMs: 2000, endMs: 10000 }), buildContext())
    expect(response.status).toBe(200)
    const json = await response.json()
    expect(json.text).toBe('新しい一文目。新しい二文目。')

    // New clip cut from the project source between the requested seconds.
    expect(extractAudioSegmentFromBuffer).toHaveBeenCalledWith(
      expect.objectContaining({ startSeconds: 2, endSeconds: 10 }),
    )
    // Segment row updated with the new range + regenerated script + sub-segments.
    expect(segmentUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'seg-1' },
        data: expect.objectContaining({
          startMs: 2000,
          endMs: 10000,
          text: '新しい一文目。新しい二文目。',
        }),
      }),
    )
    // Stage 4 scores wiped.
    expect(stageProgressUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { segmentId: 'seg-1', stage: 4 },
        data: expect.objectContaining({ status: 'not_started', completedAt: null }),
      }),
    )
    // Old clip + stale sentence audios cleaned up.
    expect(removeStorageObjects).toHaveBeenCalledWith(
      expect.objectContaining({
        objectKeys: expect.arrayContaining(['sb-user-1/audio/seg-1-old.mp3']),
      }),
    )
  })

  it('rejects a range whose end is not after the start', async () => {
    const response = await POST(buildRequest({ startMs: 5000, endMs: 5100 }), buildContext())
    expect(response.status).toBe(400)
    expect(segmentUpdate).not.toHaveBeenCalled()
  })

  it('rejects an end past the source audio length', async () => {
    const response = await POST(buildRequest({ startMs: 0, endMs: 90000 }), buildContext())
    expect(response.status).toBe(400)
    expect(extractAudioSegmentFromBuffer).not.toHaveBeenCalled()
  })

  it('returns 404 when the segment does not belong to the user', async () => {
    segmentFindFirst.mockResolvedValue(null)
    const response = await POST(buildRequest({ startMs: 0, endMs: 5000 }), buildContext('missing'))
    expect(response.status).toBe(404)
  })
})
