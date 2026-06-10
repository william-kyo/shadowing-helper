// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  segmentFindFirst,
  recordingCreate,
  stageProgressUpsert,
  transcribeAudio,
  uploadBufferToStorage,
  createSupabaseServerClient,
} = vi.hoisted(() => ({
  segmentFindFirst: vi.fn(),
  recordingCreate: vi.fn(),
  stageProgressUpsert: vi.fn(),
  transcribeAudio: vi.fn(),
  uploadBufferToStorage: vi.fn(),
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
    recording: { create: recordingCreate },
    stageProgress: { upsert: stageProgressUpsert },
  },
}))

vi.mock('@/lib/groq', () => ({
  transcribeAudio,
}))

vi.mock('@/lib/storage', () => ({
  uploadBufferToStorage,
}))

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient,
}))

import { POST } from '@/app/api/segments/[segmentId]/stage4/recordings/route'

function buildRequest(form: FormData) {
  return new Request('http://localhost/api/segments/seg-1/stage4/recordings', {
    method: 'POST',
    body: form,
  })
}

function buildContext(segmentId = 'seg-1') {
  return { params: Promise.resolve({ segmentId }) }
}

function makeFormData(sentenceIndex: string, withAudio = true): FormData {
  const form = new FormData()
  form.set('sentenceIndex', sentenceIndex)
  if (withAudio) {
    form.set('audio', new File([Buffer.from('fake-recording')], 'rec.webm', { type: 'audio/webm' }))
  }
  return form
}

function baseSegment() {
  return {
    id: 'seg-1',
    text: 'merged',
    startMs: 0,
    endMs: 10000,
    whisperSegments: [
      { text: 'こんにちは', startMs: 100, endMs: 1500 },
      { text: 'さようなら', startMs: 1700, endMs: 3200 },
    ],
    project: { id: 'proj-1', audioMimeType: 'audio/webm' },
    progress: [],
  }
}

describe('POST /api/segments/[segmentId]/stage4/recordings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('scores a perfect transcript and returns pass=true', async () => {
    segmentFindFirst.mockResolvedValue(baseSegment())
    createSupabaseServerClient.mockResolvedValue({})
    uploadBufferToStorage.mockResolvedValue(undefined)
    recordingCreate.mockResolvedValue({ id: 'rec-1' })
    transcribeAudio.mockResolvedValue('こんにちは')
    stageProgressUpsert.mockResolvedValue({ status: 'in_progress' })

    const response = await POST(buildRequest(makeFormData('0')), buildContext())
    expect(response.status).toBe(200)
    const json = await response.json()
    expect(json.pass).toBe(true)
    expect(json.score).toBe(1)
    expect(json.transcript).toBe('こんにちは')
    expect(json.expected).toBe('こんにちは')
    expect(json.totalSentences).toBe(2)
    expect(json.passingSentences).toBe(1)
    expect(json.stageComplete).toBe(false)
    expect(stageProgressUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ status: 'in_progress' }),
      }),
    )
  })

  it('marks stage 4 completed when the final sentence reaches the threshold', async () => {
    segmentFindFirst.mockResolvedValue({
      ...baseSegment(),
      progress: [
        {
          id: 'sp-1',
          status: 'in_progress',
          metadata: {
            sentences: [
              { index: 0, score: 0.95, transcript: 'こんにちは', attempts: 1, passedAt: '2026-06-01T00:00:00.000Z' },
            ],
          },
        },
      ],
    })
    createSupabaseServerClient.mockResolvedValue({})
    uploadBufferToStorage.mockResolvedValue(undefined)
    recordingCreate.mockResolvedValue({ id: 'rec-2' })
    transcribeAudio.mockResolvedValue('さようなら')
    stageProgressUpsert.mockResolvedValue({ status: 'completed' })

    const response = await POST(buildRequest(makeFormData('1')), buildContext())
    expect(response.status).toBe(200)
    const json = await response.json()
    expect(json.pass).toBe(true)
    expect(json.stageComplete).toBe(true)
    expect(json.passingSentences).toBe(2)
    expect(stageProgressUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          status: 'completed',
          completedAt: expect.any(Date),
        }),
      }),
    )
  })

  it('returns a non-passing score for a wrong transcript and does not complete the stage', async () => {
    segmentFindFirst.mockResolvedValue(baseSegment())
    createSupabaseServerClient.mockResolvedValue({})
    uploadBufferToStorage.mockResolvedValue(undefined)
    recordingCreate.mockResolvedValue({ id: 'rec-3' })
    transcribeAudio.mockResolvedValue('さようなら')
    stageProgressUpsert.mockResolvedValue({ status: 'in_progress' })

    const response = await POST(buildRequest(makeFormData('0')), buildContext())
    const json = await response.json()
    expect(json.pass).toBe(false)
    expect(json.score).toBeLessThan(0.8)
    expect(json.stageComplete).toBe(false)
  })

  it('returns 400 when sentenceIndex is missing', async () => {
    const form = new FormData()
    form.set('audio', new File([Buffer.from('x')], 'rec.webm', { type: 'audio/webm' }))
    const response = await POST(buildRequest(form), buildContext())
    expect(response.status).toBe(400)
  })

  it('returns 400 when the audio file is missing', async () => {
    const form = new FormData()
    form.set('sentenceIndex', '0')
    const response = await POST(buildRequest(form), buildContext())
    expect(response.status).toBe(400)
  })

  it('returns 400 when sentenceIndex is out of range', async () => {
    segmentFindFirst.mockResolvedValue(baseSegment())
    const response = await POST(buildRequest(makeFormData('99')), buildContext())
    expect(response.status).toBe(400)
  })

  it('returns 404 when the segment is not owned by the user', async () => {
    segmentFindFirst.mockResolvedValue(null)
    const response = await POST(buildRequest(makeFormData('0')), buildContext('missing'))
    expect(response.status).toBe(404)
  })

  it('preserves an already-completed stage 4 on retries (does not overwrite completedAt)', async () => {
    const originalCompletedAt = new Date('2026-05-01T00:00:00.000Z')
    segmentFindFirst.mockResolvedValue({
      ...baseSegment(),
      progress: [
        {
          id: 'sp-1',
          status: 'completed',
          completedAt: originalCompletedAt,
          metadata: {
            sentences: [
              { index: 0, score: 0.95, transcript: 'こんにちは', attempts: 1, passedAt: '2026-05-01T00:00:00.000Z' },
              { index: 1, score: 0.95, transcript: 'さようなら', attempts: 1, passedAt: '2026-05-01T00:00:00.000Z' },
            ],
          },
        },
      ],
    })
    createSupabaseServerClient.mockResolvedValue({})
    uploadBufferToStorage.mockResolvedValue(undefined)
    recordingCreate.mockResolvedValue({ id: 'rec-4' })
    transcribeAudio.mockResolvedValue('さようなら')
    stageProgressUpsert.mockResolvedValue({ status: 'completed' })

    const response = await POST(buildRequest(makeFormData('1')), buildContext())
    const json = await response.json()
    expect(json.stageComplete).toBe(true)
    // The update payload must NOT include a fresh completedAt on a re-complete.
    const updateCall = stageProgressUpsert.mock.calls[0]?.[0] as { update?: { completedAt?: Date } }
    expect(updateCall?.update?.completedAt).toBeUndefined()
  })
})
