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

vi.mock('@/lib/rate-limit', () => ({
  rateLimitResponseOrNull: vi.fn().mockResolvedValue(null),
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
import { GroqTranscriptionError } from '@/lib/groq-errors'

function buildRequest(form: FormData) {
  return new Request('http://localhost/api/segments/seg-1/stage4/recordings', {
    method: 'POST',
    body: form,
  })
}

function buildContext(segmentId = 'seg-1') {
  return { params: Promise.resolve({ segmentId }) }
}

// Real takes are several KB; the route rejects anything below its minimum
// byte size, so fixtures must be comfortably above it.
function fakeRecordingBytes(size = 4096) {
  return Buffer.alloc(size, 1)
}

function makeFormData(sentenceIndex: string, withAudio = true): FormData {
  const form = new FormData()
  form.set('sentenceIndex', sentenceIndex)
  if (withAudio) {
    form.set('audio', new File([fakeRecordingBytes()], 'rec.webm', { type: 'audio/webm' }))
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

  it('returns 413 when the recording exceeds the size limit', async () => {
    const form = new FormData()
    form.set('sentenceIndex', '0')
    form.set(
      'audio',
      new File([Buffer.alloc(10 * 1024 * 1024 + 1)], 'rec.webm', { type: 'audio/webm' }),
    )
    const response = await POST(buildRequest(form), buildContext())
    expect(response.status).toBe(413)
  })

  // A take stopped instantly after start is a container-header-only blob that
  // Whisper cannot process. The route must refuse it before uploading anything
  // or creating a Recording row.
  it('returns 400 for a header-only take without uploading or transcribing', async () => {
    const form = new FormData()
    form.set('sentenceIndex', '0')
    form.set('audio', new File([fakeRecordingBytes(200)], 'rec.webm', { type: 'audio/webm' }))

    const response = await POST(buildRequest(form), buildContext())
    expect(response.status).toBe(400)
    const json = await response.json()
    expect(json.error).toContain('録音が短すぎる')
    expect(uploadBufferToStorage).not.toHaveBeenCalled()
    expect(recordingCreate).not.toHaveBeenCalled()
    expect(transcribeAudio).not.toHaveBeenCalled()
  })

  it('returns 422 with a re-record hint when Groq rejects the take as unprocessable', async () => {
    segmentFindFirst.mockResolvedValue(baseSegment())
    createSupabaseServerClient.mockResolvedValue({})
    uploadBufferToStorage.mockResolvedValue(undefined)
    recordingCreate.mockResolvedValue({ id: 'rec-groq-400' })
    transcribeAudio.mockRejectedValue(
      new GroqTranscriptionError(
        400,
        '{"error":{"message":"could not process file - is it a valid media file?","type":"invalid_request_error"}}',
      ),
    )

    const response = await POST(buildRequest(makeFormData('0')), buildContext())
    expect(response.status).toBe(422)
    const json = await response.json()
    expect(json.error).toContain('もう一度録音')
    expect(stageProgressUpsert).not.toHaveBeenCalled()
  })

  it('keeps returning 500 for non-user transcription failures', async () => {
    segmentFindFirst.mockResolvedValue(baseSegment())
    createSupabaseServerClient.mockResolvedValue({})
    uploadBufferToStorage.mockResolvedValue(undefined)
    recordingCreate.mockResolvedValue({ id: 'rec-groq-500' })
    transcribeAudio.mockRejectedValue(new GroqTranscriptionError(500, 'upstream unavailable'))

    const response = await POST(buildRequest(makeFormData('0')), buildContext())
    expect(response.status).toBe(500)
  })

  it('returns 400 when the content-type is not an accepted audio type', async () => {
    const form = new FormData()
    form.set('sentenceIndex', '0')
    form.set(
      'audio',
      new File([Buffer.from('fake')], 'rec.webm', { type: 'text/plain' }),
    )
    const response = await POST(buildRequest(form), buildContext())
    expect(response.status).toBe(400)
  })

  // Real MediaRecorder output carries a codec parameter on the MIME type
  // (Chrome/Firefox: audio/webm;codecs=opus, iOS Safari: audio/mp4;codecs=...).
  // The allowlist must match on the base type, not reject these.
  it.each([
    'audio/webm;codecs=opus',
    'audio/mp4;codecs=mp4a.40.2',
  ])('accepts a recording whose MIME carries a codec parameter (%s)', async (mime) => {
    segmentFindFirst.mockResolvedValue(baseSegment())
    createSupabaseServerClient.mockResolvedValue({})
    uploadBufferToStorage.mockResolvedValue(undefined)
    recordingCreate.mockResolvedValue({ id: 'rec-codec' })
    transcribeAudio.mockResolvedValue('こんにちは')
    stageProgressUpsert.mockResolvedValue({ status: 'in_progress' })

    const ext = mime.includes('mp4') ? 'mp4' : 'webm'
    const form = new FormData()
    form.set('sentenceIndex', '0')
    form.set('audio', new File([fakeRecordingBytes()], `rec.${ext}`, { type: mime }))

    const response = await POST(buildRequest(form), buildContext())
    expect(response.status).toBe(200)
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
