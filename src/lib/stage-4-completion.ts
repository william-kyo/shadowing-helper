// Decide whether stage 4 (script-following shadowing) is finished for a
// segment, based on the per-sentence scoring state stored in
// `StageProgress.metadata`. The same logic is shared between:
//   - the recording upload route (so a single high-scoring attempt on the
//     final sentence can mark the whole stage complete)
//   - any future "resume" endpoint that the UI calls on mount
//
// Keeping the rule pure makes it cheap to test and safe to call from any
// layer (server route, scheduled job, e2e test, ...).

import { isPassingScore, STAGE4_PASS_THRESHOLD } from '@/lib/cer'

export type SentenceScore = {
  index: number
  score: number
  transcript: string
  attempts: number
  passedAt: string | null
}

export type Stage4Metadata = {
  sentences: SentenceScore[]
}

export function isStage4Metadata(value: unknown): value is Stage4Metadata {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  if (!Array.isArray(v.sentences)) return false
  return v.sentences.every((entry) => {
    if (!entry || typeof entry !== 'object') return false
    const e = entry as Record<string, unknown>
    return (
      typeof e.index === 'number' &&
      typeof e.score === 'number' &&
      typeof e.transcript === 'string' &&
      typeof e.attempts === 'number' &&
      (e.passedAt === null || typeof e.passedAt === 'string')
    )
  })
}

export function emptyStage4Metadata(): Stage4Metadata {
  return { sentences: [] }
}

// Upsert a single sentence's score into the metadata. Preserves the highest
// score seen so a later worse attempt doesn't regress the learner; only marks
// `passedAt` the first time the sentence crosses the threshold.
export function recordSentenceScore(
  metadata: Stage4Metadata,
  update: { index: number; score: number; transcript: string },
): Stage4Metadata {
  const sentences = [...metadata.sentences]
  const existingIndex = sentences.findIndex((s) => s.index === update.index)
  const existing = existingIndex >= 0 ? sentences[existingIndex] : null

  const merged: SentenceScore = {
    index: update.index,
    // Keep the best score across attempts.
    score: existing ? Math.max(existing.score, update.score) : update.score,
    transcript: existing && existing.score >= update.score ? existing.transcript : update.transcript,
    attempts: (existing?.attempts ?? 0) + 1,
    passedAt:
      existing?.passedAt ??
      (isPassingScore(update.score) ? new Date().toISOString() : null),
  }

  if (existingIndex >= 0) {
    sentences[existingIndex] = merged
  } else {
    sentences.push(merged)
  }
  return { sentences: sentences.sort((a, b) => a.index - b.index) }
}

export type Stage4CompletionStatus = {
  totalSentences: number
  passedSentences: number
  failingSentenceIndices: number[]
  // True only when every sentence in the segment has at least one passing
  // attempt recorded. With zero sentences the stage is never "complete" —
  // that's a degenerate case the caller should guard against.
  done: boolean
  passThreshold: number
}

export function evaluateStage4Completion(params: {
  metadata: Stage4Metadata | null
  totalSentences: number
}): Stage4CompletionStatus {
  const totalSentences = Math.max(0, Math.trunc(params.totalSentences))
  const sentences = params.metadata?.sentences ?? []
  const passed = sentences.filter((s) => isPassingScore(s.score))
  const passedIndices = new Set(passed.map((s) => s.index))
  const failing = Array.from({ length: totalSentences }, (_, i) => i)
    .filter((i) => !passedIndices.has(i))

  return {
    totalSentences,
    passedSentences: passedIndices.size,
    failingSentenceIndices: failing,
    done: totalSentences > 0 && failing.length === 0,
    passThreshold: STAGE4_PASS_THRESHOLD,
  }
}
