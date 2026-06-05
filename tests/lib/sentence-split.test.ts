// @vitest-environment node
import { describe, expect, it } from 'vitest'

import type { WhisperSegment } from '@/lib/groq'
import {
  buildFallbackSentenceUnits,
  buildSentenceUnits,
  isPersistedWhisperSegments,
  whisperSegmentsToPersisted,
} from '@/lib/sentence-split'

function seg(text: string, start: number, end: number): WhisperSegment {
  return {
    id: 0,
    seek: 0,
    start,
    end,
    text,
    tokens: [],
    temperature: 0,
    avg_logprob: 0,
    compression_ratio: 0,
    no_speech_prob: 0,
  }
}

describe('whisperSegmentsToPersisted', () => {
  it('rounds seconds to integer milliseconds and trims text', () => {
    const out = whisperSegmentsToPersisted([
      seg('  こんにちは  ', 1.234, 2.567),
      seg('さようなら', 3.0, 4.5),
    ])
    expect(out).toEqual([
      { text: 'こんにちは', startMs: 1234, endMs: 2567 },
      { text: 'さようなら', startMs: 3000, endMs: 4500 },
    ])
  })
})

describe('isPersistedWhisperSegments', () => {
  it('accepts a well-formed array', () => {
    expect(
      isPersistedWhisperSegments([{ text: 'a', startMs: 0, endMs: 100 }]),
    ).toBe(true)
  })

  it('rejects non-arrays, missing fields, and bad types', () => {
    expect(isPersistedWhisperSegments(null)).toBe(false)
    expect(isPersistedWhisperSegments({})).toBe(false)
    expect(isPersistedWhisperSegments([{ text: 'a' }])).toBe(false)
    expect(isPersistedWhisperSegments([{ text: 'a', startMs: '0', endMs: 1 }])).toBe(false)
  })
})

describe('buildSentenceUnits', () => {
  it('returns an empty list when persisted data is missing', () => {
    expect(buildSentenceUnits(null)).toEqual([])
    expect(buildSentenceUnits(undefined)).toEqual([])
    expect(buildSentenceUnits([])).toEqual([])
  })

  it('assigns sequential 0-based indices and preserves order', () => {
    const units = buildSentenceUnits([
      { text: '一', startMs: 0, endMs: 500 },
      { text: '二', startMs: 600, endMs: 1200 },
      { text: '三', startMs: 1300, endMs: 2000 },
    ])
    expect(units.map((u) => u.index)).toEqual([0, 1, 2])
    expect(units.map((u) => u.text)).toEqual(['一', '二', '三'])
    expect(units[1]?.startMs).toBe(600)
  })

  it('drops empty and zero-length chunks', () => {
    const units = buildSentenceUnits([
      { text: '   ', startMs: 0, endMs: 100 },
      { text: '本物', startMs: 100, endMs: 200 },
      { text: '空', startMs: 200, endMs: 200 },
    ])
    expect(units).toHaveLength(1)
    expect(units[0]?.text).toBe('本物')
  })

  it('clamps negative timestamps to zero', () => {
    const units = buildSentenceUnits([
      { text: 'a', startMs: -5, endMs: 100 },
    ])
    expect(units[0]?.startMs).toBe(0)
  })
})

describe('buildFallbackSentenceUnits', () => {
  it('splits on Japanese sentence-final punctuation and assigns proportional durations', () => {
    const units = buildFallbackSentenceUnits({
      text: '今日は晴れです。明日は雨かもしれません。',
      totalStartMs: 0,
      totalEndMs: 6000,
    })
    expect(units).toHaveLength(2)
    expect(units[0]?.text).toBe('今日は晴れです。')
    expect(units[1]?.text).toBe('明日は雨かもしれません。')
    // 「今日は晴れです。」 = 8 chars, total = 20 chars → 8/20 * 6000 = 2400 ms
    expect(units[0]?.endMs).toBe(2400)
    // Last chunk always lands exactly on totalEndMs so the next reference
    // cut starts cleanly at the segment boundary.
    expect(units[units.length - 1]?.endMs).toBe(6000)
  })

  it('returns a single unit when there is no sentence-final punctuation', () => {
    const units = buildFallbackSentenceUnits({
      text: '改行なしのテキスト',
      totalStartMs: 1000,
      totalEndMs: 4000,
    })
    expect(units).toHaveLength(1)
    expect(units[0]).toEqual({
      index: 0,
      text: '改行なしのテキスト',
      startMs: 1000,
      endMs: 4000,
    })
  })

  it('returns an empty list for blank input', () => {
    expect(buildFallbackSentenceUnits({ text: '', totalStartMs: 0, totalEndMs: 1000 })).toEqual([])
    expect(buildFallbackSentenceUnits({ text: '   ', totalStartMs: 0, totalEndMs: 1000 })).toEqual([])
  })
})
