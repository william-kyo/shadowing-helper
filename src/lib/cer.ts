// Character Error Rate (CER) for stage 4 shadowing scoring.
//
// We transcribe the user's recording with Whisper and compare it character by
// character against the expected sentence. The raw Levenshtein distance is
// normalized by the max length so the score lives in [0, 1] regardless of
// whether the user under- or over-said. Japanese needs no inter-word spaces,
// so we strip every punctuation/space variant before comparing — otherwise
// a missing 「。」would tank the score for a perfect read.

// Char-level Levenshtein. Operates on string code units; for CJK this is the
// same as codepoint distance (BMP characters), which is good enough for short
// shadowing sentences. Inlined to keep this module dependency-free.
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  if (a.length === 0) return b.length
  if (b.length === 0) return a.length

  // Two-row DP. Track the previous row only; memory stays O(min(a, b)).
  let s1 = a
  let s2 = b
  if (s1.length > s2.length) {
    const tmp = s1
    s1 = s2
    s2 = tmp
  }

  const m = s1.length
  const n = s2.length
  let prev = new Array<number>(m + 1)
  let curr = new Array<number>(m + 1)
  for (let i = 0; i <= m; i++) prev[i] = i

  for (let j = 1; j <= n; j++) {
    curr[0] = j
    const c2 = s2.charCodeAt(j - 1)
    for (let i = 1; i <= m; i++) {
      const cost = s1.charCodeAt(i - 1) === c2 ? 0 : 1
      const del = prev[i] + 1
      const ins = curr[i - 1] + 1
      const sub = prev[i - 1] + cost
      curr[i] = del < ins ? (del < sub ? del : sub) : ins < sub ? ins : sub
    }
    const tmp = prev
    prev = curr
    curr = tmp
  }

  return prev[m]
}

// Strip everything that should NOT count against the learner: punctuation,
// full-width / half-width whitespace, common Japanese quote marks, dialog
// labels Whisper sometimes inserts, and stray ASCII noise.
const STRIP_PATTERN =
  /[\s。、．，！？!?,.：:；;「」『』（）()【】\[\]『』「」"'`´~～\-\\/\\|@#\$%\^&\*\+=<>《》]/g

export function normalizeForCer(input: string): string {
  return input
    // Speaker prefixes Whisper occasionally adds (e.g. "A:" / "B:") must be
    // stripped BEFORE the punctuation pass, otherwise the `:` is gone and the
    // remaining letter smears into the next character.
    .replace(/^[A-Za-zＡ-Ｚａ-ｚ]\s*[:：]\s*/g, '')
    .replace(STRIP_PATTERN, '')
    .toLowerCase()
    .trim()
}

export type CerResult = {
  score: number
  expectedLength: number
  actualLength: number
  distance: number
}

// Compute the CER-derived similarity score in [0, 1]. 1 = perfect match,
// 0 = no overlap. Both empty strings are scored 1 (vacuously correct).
export function cerScore(expected: string, actual: string): CerResult {
  const e = normalizeForCer(expected)
  const a = normalizeForCer(actual)
  const distance = levenshtein(e, a)
  const denom = Math.max(e.length, a.length, 1)
  return {
    score: 1 - distance / denom,
    expectedLength: e.length,
    actualLength: a.length,
    distance,
  }
}

// Threshold below which a recording is considered a pass. Centralized so it
// can be tuned (or A/B tested) without hunting through call sites.
export const STAGE4_PASS_THRESHOLD = 0.8

export function isPassingScore(score: number): boolean {
  return score >= STAGE4_PASS_THRESHOLD
}
