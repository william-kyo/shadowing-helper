// Server-side orchestration shared by the stage 4 page (server prefetch) and
// the stage 4 sentences API endpoint. Keeping the logic in one place means
// the backfill rules, sentence-split fallback order, and pre-cut behavior
// can't drift between the two callers.

import path from 'node:path'

import { db } from '@/lib/db'
import { transcribeAudioWithSegments } from '@/lib/groq'
import { ensureStage4SentenceAudios } from '@/lib/recording-storage'
import { resolveSpeakerChunks } from '@/lib/segment-analysis'
import {
  buildFallbackSentenceUnits,
  buildSentenceUnits,
  isPersistedWhisperSegments,
  type PersistedWhisperSegment,
  SENTENCE_SPLIT_VERSION,
  type SentenceUnit,
  whisperSegmentsToPersisted,
} from '@/lib/sentence-split'
import { isStage4Metadata, type Stage4Metadata } from '@/lib/stage-4-completion'
import { downloadStorageObject } from '@/lib/storage'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export type Stage4Sentence = SentenceUnit & {
  refAudioUrl: string
  // URL of the learner's most recent recording for this sentence, or null when
  // they haven't recorded it yet. Cache-busted by the recording id.
  userRecordingUrl: string | null
}

export type Stage4Setup = {
  sentences: Stage4Sentence[]
  initialMetadata: Stage4Metadata | null
  audioMimeType: string
  // True when this call had to run Groq to backfill whisperSegments (vs.
  // everything being pre-persisted on the segment row).
  didBackfill: boolean
  // The persisted Whisper chunks behind `sentences`, in storage order — the
  // granularity at which speaker labels are stored and edited (stage 1).
  // Empty when the segment has no transcription and sentences came from the
  // text-only fallback, which has no persisted counterpart to annotate.
  speakerChunks: PersistedWhisperSegment[]
  // False when the segment's audio object is absent from storage. Everything
  // that doesn't need the bytes (script, stage list, progress) still loads;
  // callers are expected to disable playback and the stage 4 reference clips.
  audioAvailable: boolean
}

export type Stage4SetupUser = {
  id: string
  supabaseUserId: string
}

export type Stage4SetupSegmentRow = {
  id: string
  text: string
  audioPath: string
  startMs: number | null
  endMs: number | null
  updatedAt: Date
  whisperSegments: unknown
  project: { id: string; audioMimeType: string }
  progress: { metadata: unknown }[]
}

async function loadStage4Segment(segmentId: string, userId: string): Promise<Stage4SetupSegmentRow | null> {
  return db.segment.findFirst({
    where: { id: segmentId, project: { userId } },
    select: {
      id: true,
      text: true,
      audioPath: true,
      startMs: true,
      endMs: true,
      updatedAt: true,
      whisperSegments: true,
      project: { select: { id: true, audioMimeType: true } },
      progress: {
        where: { stage: 4 },
        select: { metadata: true },
      },
    },
  })
}

function buildMetadata(segment: Stage4SetupSegmentRow): Stage4Metadata | null {
  const raw = segment.progress[0]?.metadata
  return isStage4Metadata(raw) ? raw : null
}

// Fetch the segment's source audio, tolerating an object that isn't in storage.
// A segment row can outlive — or precede — its audio object: a seed row whose
// upload never ran, or the shared onboarding sample deployed before
// `npm run example:upload`. Neither should turn the segment page into a 500, so
// a missing object degrades to null and every caller decides how to cope.
async function downloadSegmentAudio(params: {
  segment: Stage4SetupSegmentRow
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>
}): Promise<ArrayBuffer | null> {
  try {
    return await downloadStorageObject({
      client: params.supabase,
      objectKey: params.segment.audioPath,
    })
  } catch (error) {
    console.error(
      `[stage4] segment audio unavailable (segment=${params.segment.id}, key=${params.segment.audioPath}):`,
      error,
    )
    return null
  }
}

// Backfill whisperSegments by running Groq on the segment audio. Idempotent
// at the DB level (whisperSegments is overwritten with the same shape) and
// returns the units we just discovered, or null when the audio object is
// missing and there is therefore nothing to transcribe.
async function backfillWhisperSegments(params: {
  segment: Stage4SetupSegmentRow
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>
}): Promise<{ units: SentenceUnit[]; chunks: PersistedWhisperSegment[] } | null> {
  const audioBuffer = await downloadSegmentAudio(params)
  if (!audioBuffer) return null

  const whisperResponse = await transcribeAudioWithSegments({
    audioBuffer: Buffer.from(audioBuffer),
    fileName: path.basename(params.segment.audioPath),
    mimeType: params.segment.project.audioMimeType,
  })

  const transcribed = whisperSegmentsToPersisted(whisperResponse.segments)
  // Seed the A/B labels the learner refines in stage 1, preferring the script's
  // own turn structure. Best-effort: a failure yields unlabeled chunks, never a
  // failed backfill.
  const persisted = await resolveSpeakerChunks(transcribed, params.segment.text)
  await db.segment.update({
    where: { id: params.segment.id },
    data: { whisperSegments: persisted },
  })
  return { units: buildSentenceUnits(persisted), chunks: persisted }
}

