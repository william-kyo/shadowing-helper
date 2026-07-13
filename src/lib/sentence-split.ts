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

// Bumped whenever the splitting algorithm changes the sentence boundaries it
// produces for the same persisted input. Callers embed it in reference-audio
// URLs so browser caches of pre-cut clips are invalidated on algorithm change.
export const SENTENCE_SPLIT_VERSION = 2

// Whisper occasionally emits one chunk holding several sentences (typically at
// the tail of longer audio), which used to surface as a single very long
// stage 4 "sentence". Chunks projected past this cap are subdivided at natural
// text boundaries, with time allocated proportionally to character count.
const MAX_UNIT_DURATION_MS = 10_000
// Never let a subdivision produce a fragment shorter than this — it would be
// too short to shadow meaningfully.
const MIN_UNIT_DURATION_MS = 1_500

// Sentence-final punctuation is always a split point; softer boundaries
// (whitespace — Whisper's usual separator between merged sentences — then
// clause commas) are only used to break up over-long chunks.
const SENTENCE_END = /(?<=[。．！？!?\n])/g
const SOFT_BOUNDARIES: { pattern: RegExp; joiner: string }[] = [
  { pattern: /\s+/g, joiner: ' ' },
  { pattern: /(?<=[、，,])/g, joiner: '' },
]

function timedCharCount(text: string): number {
  return text.replace(/\s+/g, '').length
}

function splitNonEmpty(text: string, boundary: RegExp): string[] {
  return text
    .split(boundary)
    .map((piece) => piece.trim())
    .filter((piece) => piece.length > 0)
}

// Group consecutive atoms into runs whose projected duration stays under the
// cap, aiming for evenly sized runs so the tail doesn't end up much longer
// than the rest.
function packAtoms(atoms: string[], msPerChar: number, joiner: string): string[] {
  const totalMs = atoms.reduce((sum, atom) => sum + timedCharCount(atom) * msPerChar, 0)
  const groupCount = Math.max(1, Math.ceil(totalMs / MAX_UNIT_DURATION_MS))
  const targetMs = totalMs / groupCount

  const groups: string[] = []
  let current = ''
  let currentMs = 0
  for (const atom of atoms) {
    const atomMs = timedCharCount(atom) * msPerChar
    if (current && (currentMs >= targetMs || currentMs + atomMs > MAX_UNIT_DURATION_MS)) {
      groups.push(current)
      current = ''
      currentMs = 0
    }
    current = current ? `${current}${joiner}${atom}` : atom
    currentMs += atomMs
  }
  if (current) groups.push(current)
  return groups
}

// Break an over-long piece on progressively softer boundaries. A packed group
// can only still exceed the cap when it is a single unsplittable atom, in
// which case the next boundary level gets a chance; with no boundary left the
// piece is returned as-is (we can't invent split points without word
// timestamps).
function splitLongPiece(piece: string, msPerChar: number, level: number): string[] {
  if (timedCharCount(piece) * msPerChar <= MAX_UNIT_DURATION_MS) return [piece]
  const boundary = SOFT_BOUNDARIES[level]
  if (!boundary) return [piece]

  const atoms = splitNonEmpty(piece, boundary.pattern)
  if (atoms.length <= 1) return splitLongPiece(piece, msPerChar, level + 1)

  return packAtoms(atoms, msPerChar, boundary.joiner).flatMap((group) =>
    splitLongPiece(group, msPerChar, level + 1),
  )
}

// Fold pieces projected under the minimum duration into a neighbor so a split
// never yields fragments too short to practice against.
function mergeTinyPieces(pieces: string[], msPerChar: number): string[] {
  const merged = [...pieces]
  for (let i = 0; i < merged.length; ) {
    if (merged.length > 1 && timedCharCount(merged[i]) * msPerChar < MIN_UNIT_DURATION_MS) {
      if (i + 1 < merged.length) {
        merged[i + 1] = `${merged[i]}${merged[i + 1]}`
      } else {
        merged[i - 1] = `${merged[i - 1]}${merged[i]}`
      }
      merged.splice(i, 1)
    } else {
      i += 1
    }
  }
  return merged
}

// Subdivide one timed chunk of text into shadowing-sized units. Sentence-final
// punctuation always splits; over-long remainders fall back to softer
// boundaries. Time is distributed proportionally to character count, with the
// last unit pinned to endMs so adjacent reference cuts stay gapless.
function subdivideChunk(params: {
  text: string
  startMs: number
  endMs: number
}): Omit<SentenceUnit, 'index'>[] {
  const text = params.text.trim()
  const durationMs = params.endMs - params.startMs
  if (!text || durationMs <= 0) return []

  const totalChars = timedCharCount(text)
  const msPerChar = totalChars === 0 ? 0 : durationMs / totalChars

  const sentences = splitNonEmpty(text, SENTENCE_END)
  const pieces = mergeTinyPieces(
    sentences.flatMap((sentence) => splitLongPiece(sentence, msPerChar, 0)),
    msPerChar,
  )
  if (pieces.length === 0) return []

  const pieceChars = pieces.reduce((sum, piece) => sum + timedCharCount(piece), 0)
  const units: Omit<SentenceUnit, 'index'>[] = []
  let cursor = params.startMs
  pieces.forEach((piece, index) => {
    const share = pieceChars === 0 ? 0 : timedCharCount(piece) / pieceChars
    const endMs =
      index === pieces.length - 1 ? params.endMs : cursor + Math.round(durationMs * share)
    units.push({ text: piece, startMs: cursor, endMs })
    cursor = endMs
  })
  return units
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
    .flatMap((entry) => subdivideChunk(entry))
    .map((entry, index) => ({ ...entry, index }))
}

// Last-resort client-side fallback: subdivide the segment's merged text the
// same way a single whisper chunk would be. This is approximate by design —
// the authoritative path is the persisted Whisper timestamps.
export function buildFallbackSentenceUnits(params: {
  text: string
  totalStartMs: number
  totalEndMs: number
}): SentenceUnit[] {
  return subdivideChunk({
    text: params.text,
    startMs: params.totalStartMs,
    endMs: params.totalEndMs,
  }).map((entry, index) => ({ ...entry, index }))
}
