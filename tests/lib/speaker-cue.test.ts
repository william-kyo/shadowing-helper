// @vitest-environment node
import { describe, expect, it } from 'vitest'

import {
  buildSpeakerWindows,
  findSpeakerAt,
  isLearnerTurn,
} from '@/components/segment/speaker-cue-context'

const CHUNKS = [
  { startMs: 0, endMs: 1000 },
  { startMs: 1000, endMs: 2000 },
  { startMs: 2200, endMs: 3000 },
  { startMs: 3000, endMs: 4000 },
]

describe('buildSpeakerWindows', () => {
  it('merges adjacent chunks that share a speaker', () => {
    expect(buildSpeakerWindows(CHUNKS, ['A', 'A', 'B', 'B'])).toEqual([
      { startMs: 0, endMs: 2000, speaker: 'A' },
      { startMs: 2200, endMs: 4000, speaker: 'B' },
    ])
  })

  it('keeps same-speaker runs separate across an unlabeled gap', () => {
    // Chunk 1 is unlabeled, so A's two stretches must not merge across it —
    // the cue would otherwise claim the learner's turn covers silence.
    expect(buildSpeakerWindows(CHUNKS, ['A', null, 'A', 'B'])).toEqual([
      { startMs: 0, endMs: 1000, speaker: 'A' },
      { startMs: 2200, endMs: 3000, speaker: 'A' },
      { startMs: 3000, endMs: 4000, speaker: 'B' },
    ])
  })

  it('drops unlabeled chunks entirely', () => {
    expect(buildSpeakerWindows(CHUNKS, [null, null, null, null])).toEqual([])
    expect(buildSpeakerWindows(CHUNKS, [])).toEqual([])
  })
})

describe('findSpeakerAt', () => {
  const windows = buildSpeakerWindows(CHUNKS, ['A', 'A', 'B', 'B'])

  it('resolves a time inside a window to its speaker', () => {
    expect(findSpeakerAt(windows, 0)).toBe('A')
    expect(findSpeakerAt(windows, 1999)).toBe('A')
    expect(findSpeakerAt(windows, 2500)).toBe('B')
  })

  it('returns null in gaps, past the end, and with no windows', () => {
    // 2000–2200 is the silence between the two turns.
    expect(findSpeakerAt(windows, 2100)).toBeNull()
    expect(findSpeakerAt(windows, 4000)).toBeNull()
    expect(findSpeakerAt([], 500)).toBeNull()
  })

  it('treats a window end as belonging to the next turn, not this one', () => {
    expect(findSpeakerAt(windows, 3000)).toBe('B')
  })
})

describe('isLearnerTurn', () => {
  const windows = buildSpeakerWindows(CHUNKS, ['A', 'A', 'B', 'B'])

  it('is true only while the practiced role is speaking', () => {
    expect(isLearnerTurn({ windows, activeSpeaker: 'A' }, 500)).toBe(true)
    expect(isLearnerTurn({ windows, activeSpeaker: 'A' }, 2500)).toBe(false)
    expect(isLearnerTurn({ windows, activeSpeaker: 'B' }, 2500)).toBe(true)
    expect(isLearnerTurn({ windows, activeSpeaker: 'B' }, 500)).toBe(false)
  })

  it('keeps gaps and unlabeled stretches audible', () => {
    // 2000–2200 is the silence between the two turns.
    expect(isLearnerTurn({ windows, activeSpeaker: 'A' }, 2100)).toBe(false)
    expect(isLearnerTurn({ windows, activeSpeaker: 'B' }, 2100)).toBe(false)
    expect(isLearnerTurn({ windows, activeSpeaker: 'A' }, 9999)).toBe(false)
  })

  it('never mutes when the learner is shadowing both parts', () => {
    expect(isLearnerTurn({ windows, activeSpeaker: null }, 500)).toBe(false)
    expect(isLearnerTurn({ windows, activeSpeaker: null }, 2500)).toBe(false)
  })
})