// Idempotently cut every sentence's reference audio and stream it back as
// URLs the client can hand to <audio src=...>. The first caller pays the
// ffmpeg + upload cost; subsequent callers just regenerate URLs.
//
// Runs on every load, so a missing source object must not propagate: this is a
// best-effort pre-cut (the per-sentence audio route re-cuts on demand and 404s
// on its own), and the rest of the page doesn't depend on it. Returns false
// only when the source audio is gone, so the caller can disable playback.
async function ensureReferenceAudios(params: {
  segment: Stage4SetupSegmentRow
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>
  ownerSupabaseUserId: string
  units: SentenceUnit[]
}): Promise<boolean> {
  if (params.units.length === 0) return true
  const audioBuffer = await downloadSegmentAudio(params)
  if (!audioBuffer) return false
  await ensureStage4SentenceAudios({
    client: params.supabase,
    ownerSupabaseUserId: params.ownerSupabaseUserId,
    segmentId: params.segment.id,
    segmentAudioBuffer: Buffer.from(audioBuffer),
    segmentAudioExtension: path.extname(params.segment.audioPath),
    contentType: params.segment.project.audioMimeType,
    sentenceUnits: params.units,
  })
  return true
}

export async function loadStage4Setup(params: {
  segmentId: string
  user: Stage4SetupUser
}): Promise<Stage4Setup | null> {
  const segment = await loadStage4Segment(params.segmentId, params.user.id)
  if (!segment) return null

  const supabase = await createSupabaseServerClient()

  const persisted = isPersistedWhisperSegments(segment.whisperSegments)
    ? segment.whisperSegments
    : null

  let didBackfill = false
  let audioAvailable = true
  let units: SentenceUnit[]
  // Chunks stay empty on the text-only fallback path: those units are derived
  // from character counts rather than real timestamps and are never persisted,
  // so there is nothing stable for speaker labels to attach to.
  let speakerChunks: PersistedWhisperSegment[] = []
  if (persisted && persisted.length > 0) {
    units = buildSentenceUnits(persisted)
    speakerChunks = persisted
  } else {
    const backfilled = await backfillWhisperSegments({ segment, supabase })
    if (backfilled) {
      units = backfilled.units
      speakerChunks = backfilled.chunks
      didBackfill = true
    } else {
      // No audio to transcribe. Fall through to the text-only fallback below so
      // the script still renders instead of the page failing outright.
      units = []
      audioAvailable = false
    }
    if (units.length === 0) {
      units = buildFallbackSentenceUnits({
        text: segment.text,
        totalStartMs: 0,
        totalEndMs: Math.max(0, (segment.endMs ?? 0) - (segment.startMs ?? 0)),
      })
      speakerChunks = []
    }
  }

  // Skipped once the backfill already proved the object is gone — re-downloading
  // would only log the same failure twice.
  if (audioAvailable) {
    audioAvailable = await ensureReferenceAudios({
      segment,
      supabase,
      ownerSupabaseUserId: params.user.supabaseUserId,
      units,
    })
  }

  // Map each sentence to its latest persisted recording (if any) so the panel
  // can offer self-playback on resume, not just for takes made this session.
  const latestRecordingBySentence = await loadLatestRecordingIdBySentence(segment.id)

  return {
    sentences: units.map((unit) => {
      const latestRecordingId = latestRecordingBySentence.get(unit.index) ?? null
      return {
        ...unit,
        // `?v=` busts the client <audio> cache after a re-split swaps the
        // underlying sentence clips while the URL path stays the same. The
        // split-version suffix does the same when the splitting algorithm
        // itself moves sentence boundaries.
        refAudioUrl: `/api/segments/${segment.id}/stage4/sentences/${unit.index}/audio?v=${segment.updatedAt.getTime()}-s${SENTENCE_SPLIT_VERSION}`,
        userRecordingUrl: latestRecordingId
          ? `/api/segments/${segment.id}/stage4/recordings/${unit.index}/audio?v=${latestRecordingId}`
          : null,
      }
    }),
    initialMetadata: buildMetadata(segment),
    audioMimeType: segment.project.audioMimeType,
    didBackfill,
    speakerChunks,
    audioAvailable,
  }
}

// Newest recording id per sentence index for a segment's stage 4 takes. Used to
// build cache-bustable self-playback URLs.
async function loadLatestRecordingIdBySentence(
  segmentId: string,
): Promise<Map<number, string>> {
  const recordings = await db.recording.findMany({
    where: { segmentId, stage: 4 },
    orderBy: { createdAt: 'desc' },
    select: { id: true, sentenceIndex: true },
  })
  const latest = new Map<number, string>()
  for (const recording of recordings) {
    if (recording.sentenceIndex == null) continue
    if (!latest.has(recording.sentenceIndex)) {
      latest.set(recording.sentenceIndex, recording.id)
    }
  }
  return latest
}
