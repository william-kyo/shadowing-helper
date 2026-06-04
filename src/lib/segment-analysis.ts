import type { WhisperSegment } from '@/lib/groq'
import { chatJson } from '@/lib/llm'

export interface TopicSegment {
  title: string
  startIndex: number
  endIndex: number
  text: string
}

// Gap (in seconds) below which two segments are unlikely to be a topic break;
// surfaced to the model as a boundary signal.
const BOUNDARY_GAP_HINT = 1.0

// Reconstruct the authoritative paragraph text straight from the Whisper
// segments — never trust an LLM-rebuilt text, and never join with spaces
// (Japanese has no inter-word spaces).
function reconstructText(segments: WhisperSegment[], startIndex: number, endIndex: number): string {
  return segments
    .slice(startIndex, endIndex + 1)
    .map((s) => s.text.trim())
    .join('')
}

function extractParagraphs(parsed: unknown): unknown[] {
  if (parsed && typeof parsed === 'object') {
    const obj = parsed as Record<string, unknown>
    for (const key of ['paragraphs', 'topics', 'segments']) {
      if (Array.isArray(obj[key])) return obj[key] as unknown[]
    }
  }
  if (Array.isArray(parsed)) return parsed
  throw new Error(`Unexpected LLM response format: ${JSON.stringify(parsed)?.slice(0, 200)}`)
}

// Clamp/repair the model's index ranges so the result contiguously covers
// [0, N-1] with no gaps or overlaps. Falls back to a single paragraph if the
// model output is unusable.
function normalize(rawParagraphs: unknown[], segments: WhisperSegment[]): TopicSegment[] {
  const lastIndex = segments.length - 1

  const candidates = rawParagraphs
    .map((p) => {
      const obj = (p ?? {}) as Record<string, unknown>
      const start = Number(obj.startIndex)
      const end = Number(obj.endIndex)
      if (!Number.isFinite(start) || !Number.isFinite(end)) return null
      return {
        title: typeof obj.title === 'string' ? obj.title : '',
        startIndex: Math.max(0, Math.min(lastIndex, Math.trunc(start))),
        endIndex: Math.max(0, Math.min(lastIndex, Math.trunc(end))),
        text: typeof obj.text === 'string' ? obj.text.trim() : '',
      }
    })
    .filter((p): p is TopicSegment => p !== null && p.startIndex <= p.endIndex)
    .sort((a, b) => a.startIndex - b.startIndex)

  if (candidates.length === 0) {
    return [{ title: '本文', startIndex: 0, endIndex: lastIndex, text: reconstructText(segments, 0, lastIndex) }]
  }

  // Walk the sorted ranges, closing gaps and trimming overlaps so coverage is
  // contiguous from index 0 onward.
  const result: TopicSegment[] = []
  let cursor = 0
  for (const candidate of candidates) {
    if (candidate.endIndex < cursor) continue // fully overlapped by a prior paragraph
    const startIndex = Math.max(cursor, candidate.startIndex)
    const endIndex = candidate.endIndex
    const rawText = reconstructText(segments, startIndex, endIndex)
    result.push({
      title: candidate.title || '本文',
      startIndex,
      endIndex,
      // Keep the model's punctuated text only when it preserves the original
      // wording (ignoring punctuation/spaces); otherwise fall back to raw.
      text: isWordingPreserved(candidate.text, rawText) ? candidate.text : rawText,
    })
    cursor = endIndex + 1
  }

  // Any tail segments the model dropped become a final paragraph.
  if (cursor <= lastIndex) {
    result.push({ title: '本文', startIndex: cursor, endIndex: lastIndex, text: reconstructText(segments, cursor, lastIndex) })
  }

  return result
}

const PUNCTUATION_AND_SPACE = /[\s。、．，！？!?,.：:；;「」『』（）()]/g

// Guard against hallucination: the punctuated text must match the raw text once
// punctuation and whitespace are stripped.
// Strip line-leading speaker labels (e.g. "A:", "Ｂ：") so dialogue-mode output
// can still be compared against the unlabeled raw transcript.
const SPEAKER_LABEL = /^\s*[A-Za-zＡ-Ｚａ-ｚ]\s*[:：]\s*/

