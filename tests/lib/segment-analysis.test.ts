// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

const chatJson = vi.hoisted(() => vi.fn())
vi.mock('@/lib/llm', () => ({ chatJson }))

const { guessSpeakers } = await import('@/lib/segment-analysis')

const CHUNKS = [
  { text: 'おはようございます。', startMs: 0, endMs: 1500 },
  { text: 'おはよう。', startMs: 2600, endMs: 3400 },
  { text: '今日はいい天気ですね。', startMs: 3500, endMs: 5000 },
]

describe('guessSpeakers', () => {
  beforeEach(() => {
    chatJson.mockReset()
  })

  it('returns an empty list without calling the model for no chunks', async () => {
    expect(await guessSpeakers([])).toEqual([])
    expect(chatJson).not.toHaveBeenCalled()
  })

  it('maps labels onto their chunk positions', async () => {
    chatJson.mockResolvedValue({
      speakers: [
        { index: 0, speaker: 'A' },
        { index: 1, speaker: 'B' },
        { index: 2, speaker: 'B' },
      ],
    })
    expect(await guessSpeakers(CHUNKS)).toEqual(['A', 'B', 'B'])
  })

  it('leaves omitted chunks unlabeled', async () => {
    chatJson.mockResolvedValue({ speakers: [{ index: 1, speaker: 'B' }] })
    expect(await guessSpeakers(CHUNKS)).toEqual([null, 'B', null])
  })

  it('ignores out-of-range indices and unknown speaker values', async () => {
    chatJson.mockResolvedValue({
      speakers: [
        { index: 0, speaker: 'A' },
        { index: 9, speaker: 'B' },
        { index: -1, speaker: 'A' },
        { index: 2, speaker: 'C' },
        { index: 1.5, speaker: 'B' },
        'garbage',
        null,
      ],
    })
    expect(await guessSpeakers(CHUNKS)).toEqual(['A', null, null])
  })

  it('falls back to unlabeled on a malformed response or a model failure', async () => {
    chatJson.mockResolvedValue({ nope: true })
    expect(await guessSpeakers(CHUNKS)).toEqual([null, null, null])

    chatJson.mockRejectedValue(new Error('upstream down'))
    expect(await guessSpeakers(CHUNKS)).toEqual([null, null, null])
  })

  it('feeds the model silence gaps between chunks as turn-change signals', async () => {
    chatJson.mockResolvedValue({ speakers: [] })
    await guessSpeakers(CHUNKS)
    const prompt = chatJson.mock.calls[0]?.[0]?.prompt as string
    // 2600ms - 1500ms = 1.1s pause before chunk 1.
    expect(prompt).toContain('[1] (gap 1.1s) "おはよう。"')
    expect(prompt).toContain('[0] (gap 0.0s)')
  })
})
