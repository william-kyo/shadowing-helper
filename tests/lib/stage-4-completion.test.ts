// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { STAGE4_PASS_THRESHOLD } from '@/lib/cer'
import {
  emptyStage4Metadata,
  evaluateStage4Completion,
  isStage4Metadata,
  recordSentenceScore,
  type Stage4Metadata,
} from '@/lib/stage-4-completion'

describe('isStage4Metadata', () => {
  it('accepts a well-formed metadata object', () => {
    const md: Stage4Metadata = { sentences: [] }
    expect(isStage4Metadata(md)).toBe(true)
    expect(
      isStage4Metadata({
        sentences: [{ index: 0, score: 1, transcript: 'x', attempts: 1, passedAt: null }],
      }),
    ).toBe(true)
  })

  it('rejects malformed values', () => {
    expect(isStage4Metadata(null)).toBe(false)
    expect(isStage4Metadata({})).toBe(false)
    expect(isStage4Metadata({ sentences: [{ index: '0' }] })).toBe(false)
    expect(isStage4Metadata({ sentences: [{ index: 0, score: 1, transcript: 'x', attempts: 1, passedAt: 5 }] })).toBe(false)
  })
})

describe('recordSentenceScore', () => {
  it('inserts a fresh entry for a new sentence index', () => {
    const before = emptyStage4Metadata()
    const after = recordSentenceScore(before, { index: 0, score: 0.5, transcript: 'a' })
    expect(after.sentences).toEqual([
      { index: 0, score: 0.5, transcript: 'a', attempts: 1, passedAt: null },
    ])
  })

  it('keeps the higher score when a later attempt is worse', () => {
    let md = emptyStage4Metadata()
    md = recordSentenceScore(md, { index: 0, score: 0.9, transcript: 'good' })
    md = recordSentenceScore(md, { index: 0, score: 0.6, transcript: 'worse' })
    expect(md.sentences[0]?.score).toBe(0.9)
    expect(md.sentences[0]?.transcript).toBe('good')
    expect(md.sentences[0]?.attempts).toBe(2)
  })

  it('keeps the better transcript alongside the better score', () => {
    let md = emptyStage4Metadata()
    md = recordSentenceScore(md, { index: 0, score: 0.6, transcript: 'mid' })
    md = recordSentenceScore(md, { index: 0, score: 0.95, transcript: 'best' })
    expect(md.sentences[0]?.transcript).toBe('best')
    expect(md.sentences[0]?.score).toBe(0.95)
  })

  it('stamps passedAt the first time the score crosses the threshold', () => {
    let md = emptyStage4Metadata()
    md = recordSentenceScore(md, { index: 0, score: 0.5, transcript: 'a' })
    expect(md.sentences[0]?.passedAt).toBeNull()

    md = recordSentenceScore(md, { index: 0, score: STAGE4_PASS_THRESHOLD, transcript: 'a' })
    const passedAt = md.sentences[0]?.passedAt
    expect(passedAt).not.toBeNull()
    expect(() => new Date(passedAt!).toISOString()).not.toThrow()

    // Re-running with a worse score should not clear the existing timestamp.
    md = recordSentenceScore(md, { index: 0, score: 0.4, transcript: 'a' })
    expect(md.sentences[0]?.passedAt).toBe(passedAt)
  })

  it('keeps sentences sorted by index after insertion', () => {
    let md = emptyStage4Metadata()
    md = recordSentenceScore(md, { index: 2, score: 0.9, transcript: 'c' })
    md = recordSentenceScore(md, { index: 0, score: 0.9, transcript: 'a' })
    md = recordSentenceScore(md, { index: 1, score: 0.9, transcript: 'b' })
    expect(md.sentences.map((s) => s.index)).toEqual([0, 1, 2])
  })
})

describe('evaluateStage4Completion', () => {
  it('reports done=false when no sentences have been attempted', () => {
    const status = evaluateStage4Completion({ metadata: emptyStage4Metadata(), totalSentences: 3 })
    expect(status.done).toBe(false)
    expect(status.passedSentences).toBe(0)
    expect(status.failingSentenceIndices).toEqual([0, 1, 2])
  })

  it('reports done=true only when every sentence has at least one pass', () => {
    let md = emptyStage4Metadata()
    md = recordSentenceScore(md, { index: 0, score: 0.95, transcript: 'a' })
    md = recordSentenceScore(md, { index: 1, score: 0.9, transcript: 'b' })
    const status = evaluateStage4Completion({ metadata: md, totalSentences: 3 })
    expect(status.done).toBe(false)
    expect(status.passedSentences).toBe(2)
    expect(status.failingSentenceIndices).toEqual([2])
  })

  it('marks stage 4 done when all sentences passed', () => {
    let md = emptyStage4Metadata()
    md = recordSentenceScore(md, { index: 0, score: 0.95, transcript: 'a' })
    md = recordSentenceScore(md, { index: 1, score: 0.85, transcript: 'b' })
    const status = evaluateStage4Completion({ metadata: md, totalSentences: 2 })
    expect(status.done).toBe(true)
    expect(status.failingSentenceIndices).toEqual([])
    expect(status.passThreshold).toBe(STAGE4_PASS_THRESHOLD)
  })

  it('never marks done for a zero-sentence segment (degenerate case)', () => {
    const status = evaluateStage4Completion({ metadata: emptyStage4Metadata(), totalSentences: 0 })
    expect(status.done).toBe(false)
    expect(status.totalSentences).toBe(0)
  })

  it('treats null metadata as no attempts', () => {
    const status = evaluateStage4Completion({ metadata: null, totalSentences: 4 })
    expect(status.done).toBe(false)
    expect(status.passedSentences).toBe(0)
  })
})
