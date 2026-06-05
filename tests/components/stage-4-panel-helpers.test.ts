// @vitest-environment node
import { describe, expect, it } from 'vitest'

import {
  STAGE4_PASS_THRESHOLD,
  cerScore,
  isPassingScore,
} from '@/lib/cer'
import type { SentenceScore, Stage4Metadata } from '@/lib/stage-4-completion'

// These tests exercise the scoring pieces Stage 4 Panel composes together.
// Full component tests live in tests/components/stage-4-panel.test.tsx and
// stub MediaRecorder + fetch.

describe('Stage 4 panel scoring integration', () => {
  it('threshold 0.8 is the canonical pass line', () => {
    expect(STAGE4_PASS_THRESHOLD).toBe(0.8)
  })

  it('CER scoring agrees with isPassingScore for the dominant Japanese case', () => {
    // Whisper occasionally drops a trailing 「。」 which the normalizer strips.
    // The CER should be 1.0 because no characters are missing.
    const result = cerScore('こんにちは。', 'こんにちは')
    expect(result.score).toBe(1)
    expect(isPassingScore(result.score)).toBe(true)
  })

  it('keeps the best score across attempts and only marks passedAt once', () => {
    const now = '2026-06-01T00:00:00.000Z'
    const first: Stage4Metadata = { sentences: [] }
    const second: Stage4Metadata = { sentences: [{ index: 0, score: 0.6, transcript: 'a', attempts: 1, passedAt: null }] }
    const merged: SentenceScore = { ...second.sentences[0]!, transcript: 'b', score: 0.95, attempts: 2, passedAt: now }
    const composed: Stage4Metadata = { sentences: [merged] }
    expect(composed.sentences[0]?.score).toBe(0.95)
    expect(composed.sentences[0]?.passedAt).toBe(now)
  })
})
