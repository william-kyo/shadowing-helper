// Server-side orchestration shared by the stage 4 page (server prefetch) and
// the stage 4 sentences API endpoint. Keeping the logic in one place means
// the backfill rules, sentence-split fallback order, and pre-cut behavior
// can't drift between the two callers.

import path from 'node:path'

import { db } from '@/lib/db'
import { transcribeAudioWithSegments } from '@/lib/groq'
import { ensureStage4SentenceAudios } from '@/lib/recording-storage'
import {
  buildFallbackSentenceUnits,
  buildSentenceUnits,
  isPersistedWhisperSegments,
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

// Backfill whisperSegments by running Groq on the segment audio. Idempotent
// at the DB level (whisperSegments is overwritten with the same shape) and
// returns the units we just discovered.
async function backfillWhisperSegments(params: {
  segment: Stage4SetupSegmentRow
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>
}): Promise<SentenceUnit[]> {
  const audioBuffer = await downloadStorageObject({
    client: params.supabase,
    objectKey: params.segment.audioPath,
  })

  const whisperResponse = await transcribeAudioWithSegments({
    audioBuffer: Buffer.from(audioBuffer),
    fileName: path.basename(params.segment.audioPath),
    mimeType: params.segment.project.audioMimeType,
  })

  const persisted = whisperSegmentsToPersisted(whisperResponse.segments)
  await db.segment.update({
    where: { id: params.segment.id },
    data: { whisperSegments: persisted },
  })
  return buildSentenceUnits(persisted)
}

// Idempotently cut every sentence's reference audio and stream it back as
// URLs the client can hand to <audio src=...>. The first caller pays the
// ffmpeg + upload cost; subsequent callers just regenerate URLs.
async function ensureReferenceAudios(params: {
  segment: Stage4SetupSegmentRow
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>
  ownerSupabaseUserId: string
  units: SentenceUnit[]
}): Promise<void> {
  if (params.units.length === 0) return
  const audioBuffer = await downloadStorageObject({
    client: params.supabase,
    objectKey: params.segment.audioPath,
  })
  await ensureStage4SentenceAudios({
    client: params.supabase,
    ownerSupabaseUserId: params.ownerSupabaseUserId,
    segmentId: params.segment.id,
    segmentAudioBuffer: Buffer.from(audioBuffer),
    segmentAudioExtension: path.extname(params.segment.audioPath),
    contentType: params.segment.project.audioMimeType,
    sentenceUnits: params.units,
  })
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
  let units: SentenceUnit[]
  if (persisted && persisted.length > 0) {
    units = buildSentenceUnits(persisted)
  } else {
    units = await backfillWhisperSegments({ segment, supabase })
    if (units.length === 0) {
      units = buildFallbackSentenceUnits({
        text: segment.text,
        totalStartMs: 0,
        totalEndMs: Math.max(0, (segment.endMs ?? 0) - (segment.startMs ?? 0)),
      })
    }
    didBackfill = true
  }

  await ensureReferenceAudios({
    segment,
    supabase,
    ownerSupabaseUserId: params.user.supabaseUserId,
    units,
  })

  // Map each sentence to its latest persisted recording (if any) so the panel
  // can offer self-playback on resume, not just for takes made this session.
  const latestRecordingBySentence = await loadLatestRecordingIdBySentence(segment.id)

  return {
    sentences: units.map((unit) => {
      const latestRecordingId = latestRecordingBySentence.get(unit.index) ?? null
      return {
        ...unit,
        // `?v=` busts the client <audio> cache after a re-split swaps the
        // underlying sentence clips while the URL path stays the same.
        refAudioUrl: `/api/segments/${segment.id}/stage4/sentences/${unit.index}/audio?v=${segment.updatedAt.getTime()}`,
        userRecordingUrl: latestRecordingId
          ? `/api/segments/${segment.id}/stage4/recordings/${unit.index}/audio?v=${latestRecordingId}`
          : null,
      }
    }),
    initialMetadata: buildMetadata(segment),
    audioMimeType: segment.project.audioMimeType,
    didBackfill,
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
