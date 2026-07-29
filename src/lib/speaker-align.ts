// Derive per-chunk speaker labels from the segment's A:/B: script, splitting
// timed chunks wherever a turn boundary falls inside one.
//
// Whisper cuts chunks on silence, not on turns, so a single chunk routinely
// carries the tail of one speaker's line plus the head of the other's. Labeling
// at raw chunk granularity therefore can't reproduce the turn structure the
// learner reads in the script. The script is the authoritative source — it is
// what they see and hand-correct — so we align it onto the chunk character
// stream and cut the chunks to match, distributing time proportionally to
// character count.

import type { PersistedWhisperSegment, Speaker } from '@/lib/sentence-split'

const TURN_LINE = /^\s*([ABＡＢ])\s*[:：]\s*(.*)$/
// Punctuation and spacing the script carries but the raw transcript may not
// (and vice versa) — ignored when matching the two character streams.
const IGNORED = /[\s。、．，！？!?,.：:；;「」『』（）()]/g

// The script and the chunks can come from different transcription runs, so
// small wording drift ("1人" vs "一人") is expected. Below this ratio of matched
// characters the two texts are assumed unrelated and alignment is refused.
const MIN_SIMILARITY = 0.8
// Guard on the O(n*m) alignment table (4 bytes per cell, so ~8MB at the cap).
// A segment script is a handful of sentences, orders of magnitude below this.
const MAX_ALIGN_CELLS = 2_000_000

type Turn = { speaker: Speaker; text: string }

function normalize(text: string): string {
  return text.replace(IGNORED, '')
}

// Split a dialogue script into speaker turns. Returns null unless every
// non-empty line carries an A:/B: label — a script without them (or a
// half-edited one) has no turn structure to align against.
export function parseDialogueTurns(script: string): Turn[] | null {
  const turns: Turn[] = []
  for (const line of script.split('\n')) {
    if (!line.trim()) continue
    const match = TURN_LINE.exec(line)
    if (!match) return null
    const speaker: Speaker = match[1] === 'B' || match[1] === 'Ｂ' ? 'B' : 'A'
    const text = normalize(match[2])
    if (!text) continue
    // Merge consecutive lines from the same voice: they are one turn as far as
    // the learner's shadowing is concerned, and splitting between them would
    // add annotator rows that carry no decision.
    const last = turns[turns.length - 1]
    if (last && last.speaker === speaker) last.text += text
    else turns.push({ speaker, text })
  }
  return turns.length > 0 ? turns : null
}

// Longest common subsequence, returned as the matched (aIndex, bIndex) pairs in
// ascending order. Used as a character-level diff so turn boundaries survive
// small wording differences between the script and the transcript.
function matchedPairs(a: string, b: string): [number, number][] {
  const n = a.length
  const m = b.length
  const width = m + 1
  const dp = new Int32Array((n + 1) * width)
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      dp[i * width + j] =
        a[i] === b[j]
          ? dp[(i + 1) * width + j + 1] + 1
          : Math.max(dp[(i + 1) * width + j], dp[i * width + j + 1])
    }
  }

  const pairs: [number, number][] = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      pairs.push([i, j])
      i += 1
      j += 1
    } else if (dp[(i + 1) * width + j] >= dp[i * width + j + 1]) {
      i += 1
    } else {
      j += 1
    }
  }
  return pairs
}

// Raw-text offset at which `count` non-ignored characters have been consumed.
function rawOffsetAt(text: string, count: number): number {
  if (count <= 0) return 0
  let seen = 0
  for (let i = 0; i < text.length; i += 1) {
    if (!normalize(text[i])) continue
    seen += 1
    if (seen === count) return i + 1
  }
  return text.length
}

// Which turn owns a chunk-stream offset. `turnStarts[i]` is where turn i begins
// in chunk-character space, so the last start at or before the offset wins.
function speakerAt(turns: Turn[], turnStarts: number[], offset: number): Speaker {
  let speaker = turns[0].speaker
  for (let i = 0; i < turnStarts.length; i += 1) {
    if (turnStarts[i] > offset) break
    speaker = turns[i].speaker
  }
  return speaker
}

// Re-cut `chunks` so every piece belongs to exactly one speaker turn of
// `script`. Returns null when the script has no A:/B: structure or has drifted
// too far from the transcript to align — callers should fall back to guessing.
export function alignSpeakersToScript(
  chunks: readonly PersistedWhisperSegment[],
  script: string,
): PersistedWhisperSegment[] | null {
  const turns = parseDialogueTurns(script)
  if (!turns) return null

  const usable = chunks.filter(
    (chunk) => normalize(chunk.text).length > 0 && chunk.endMs > chunk.startMs,
  )
  if (usable.length === 0) return null

  const scriptText = turns.map((turn) => turn.text).join('')
  const chunkText = usable.map((chunk) => normalize(chunk.text)).join('')
  if (scriptText.length * chunkText.length > MAX_ALIGN_CELLS) return null

  const pairs = matchedPairs(scriptText, chunkText)
  if (pairs.length < MIN_SIMILARITY * Math.max(scriptText.length, chunkText.length)) {
    return null
  }

  // Absolute offset into the script stream where each turn ends.
  const turnEnds: number[] = []
  let acc = 0
  for (const turn of turns) {
    acc += turn.text.length
    turnEnds.push(acc)
  }

  // Project each turn end onto the chunk stream: the first script character at
  // or after the boundary that has a match tells us where the next turn starts.
  // Boundaries and pairs are both ascending, so one walk covers them all.
  const cutPoints: number[] = []
  let pairIndex = 0
  for (const end of turnEnds.slice(0, -1)) {
    while (pairIndex < pairs.length && pairs[pairIndex][0] < end) pairIndex += 1
    cutPoints.push(pairIndex < pairs.length ? pairs[pairIndex][1] : chunkText.length)
  }

  // Where each turn begins in chunk-character space; turn 0 always starts at 0.
  const turnStarts = [0, ...cutPoints]

  const out: PersistedWhisperSegment[] = []
  let consumed = 0
  for (const chunk of usable) {
    const raw = chunk.text
    const length = normalize(raw).length
    const durationMs = chunk.endMs - chunk.startMs
    // Turn boundaries strictly inside this chunk, as chunk-relative offsets.
    const cuts = cutPoints
      .filter((point) => point > consumed && point < consumed + length)
      .map((point) => point - consumed)

    let pieceStart = 0
    let cursor = chunk.startMs
    const pieceEnds = [...cuts, length]
    pieceEnds.forEach((pieceEnd, index) => {
      const text = raw.slice(rawOffsetAt(raw, pieceStart), rawOffsetAt(raw, pieceEnd)).trim()
      // Pin the final piece to the chunk's own end so adjacent reference cuts
      // stay gapless despite the proportional rounding.
      const endMs =
        index === pieceEnds.length - 1
          ? chunk.endMs
          : cursor + Math.round((durationMs * (pieceEnd - pieceStart)) / length)
      if (text) {
        out.push({
          text,
          startMs: cursor,
          endMs,
          speaker: speakerAt(turns, turnStarts, consumed + pieceStart),
        })
      }
      pieceStart = pieceEnd
      cursor = endMs
    })
    consumed += length
  }

  return out.length > 0 ? out : null
}
