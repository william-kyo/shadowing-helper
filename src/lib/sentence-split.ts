// Build the list of natural sentence units that stage 4 (script-following
// shadowing) iterates over. The authoritative source is the Whisper
// sub-segments persisted on `Segment.whisperSegments` (populated by the
// transcribe / auto-segment routes); we deserialize them and assign 0-based
// indices the UI can target.

import type { WhisperSegment } from '@/lib/groq'

export type SentenceUnit = {
  index: number
  text: string
  startMs: number
  endMs: number
}

// Persisted JSON shape on Segment.whisperSegments. Kept narrow + versionable
// so future migrations (e.g. adding speaker labels) are easy to detect.
export type PersistedWhisperSegment = {
  text: string
  startMs: number
  endMs: number
}

export function isPersistedWhisperSegments(value: unknown): value is PersistedWhisperSegment[] {
  if (!Array.isArray(value)) return false
  return value.every((entry) => {
    if (!entry || typeof entry !== 'object') return false
    const e = entry as Record<string, unknown>
    return (
      typeof e.text === 'string' &&
      typeof e.startMs === 'number' &&
      typeof e.endMs === 'number'
    )
  })
}

// Convert raw Whisper response segments into the persisted shape. Used at
// transcribe / auto-segment time to backfill the column.
export function whisperSegmentsToPersisted(segments: WhisperSegment[]): PersistedWhisperSegment[] {
  return segments.map((s) => ({
    text: s.text.trim(),
    startMs: Math.round(s.start * 1000),
    endMs: Math.round(s.end * 1000),
  }))
}

// Build the SentenceUnit list the stage 4 panel renders against. Empty input
// is a valid outcome (manually created segments with no Whisper run) and
// returns an empty array; callers should fall back to client-side splitting.
export function buildSentenceUnits(persisted: PersistedWhisperSegment[] | null | undefined): SentenceUnit[] {
  if (!persisted || persisted.length === 0) return []
  return persisted
    .map((entry) => ({
      text: entry.text.trim(),
      startMs: Math.max(0, Math.trunc(entry.startMs)),
      endMs: Math.max(0, Math.trunc(entry.endMs)),
    }))
    // Drop empty / zero-length chunks that Whisper occasionally emits.
    .filter((entry) => entry.text.length > 0 && entry.endMs > entry.startMs)
    .map((entry, index) => ({ ...entry, index }))
}

// Last-resort client-side fallback: split the segment's merged text on
// Japanese sentence-final punctuation. Each chunk gets a duration assigned
// proportionally to its character count so the reference audio cut still
// reflects the segment's actual length. This is approximate by design — the
// authoritative path is the persisted Whisper timestamps.
const SENTENCE_END = /(?<=[。！？!?\n])/g

export function buildFallbackSentenceUnits(params: {
  text: string
  totalStartMs: number
  totalEndMs: number
}): SentenceUnit[] {
  const { text, totalStartMs, totalEndMs } = params
  const trimmed = text.trim()
  if (!trimmed) return []

  const chunks = trimmed
    .split(SENTENCE_END)
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length > 0)
  if (chunks.length === 0) return []

  const totalChars = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
  const totalDurationMs = Math.max(0, totalEndMs - totalStartMs)
  const units: SentenceUnit[] = []
  let cursor = totalStartMs
  chunks.forEach((chunk, index) => {
    const share = totalChars === 0 ? 0 : chunk.length / totalChars
    const duration = Math.round(totalDurationMs * share)
    const startMs = cursor
    const endMs = index === chunks.length - 1 ? totalEndMs : cursor + duration
    units.push({ index, text: chunk, startMs, endMs })
    cursor = endMs
  })
  return units
}
