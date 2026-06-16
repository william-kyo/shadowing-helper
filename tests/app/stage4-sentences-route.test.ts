import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  segmentFindFirst,
  segmentUpdate,
  recordingFindMany,
  transcribeAudioWithSegments,
  downloadStorageObject,
  uploadBufferToStorage,
  createSupabaseServerClient,
  extractAudioSegmentFromBuffer,
} = vi.hoisted(() => ({
  segmentFindFirst: vi.fn(),
  segmentUpdate: vi.fn(),
  recordingFindMany: vi.fn(),
  transcribeAudioWithSegments: vi.fn(),
  downloadStorageObject: vi.fn(),
  uploadBufferToStorage: vi.fn(),
  createSupabaseServerClient: vi.fn(),
  extractAudioSegmentFromBuffer: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({
  requireAppUserForApi: vi.fn().mockResolvedValue({
    user: { id: 'user-1', supabaseUserId: 'sb-user-1', email: 'owner@example.com' },
    response: null,
  }),
}))

vi.mock('@/lib/db', () => ({
  db: {
    segment: {
      findFirst: segmentFindFirst,
      update: segmentUpdate,
    },
    recording: {
      findMany: recordingFindMany,
    },
  },
}))

vi.mock('@/lib/groq', () => ({
  transcribeAudioWithSegments,
}))

vi.mock('@/lib/segment-audio', () => ({
  extractAudioSegmentFromBuffer,
}))

vi.mock('@/lib/storage', () => ({
  downloadStorageObject,
  uploadBufferToStorage,
}))

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient,
}))

import { GET } from '@/app/api/segments/[segmentId]/stage4/sentences/route'

// Fixed so the cache-busting `?v=` suffix on refAudioUrl is deterministic.
const SEG_UPDATED_AT = new Date('2024-01-02T00:00:00.000Z')
const V = SEG_UPDATED_AT.getTime()

function buildRequest() {
  return new Request('http://localhost/api/segments/seg-1/stage4/sentences', {
    method: 'GET',
  })
}

function buildContext(segmentId = 'seg-1') {
  return { params: Promise.resolve({ segmentId }) }
}

