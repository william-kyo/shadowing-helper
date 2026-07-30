import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  segmentFindFirst,
  segmentUpdate,
  recordingFindMany,
  transcribeAudioWithSegments,
  downloadStorageObject,
  ensureStage4SentenceAudios,
  resolveSpeakerChunks,
  createSupabaseServerClient,
} = vi.hoisted(() => ({
  segmentFindFirst: vi.fn(),
  segmentUpdate: vi.fn(),
  recordingFindMany: vi.fn(),
  transcribeAudioWithSegments: vi.fn(),
  downloadStorageObject: vi.fn(),
  ensureStage4SentenceAudios: vi.fn(),
  resolveSpeakerChunks: vi.fn(),
  createSupabaseServerClient: vi.fn(),
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

vi.mock('@/lib/groq', () => ({ transcribeAudioWithSegments }))
vi.mock('@/lib/recording-storage', () => ({ ensureStage4SentenceAudios }))
vi.mock('@/lib/segment-analysis', () => ({ resolveSpeakerChunks }))
vi.mock('@/lib/storage', () => ({ downloadStorageObject }))
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient }))

import { loadStage4Setup } from '@/lib/stage-4-server'

const USER = { id: 'user-1', supabaseUserId: 'sb-user-1' }

const WHISPER_SEGMENTS = [
  { text: '一文目', startMs: 100, endMs: 1500 },
  { text: '二文目', startMs: 1700, endMs: 3200 },
]

function buildSegment(overrides: Record<string, unknown> = {}) {
  return {
    id: 'seg-1',
    text: '一文目二文目',
    audioPath: 'sb-user-1/audio/seg-1.mp3',
    startMs: 0,
    endMs: 10000,
    updatedAt: new Date('2024-01-02T00:00:00.000Z'),
    whisperSegments: WHISPER_SEGMENTS,
    project: { id: 'proj-1', audioMimeType: 'audio/mpeg' },
    progress: [],
    ...overrides,
  }
}

describe('loadStage4Setup', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    recordingFindMany.mockResolvedValue([])
    createSupabaseServerClient.mockResolvedValue({})
    // Keep the console clean: the missing-object path logs on purpose.
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('returns null when the segment does not belong to the user', async () => {
    segmentFindFirst.mockResolvedValue(null)
    await expect(loadStage4Setup({ segmentId: 'missing', user: USER })).resolves.toBeNull()
  })

  it('reports audio as available once the reference pre-cut succeeds', async () => {
    segmentFindFirst.mockResolvedValue(buildSegment())
    downloadStorageObject.mockResolvedValue(Buffer.from('audio-bytes').buffer)
    ensureStage4SentenceAudios.mockResolvedValue([])

    const setup = await loadStage4Setup({ segmentId: 'seg-1', user: USER })

    expect(setup?.audioAvailable).toBe(true)
    expect(setup?.sentences).toHaveLength(2)
    expect(ensureStage4SentenceAudios).toHaveBeenCalledTimes(1)
  })

  // The pre-cut runs on EVERY load, so before this it threw even for segments
  // whose whisperSegments were already persisted — a 500 on a page that needs
  // nothing from the audio bytes to render.
  it('still resolves when the pre-cut download fails on an already-transcribed segment', async () => {
    segmentFindFirst.mockResolvedValue(buildSegment())
    downloadStorageObject.mockRejectedValue(
      new Error('Failed to download seg-1.mp3: Object not found'),
    )

    const setup = await loadStage4Setup({ segmentId: 'seg-1', user: USER })

    expect(setup?.audioAvailable).toBe(false)
    // The script-derived data survives: sentences and speaker chunks come from
    // the persisted transcription, not from storage.
    expect(setup?.sentences.map((s) => s.text)).toEqual(['一文目', '二文目'])
    expect(setup?.speakerChunks).toEqual(WHISPER_SEGMENTS)
    expect(setup?.didBackfill).toBe(false)
    expect(ensureStage4SentenceAudios).not.toHaveBeenCalled()
    expect(transcribeAudioWithSegments).not.toHaveBeenCalled()
  })

  it('falls back to text-only sentences when the backfill download fails', async () => {
    segmentFindFirst.mockResolvedValue(buildSegment({ whisperSegments: null }))
    downloadStorageObject.mockRejectedValue(
      new Error('Failed to download seg-1.mp3: Object not found'),
    )

    const setup = await loadStage4Setup({ segmentId: 'seg-1', user: USER })

    expect(setup?.audioAvailable).toBe(false)
    // Nothing to transcribe without the bytes, so Groq is never reached and
    // whisperSegments stays untouched.
    expect(transcribeAudioWithSegments).not.toHaveBeenCalled()
    expect(segmentUpdate).not.toHaveBeenCalled()
    expect(setup?.didBackfill).toBe(false)
    expect(setup?.speakerChunks).toEqual([])
    // Units are derived from the script text alone, so the page still has
    // something to show.
    expect(setup?.sentences.length).toBeGreaterThan(0)
    expect(setup?.sentences.map((s) => s.text).join('')).toBe('一文目二文目')
  })

  it('only downloads once when the audio object is missing', async () => {
    segmentFindFirst.mockResolvedValue(buildSegment({ whisperSegments: null }))
    downloadStorageObject.mockRejectedValue(new Error('Object not found'))

    await loadStage4Setup({ segmentId: 'seg-1', user: USER })

    // The backfill already proved the object is gone; the pre-cut must not
    // retry it.
    expect(downloadStorageObject).toHaveBeenCalledTimes(1)
  })
})
