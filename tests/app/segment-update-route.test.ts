import { beforeEach, describe, expect, it, vi } from 'vitest'

const { segmentFindFirst, segmentUpdate, chatJson } = vi.hoisted(() => ({
  segmentFindFirst: vi.fn(),
  segmentUpdate: vi.fn(),
  chatJson: vi.fn(),
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

// Exercise the real speaker resolution; only the model call itself is stubbed.
vi.mock('@/lib/llm', () => ({ chatJson }))

vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: vi.fn() }))
vi.mock('@/lib/storage', () => ({ removeStorageObjects: vi.fn() }))

import { PATCH } from '@/app/api/segments/[segmentId]/route'

function buildRequest(body: unknown) {
  return new Request('http://localhost/api/segments/seg-1', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const buildContext = () => ({ params: Promise.resolve({ segmentId: 'seg-1' }) })

// One Whisper chunk per silence run, each spanning two speaker turns — the
// shape that made the annotator disagree with the script.
const CHUNKS = [
  {
    text: '山田さんの送別会の費用一人3000円でお願いします すみません今日は持ち合わせがなくて',
    startMs: 0,
    endMs: 8000,
  },
  {
    text: 'じゃあ私が立て替えておきましょうか えいいんですかすみません明日必ずお返しします',
    startMs: 8200,
    endMs: 16000,
  },
]

const SCRIPT = [
  'A: 山田さんの送別会の費用1人3000円でお願いします。',
  'B: すみません今日は持ち合わせがなくて。',
  'A: じゃあ私が立て替えておきましょうか。',
  'B: えいいんですか。すみません明日必ずお返しします。',
].join('\n')

describe('PATCH /api/segments/[segmentId]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    segmentFindFirst.mockResolvedValue({
      id: 'seg-1',
      audioPath: 'sb-user-1/audio/seg-1.mp3',
      text: 'A: 古い台本。',
      whisperSegments: CHUNKS,
    })
    segmentUpdate.mockImplementation(({ data }: { data: { text?: string } }) =>
      Promise.resolve({ text: data.text ?? null, notes: null }),
    )
    chatJson.mockResolvedValue({ speakers: [] })
  })

  it('re-cuts chunks onto the edited script so labels follow its turns', async () => {
    const response = await PATCH(buildRequest({ text: SCRIPT }), buildContext())
    expect(response.status).toBe(200)

    const persisted = segmentUpdate.mock.calls[0][0].data.whisperSegments
    expect(persisted.map((chunk: { speaker?: string }) => chunk.speaker)).toEqual([
      'A',
      'B',
      'A',
      'B',
    ])
    expect(persisted.map((chunk: { text: string }) => chunk.text)).toEqual([
      '山田さんの送別会の費用一人3000円でお願いします',
      'すみません今日は持ち合わせがなくて',
      'じゃあ私が立て替えておきましょうか',
      'えいいんですかすみません明日必ずお返しします',
    ])
    // Deriving from the script costs no LLM call.
    expect(chatJson).not.toHaveBeenCalled()
  })

  it('follows the learner swapping which voice owns a turn', async () => {
    // Same wording, A/B reversed on the first two lines.
    const swapped = SCRIPT.split('\n')
      .map((line, i) => (i < 2 ? (line.startsWith('A') ? `B${line.slice(1)}` : `A${line.slice(1)}`) : line))
      .join('\n')

    await PATCH(buildRequest({ text: swapped }), buildContext())

    const persisted = segmentUpdate.mock.calls[0][0].data.whisperSegments
    expect(persisted.map((chunk: { speaker?: string }) => chunk.speaker)).toEqual([
      'B',
      'A',
      'A',
      'B',
    ])
  })

  it('falls back to the model when the script has no A/B structure', async () => {
    chatJson.mockResolvedValue({
      speakers: [
        { index: 0, speaker: 'A' },
        { index: 1, speaker: 'B' },
      ],
    })

    await PATCH(buildRequest({ text: '普通の台本です。ラベルはありません。' }), buildContext())

    expect(chatJson).toHaveBeenCalledOnce()
    // No script turns to align to, so the chunks keep their original boundaries.
    const persisted = segmentUpdate.mock.calls[0][0].data.whisperSegments
    expect(persisted).toHaveLength(2)
    expect(persisted.map((chunk: { speaker?: string }) => chunk.speaker)).toEqual(['A', 'B'])
  })

  it('leaves the transcription alone when the script is unchanged', async () => {
    await PATCH(buildRequest({ text: 'A: 古い台本。' }), buildContext())

    expect(segmentUpdate.mock.calls[0][0].data).not.toHaveProperty('whisperSegments')
    expect(chatJson).not.toHaveBeenCalled()
  })

  it('still saves the script when the model is unavailable', async () => {
    chatJson.mockRejectedValue(new Error('llm down'))

    const response = await PATCH(
      buildRequest({ text: 'ラベルのない新しい台本。' }),
      buildContext(),
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({ text: 'ラベルのない新しい台本。' })
    // Chunks survive the outage unlabeled rather than the save failing.
    const persisted = segmentUpdate.mock.calls[0][0].data.whisperSegments
    expect(persisted.every((chunk: { speaker?: string }) => chunk.speaker === undefined)).toBe(true)
  })

  it('404s for a segment the user does not own', async () => {
    segmentFindFirst.mockResolvedValue(null)

    const response = await PATCH(buildRequest({ text: SCRIPT }), buildContext())

    expect(response.status).toBe(404)
    expect(segmentUpdate).not.toHaveBeenCalled()
  })
})
