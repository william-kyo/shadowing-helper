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

  it('keeps short punctuation-free chunks intact', () => {
    const units = buildSentenceUnits([
      { text: '本日入社いたしました鈴木愛と申します', startMs: 0, endMs: 4500 },
      { text: '誠にありがとうございます', startMs: 4500, endMs: 5900 },
    ])
    expect(units).toHaveLength(2)
    expect(units[0]).toMatchObject({ index: 0, startMs: 0, endMs: 4500 })
    expect(units[1]).toMatchObject({ index: 1, startMs: 4500, endMs: 5900 })
  })

  it('splits an over-long merged chunk on whitespace with proportional timing', () => {
    // Modeled on a real Whisper tail chunk: two sentences merged into one
    // 15.4s chunk, separated only by a space.
    const first = '1日でも早く会社に役立つ人材となれるよう一生懸命頑張ります'
    const second = 'ご迷惑をおかけすることもあるかと思いますがどうぞご指導ご鞭撻のほどよろしくお願い致します'
    const units = buildSentenceUnits([
      { text: '身の引き締まる思いでいます', startMs: 24840, endMs: 26800 },
      { text: `${first} ${second}`, startMs: 26800, endMs: 42200 },
    ])
    expect(units).toHaveLength(3)
    expect(units[1]?.text).toBe(first)
    expect(units[2]?.text).toBe(second)
    // Boundaries stay contiguous and the tail lands exactly on the chunk end.
    expect(units[1]?.startMs).toBe(26800)
    expect(units[2]?.startMs).toBe(units[1]?.endMs)
    expect(units[2]?.endMs).toBe(42200)
    // Neither piece keeps the original 15.4s duration.
    expect(units[1]!.endMs - units[1]!.startMs).toBeLessThan(11000)
    expect(units[2]!.endMs - units[2]!.startMs).toBeLessThan(11000)
  })

  it('splits chunks on sentence-final punctuation even below the duration cap', () => {
    const units = buildSentenceUnits([
      { text: '今日は晴れです。明日は雨かもしれません。', startMs: 0, endMs: 6000 },
    ])
    expect(units.map((u) => u.text)).toEqual(['今日は晴れです。', '明日は雨かもしれません。'])
    expect(units[0]?.endMs).toBe(units[1]?.startMs)
    expect(units[1]?.endMs).toBe(6000)
  })

  it('falls back to comma boundaries when an over-long chunk has no spaces', () => {
    const clauseA = 'この会社に入ることができて本当に嬉しく思っており、'
    const clauseB = 'これから精一杯努力して参りますので、'
    const clauseC = 'どうぞよろしくお願いいたします'
    const units = buildSentenceUnits([
      { text: `${clauseA}${clauseB}${clauseC}`, startMs: 0, endMs: 18000 },
    ])
    expect(units.length).toBeGreaterThan(1)
    expect(units.map((u) => u.text).join('')).toBe(`${clauseA}${clauseB}${clauseC}`)
    for (const unit of units) {
      expect(unit.endMs - unit.startMs).toBeLessThanOrEqual(11000)
    }
    expect(units[units.length - 1]?.endMs).toBe(18000)
  })

  it('does not create fragments shorter than the practice minimum', () => {
    // The tiny trailing sentence merges into its neighbor instead of becoming
    // a sub-second unit.
    const units = buildSentenceUnits([
      { text: 'それでは早速始めていきたいと思います。はい。', startMs: 0, endMs: 5000 },
    ])
    expect(units).toHaveLength(1)
    expect(units[0]?.text).toBe('それでは早速始めていきたいと思います。はい。')
  })

  it('leaves an over-long chunk intact when it has no split boundary at all', () => {
    const text = 'ながいながいながいながいながいながいながいながいながいながい'
    const units = buildSentenceUnits([{ text, startMs: 0, endMs: 20000 }])
    expect(units).toHaveLength(1)
    expect(units[0]?.text).toBe(text)
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
