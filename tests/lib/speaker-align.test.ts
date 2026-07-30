// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { alignSpeakersToScript, parseDialogueTurns } from '@/lib/speaker-align'

describe('parseDialogueTurns', () => {
  it('reads A:/B: lines and strips punctuation', () => {
    expect(parseDialogueTurns('A: こんにちは。\nB: やあ、元気？')).toEqual([
      { speaker: 'A', text: 'こんにちは' },
      { speaker: 'B', text: 'やあ元気' },
    ])
  })

  it('merges consecutive lines from the same voice', () => {
    expect(parseDialogueTurns('A: はい。\nA: そうです。\nB: なるほど。')).toEqual([
      { speaker: 'A', text: 'はいそうです' },
      { speaker: 'B', text: 'なるほど' },
    ])
  })

  it('accepts full-width labels and colons', () => {
    expect(parseDialogueTurns('Ａ：こんにちは\nＢ：どうも')).toEqual([
      { speaker: 'A', text: 'こんにちは' },
      { speaker: 'B', text: 'どうも' },
    ])
  })

  it('rejects a script that is not fully labeled', () => {
    expect(parseDialogueTurns('A: こんにちは。\nラベルのない行。')).toBeNull()
    expect(parseDialogueTurns('ただの本文です。')).toBeNull()
    expect(parseDialogueTurns('')).toBeNull()
  })
})

describe('alignSpeakersToScript', () => {
  it('splits a chunk that spans a turn change', () => {
    // Whisper cut on silence, so one chunk holds both halves of the exchange.
    const chunks = [{ text: 'こんにちは やあ元気', startMs: 0, endMs: 1800 }]

    // Time splits on character count: 5 of the 9 characters are A's.
    expect(alignSpeakersToScript(chunks, 'A: こんにちは。\nB: やあ、元気？')).toEqual([
      { text: 'こんにちは', startMs: 0, endMs: 1000, speaker: 'A' },
      { text: 'やあ元気', startMs: 1000, endMs: 1800, speaker: 'B' },
    ])
  })

  it('handles the two-turns-per-chunk transcript from a real segment', () => {
    // Reported case: 4 script turns arriving as 2 chunks, so the annotator
    // showed 2 rows that each mixed both voices.
    const chunks = [
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
    const script = [
      'A: 山田さんの送別会の費用1人3000円でお願いします。',
      'B: すみません今日は持ち合わせがなくて。',
      'A: じゃあ私が立て替えておきましょうか。',
      'B: えいいんですか。すみません明日必ずお返しします。',
    ].join('\n')

    const aligned = alignSpeakersToScript(chunks, script)

    // One piece per turn, in order, alternating voices — matching the script
    // even though "1人" in the script reads "一人" in the transcript.
    expect(aligned?.map((piece) => piece.speaker)).toEqual(['A', 'B', 'A', 'B'])
    expect(aligned?.map((piece) => piece.text)).toEqual([
      '山田さんの送別会の費用一人3000円でお願いします',
      'すみません今日は持ち合わせがなくて',
      'じゃあ私が立て替えておきましょうか',
      'えいいんですかすみません明日必ずお返しします',
    ])
    // Pieces stay inside their source chunk and remain gapless within it.
    expect(aligned?.[0].startMs).toBe(0)
    expect(aligned?.[0].endMs).toBe(aligned?.[1].startMs)
    expect(aligned?.[1].endMs).toBe(8000)
    expect(aligned?.[2].startMs).toBe(8200)
    expect(aligned?.[3].endMs).toBe(16000)
  })

  it('keeps punctuation that ends a chunk or a turn', () => {
    // Regression: pieces used to be cut at the last *content* character, which
    // silently ate the trailing 。and ？ off every chunk.
    const chunks = [
      { text: 'こんにちは。元気ですか？', startMs: 0, endMs: 2000 },
      { text: 'はい、元気です。', startMs: 2000, endMs: 3000 },
    ]

    const aligned = alignSpeakersToScript(
      chunks,
      'A: こんにちは。元気ですか？\nB: はい、元気です。',
    )

    expect(aligned?.map((piece) => piece.text)).toEqual([
      'こんにちは。元気ですか？',
      'はい、元気です。',
    ])
  })

  it('attaches punctuation at an in-chunk turn change to the turn it closes', () => {
    const chunks = [{ text: 'こんにちは。やあ、元気？', startMs: 0, endMs: 2000 }]

    const aligned = alignSpeakersToScript(chunks, 'A: こんにちは。\nB: やあ、元気？')

    expect(aligned?.map((piece) => piece.text)).toEqual(['こんにちは。', 'やあ、元気？'])
  })

  it('leaves chunks whole when they already match turn boundaries', () => {
    const chunks = [
      { text: 'こんにちは', startMs: 0, endMs: 1000 },
      { text: 'やあ元気', startMs: 1200, endMs: 2000 },
    ]

    expect(alignSpeakersToScript(chunks, 'A: こんにちは。\nB: やあ、元気？')).toEqual([
      { text: 'こんにちは', startMs: 0, endMs: 1000, speaker: 'A' },
      { text: 'やあ元気', startMs: 1200, endMs: 2000, speaker: 'B' },
    ])
  })

  it('spreads one turn across the chunks it covers', () => {
    const chunks = [
      { text: 'こんにちは', startMs: 0, endMs: 1000 },
      { text: '今日はいい天気ですね やあ', startMs: 1000, endMs: 3000 },
    ]
    const aligned = alignSpeakersToScript(chunks, 'A: こんにちは。今日はいい天気ですね。\nB: やあ。')

    expect(aligned?.map((piece) => piece.speaker)).toEqual(['A', 'A', 'B'])
    expect(aligned?.map((piece) => piece.text)).toEqual([
      'こんにちは',
      '今日はいい天気ですね',
      'やあ',
    ])
  })

  it('refuses to align a script that is not a dialogue', () => {
    const chunks = [{ text: 'こんにちは', startMs: 0, endMs: 1000 }]
    expect(alignSpeakersToScript(chunks, 'こんにちは。')).toBeNull()
  })

  it('refuses to align a script reworded away from the transcript', () => {
    const chunks = [{ text: 'こんにちは', startMs: 0, endMs: 1000 }]
    expect(alignSpeakersToScript(chunks, 'A: 全然ちがう文章です。\nB: そうですね。')).toBeNull()
  })

  it('returns null when there is nothing usable to label', () => {
    expect(alignSpeakersToScript([], 'A: こんにちは。')).toBeNull()
    expect(
      alignSpeakersToScript([{ text: 'こんにちは', startMs: 500, endMs: 500 }], 'A: こんにちは。'),
    ).toBeNull()
  })
})
