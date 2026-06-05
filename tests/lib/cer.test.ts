// @vitest-environment node
import { describe, expect, it } from 'vitest'

import {
  STAGE4_PASS_THRESHOLD,
  cerScore,
  isPassingScore,
  levenshtein,
  normalizeForCer,
} from '@/lib/cer'

describe('levenshtein', () => {
  it('returns 0 for identical strings', () => {
    expect(levenshtein('hello', 'hello')).toBe(0)
    expect(levenshtein('', '')).toBe(0)
  })

  it('counts insertions / deletions / substitutions symmetrically', () => {
    expect(levenshtein('kitten', 'sitting')).toBe(3)
    expect(levenshtein('sitting', 'kitten')).toBe(3)
  })

  it('returns length of the other string when one is empty', () => {
    expect(levenshtein('', 'abc')).toBe(3)
    expect(levenshtein('日本語', '')).toBe(3)
  })

  it('works on Japanese characters', () => {
    expect(levenshtein('こんにちは', 'こんばんは')).toBe(2)
  })

  it('is symmetric on inputs of different lengths', () => {
    const a = 'abc'
    const b = 'abcdef'
    expect(levenshtein(a, b)).toBe(levenshtein(b, a))
  })
})

describe('normalizeForCer', () => {
  it('strips Japanese sentence-final punctuation', () => {
    expect(normalizeForCer('こんにちは。')).toBe('こんにちは')
    expect(normalizeForCer('今日はいい天気です！')).toBe('今日はいい天気です')
  })

  it('strips brackets, quotes, and dashes', () => {
    expect(normalizeForCer('「これはテスト」です')).toBe('これはテストです')
    expect(normalizeForCer('hello - world')).toBe('helloworld')
  })

  it('strips speaker prefixes Whisper sometimes inserts', () => {
    expect(normalizeForCer('A: こんにちは')).toBe('こんにちは')
    expect(normalizeForCer('Ｂ：さようなら')).toBe('さようなら')
  })

  it('lowercases ASCII but leaves kana/kanji intact', () => {
    expect(normalizeForCer('Hello World')).toBe('helloworld')
    expect(normalizeForCer('カタカナ')).toBe('カタカナ')
  })

  it('strips full-width and half-width whitespace', () => {
    expect(normalizeForCer('  今日 は \u3000いい')).toBe('今日はいい')
  })
})

describe('cerScore', () => {
  it('scores 1.0 for a perfect match', () => {
    const result = cerScore('こんにちは', 'こんにちは')
    expect(result.score).toBe(1)
    expect(result.distance).toBe(0)
  })

  it('scores 1.0 for two empty strings (vacuously correct)', () => {
    expect(cerScore('', '').score).toBe(1)
  })

  it('scores 0.0 for a totally different string of the same length', () => {
    // "abc" vs "xyz" → 3 substitutions, max length 3 → score 0.
    expect(cerScore('abc', 'xyz').score).toBe(0)
  })

  it('treats differing punctuation as a perfect match', () => {
    const result = cerScore('こんにちは。', 'こんにちは')
    expect(result.score).toBe(1)
  })

  it('penalizes a single missing character proportionally', () => {
    // 5-char expected, 4-char actual → 1 char off, denom = max(5,4) = 5 → 0.8
    const result = cerScore('こんにちは', 'こんちは')
    expect(result.score).toBeCloseTo(0.8, 5)
  })

  it('penalizes an extra character proportionally', () => {
    // 4-char expected, 5-char actual → 1 char off, denom = max(4,5) = 5 → 0.8
    const result = cerScore('おはよう', 'おはようご')
    expect(result.score).toBeCloseTo(0.8, 5)
  })

  it('returns distance / length fields for downstream inspection', () => {
    const result = cerScore('abcdef', 'abcdez')
    expect(result.distance).toBe(1)
    expect(result.expectedLength).toBe(6)
    expect(result.actualLength).toBe(6)
  })
})

describe('STAGE4_PASS_THRESHOLD + isPassingScore', () => {
  it('uses 0.8 as the default threshold', () => {
    expect(STAGE4_PASS_THRESHOLD).toBe(0.8)
  })

  it('passes scores at or above the threshold', () => {
    expect(isPassingScore(1)).toBe(true)
    expect(isPassingScore(0.8)).toBe(true)
    expect(isPassingScore(0.79)).toBe(false)
    expect(isPassingScore(0)).toBe(false)
  })
})