describe('GET /api/segments/[segmentId]/stage4/sentences', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // No prior recordings unless a test overrides this.
    recordingFindMany.mockResolvedValue([])
  })

  it('returns the sentence list using the persisted whisper sub-segments', async () => {
    segmentFindFirst.mockResolvedValue({
      id: 'seg-1',
      text: 'merged text',
      audioPath: 'sb-user-1/audio/seg-1.mp3',
      startMs: 0,
      endMs: 10000,
      updatedAt: SEG_UPDATED_AT,
      whisperSegments: [
        { text: '一文目', startMs: 100, endMs: 1500 },
        { text: '二文目', startMs: 1700, endMs: 3200 },
      ],
      project: { id: 'proj-1', audioMimeType: 'audio/mpeg' },
      progress: [],
    })
    createSupabaseServerClient.mockResolvedValue({})
    downloadStorageObject.mockResolvedValue(Buffer.from('audio-bytes').buffer)
    extractAudioSegmentFromBuffer.mockResolvedValue(Buffer.from('slice').buffer)
    uploadBufferToStorage.mockResolvedValue(undefined)

    const response = await GET(buildRequest(), buildContext())
    expect(response.status).toBe(200)
    const json = await response.json()
    expect(json.sentences).toEqual([
      { index: 0, text: '一文目', startMs: 100, endMs: 1500, refAudioUrl: `/api/segments/seg-1/stage4/sentences/0/audio?v=${V}`, userRecordingUrl: null },
      { index: 1, text: '二文目', startMs: 1700, endMs: 3200, refAudioUrl: `/api/segments/seg-1/stage4/sentences/1/audio?v=${V}`, userRecordingUrl: null },
    ])
    expect(json.initialMetadata).toBeNull()
    expect(transcribeAudioWithSegments).not.toHaveBeenCalled()
    expect(segmentUpdate).not.toHaveBeenCalled()
  })

  it('lazy-backfills whisper segments via Groq on first request and persists them', async () => {
    segmentFindFirst.mockResolvedValueOnce({
      id: 'seg-1',
      text: 'merged text',
      audioPath: 'sb-user-1/audio/seg-1.mp3',
      startMs: 0,
      endMs: 10000,
      updatedAt: SEG_UPDATED_AT,
      whisperSegments: null,
      project: { id: 'proj-1', audioMimeType: 'audio/mpeg' },
      progress: [],
    })
    createSupabaseServerClient.mockResolvedValue({})
    downloadStorageObject.mockResolvedValue(Buffer.from('audio-bytes').buffer)
    transcribeAudioWithSegments.mockResolvedValue({
      task: 'transcribe',
      language: 'ja',
      duration: 10,
      text: '一文目 二文目',
      segments: [
        { id: 0, seek: 0, start: 0.1, end: 1.5, text: '一文目', tokens: [], temperature: 0, avg_logprob: 0, compression_ratio: 0, no_speech_prob: 0 },
        { id: 1, seek: 0, start: 1.7, end: 3.2, text: '二文目', tokens: [], temperature: 0, avg_logprob: 0, compression_ratio: 0, no_speech_prob: 0 },
      ],
    })
    segmentUpdate.mockResolvedValue(undefined)
    extractAudioSegmentFromBuffer.mockResolvedValue(Buffer.from('slice').buffer)
    uploadBufferToStorage.mockResolvedValue(undefined)

    const response = await GET(buildRequest(), buildContext())
    expect(response.status).toBe(200)
    const json = await response.json()
    expect(json.sentences).toHaveLength(2)
    expect(transcribeAudioWithSegments).toHaveBeenCalledTimes(1)
    expect(segmentUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'seg-1' },
        data: {
          whisperSegments: [
            { text: '一文目', startMs: 100, endMs: 1500 },
            { text: '二文目', startMs: 1700, endMs: 3200 },
          ],
        },
      }),
    )
  })

  it('builds userRecordingUrl from the latest recording per sentence', async () => {
    segmentFindFirst.mockResolvedValue({
      id: 'seg-1',
      text: 'merged text',
      audioPath: 'sb-user-1/audio/seg-1.mp3',
      startMs: 0,
      endMs: 10000,
      updatedAt: SEG_UPDATED_AT,
      whisperSegments: [
        { text: '一文目', startMs: 100, endMs: 1500 },
        { text: '二文目', startMs: 1700, endMs: 3200 },
      ],
      project: { id: 'proj-1', audioMimeType: 'audio/mpeg' },
      progress: [],
    })
    createSupabaseServerClient.mockResolvedValue({})
    downloadStorageObject.mockResolvedValue(Buffer.from('audio-bytes').buffer)
    extractAudioSegmentFromBuffer.mockResolvedValue(Buffer.from('slice').buffer)
    uploadBufferToStorage.mockResolvedValue(undefined)
    // Newest-first; only sentence 0 has takes — the latest (rec-2) wins. The
    // null-sentenceIndex row (a non-stage-4 legacy recording) must be ignored.
    recordingFindMany.mockResolvedValue([
      { id: 'rec-null', sentenceIndex: null },
      { id: 'rec-2', sentenceIndex: 0 },
      { id: 'rec-1', sentenceIndex: 0 },
    ])

    const response = await GET(buildRequest(), buildContext())
    const json = await response.json()
    expect(json.sentences[0].userRecordingUrl).toBe(
      '/api/segments/seg-1/stage4/recordings/0/audio?v=rec-2',
    )
    expect(json.sentences[1].userRecordingUrl).toBeNull()
  })

  it('returns 404 when the segment does not belong to the user', async () => {
    segmentFindFirst.mockResolvedValue(null)
    const response = await GET(buildRequest(), buildContext('missing'))
    expect(response.status).toBe(404)
  })

  it('hydrates initialMetadata from stage 4 progress when present', async () => {
    segmentFindFirst.mockResolvedValue({
      id: 'seg-1',
      text: 'merged text',
      audioPath: 'sb-user-1/audio/seg-1.mp3',
      startMs: 0,
      endMs: 10000,
      updatedAt: SEG_UPDATED_AT,
      whisperSegments: [
        { text: '一文目', startMs: 100, endMs: 1500 },
      ],
      project: { id: 'proj-1', audioMimeType: 'audio/mpeg' },
      progress: [
        {
          metadata: {
            sentences: [
              { index: 0, score: 0.95, transcript: '一文目', attempts: 1, passedAt: '2026-06-01T00:00:00.000Z' },
            ],
          },
        },
      ],
    })
    createSupabaseServerClient.mockResolvedValue({})
    downloadStorageObject.mockResolvedValue(Buffer.from('audio-bytes').buffer)
    extractAudioSegmentFromBuffer.mockResolvedValue(Buffer.from('slice').buffer)
    uploadBufferToStorage.mockResolvedValue(undefined)

    const response = await GET(buildRequest(), buildContext())
    const json = await response.json()
    expect(json.initialMetadata?.sentences?.[0]?.score).toBe(0.95)
  })
})