function isWordingPreserved(modelText: string, rawText: string): boolean {
  if (!modelText) return false
  const strip = (s: string) =>
    s
      .split('\n')
      .map((line) => line.replace(SPEAKER_LABEL, ''))
      .join('')
      .replace(PUNCTUATION_AND_SPACE, '')
  return strip(modelText) === strip(rawText)
}

export interface AnalyzeOptions {
  // Two-speaker conversation: split each paragraph into speaker turns, one per
  // line, prefixed "A: " / "B: ".
  dialogue?: boolean
}

// Single merged pass: group consecutive Whisper segments into topics AND return
// each paragraph's text with correct Japanese punctuation. Silence gaps between
// segments are fed in as boundary signals.
export async function analyzeSegments(
  segments: WhisperSegment[],
  options: AnalyzeOptions = {},
): Promise<TopicSegment[]> {
  if (segments.length === 0) return []

  const transcript = segments
    .map((s, i) => {
      const prev = segments[i - 1]
      const gap = prev ? Math.max(0, s.start - prev.end) : 0
      return `[${i}] (gap ${gap.toFixed(1)}s) "${s.text.trim()}"`
    })
    .join('\n')

  const punctuationStep = options.dialogue
    ? `2. This is a conversation between two speakers. For each paragraph, split the text into speaker turns: put each turn on its own line and prefix it with "A: " or "B: ". Keep the same label for the same voice across the whole transcript. Use the silence gaps and the content (questions/answers, speech style) to decide turn changes. Add correct Japanese punctuation (。、！？). Preserve the original wording EXACTLY — only insert punctuation and the speaker labels. Never add, remove, translate, or rephrase words. Never put spaces between Japanese characters.`
    : `2. For each paragraph, output its combined text with correct Japanese punctuation (。、！？). Preserve the original wording EXACTLY — only insert punctuation. Never add, remove, translate, or rephrase words. Never put spaces between Japanese characters.`

  const prompt = `You are given a Japanese audio transcript, split by Whisper into short segments in chronological order. Each line has:
- [index]: zero-based segment index
- (gap Ns): silence before this segment in seconds. A large gap (>= ${BOUNDARY_GAP_HINT}s) is a strong signal of a topic/paragraph break.
- the transcribed text in quotes

Do two things in one pass:
1. Group consecutive segments that share one topic into paragraphs. Use BOTH the silence gaps and the meaning to decide where boundaries fall.
${punctuationStep}

Return ONLY a JSON object:
{ "paragraphs": [ { "title": string, "startIndex": number, "endIndex": number, "text": string } ] }

Rules:
1. "title": concise Japanese, 5-15 characters (e.g. "天気の話", "今日の予定").
2. Use EXACT input indices. startIndex must be <= endIndex.
3. Paragraphs must be consecutive and cover every segment from 0 to ${segments.length - 1} with no gaps and no overlaps.
4. No markdown, no commentary — just the JSON object.

Transcript:
${transcript}`

  const parsed = await chatJson({ prompt, temperature: 0.3 })
  return normalize(extractParagraphs(parsed), segments)
}

// Punctuate a single transcribed segment text (e.g. manually added segments,
// whose text comes from a plain Whisper transcription with weak punctuation).
// Returns the original text unchanged if the model fails or drifts from the
// source wording.
export async function punctuateText(text: string, options: AnalyzeOptions = {}): Promise<string> {
  const trimmed = text.trim()
  if (!trimmed) return trimmed

  const task = options.dialogue
    ? `This is a conversation between two speakers. Split the transcribed text below into speaker turns: put each turn on its own line and prefix it with "A: " or "B: " (keep the same label for the same voice). Add correct Japanese punctuation (。、！？). Preserve the wording EXACTLY — only insert punctuation and the speaker labels, never add, remove, translate, or rephrase words. Never put spaces between Japanese characters.`
    : `Add correct Japanese punctuation (。、！？) to the transcribed text below. Preserve the wording EXACTLY — only insert punctuation, never add, remove, translate, or rephrase words. Never put spaces between Japanese characters.`

  const prompt = `${task}

Return ONLY a JSON object: { "text": string }

Input:
${trimmed}`

  try {
    const parsed = await chatJson({ prompt, temperature: 0.1 })
    const out = (parsed as { text?: unknown })?.text
    if (typeof out === 'string' && isWordingPreserved(out, trimmed)) {
      return out.trim()
    }
  } catch (err) {
    console.error('[punctuateText] failed, keeping raw text:', err)
  }

  return trimmed
}
