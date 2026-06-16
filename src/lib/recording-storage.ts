// Storage layout and orchestration helpers for stage 4 (script-following
// shadowing) recordings and the per-sentence reference audio the panel
// plays before the learner records their take.
//
// Layout (all keys are scoped to the owning Supabase user so RLS works):
//   ${ownerSupabaseUserId}/audio/sentences/{segmentId}/{idx}.{ext}
//   ${ownerSupabaseUserId}/projects/{projectId}/recordings/{segmentId}/4/{sentenceIndex}/{uuid}.{ext}

import { extractAudioSegmentFromBuffer } from '@/lib/segment-audio'
import type { SentenceUnit } from '@/lib/sentence-split'
import { getProjectStoragePaths } from '@/lib/storage-paths'
import type { SupabaseClient } from '@supabase/supabase-js'
import { uploadBufferToStorage } from '@/lib/storage'

export const STAGE4_STAGE_NUMBER = 4

export function getStage4SentenceAudioKey(params: {
  ownerSupabaseUserId: string
  segmentId: string
  index: number
  extension: string
}): string {
  const rawExt = params.extension || ''
  const ext = rawExt.startsWith('.') ? rawExt : `.${rawExt}`
  return `${params.ownerSupabaseUserId}/audio/sentences/${params.segmentId}/${params.index}${ext}`
}

export function getStage4RecordingKey(params: {
  ownerSupabaseUserId: string
  projectId: string
  segmentId: string
  sentenceIndex: number
  fileName: string
}): string {
  const paths = getProjectStoragePaths(params.ownerSupabaseUserId, params.projectId)
  return `${paths.recordingDir}/${params.segmentId}/${STAGE4_STAGE_NUMBER}/${params.sentenceIndex}/${params.fileName}`
}

// Best-effort audio MIME for a stored recording, derived from its key's
// extension. Recordings are saved as webm (Chrome/Firefox) or mp4 (Safari);
// the Recording row doesn't persist the MIME, so we recover it for playback.
export function recordingContentTypeFromKey(objectKey: string): string {
  const lower = objectKey.toLowerCase()
  if (lower.endsWith('.mp4') || lower.endsWith('.m4a')) return 'audio/mp4'
  if (lower.endsWith('.ogg')) return 'audio/ogg'
  if (lower.endsWith('.wav')) return 'audio/wav'
  return 'audio/webm'
}

// Idempotently cut each sentence's slice from the segment audio and upload it
// under a deterministic key. Re-running this is a no-op cost-wise (ffmpeg
// recompute + upsert) and lets the panel stream a pre-cut clip instead of
// seeking the full segment audio — which would clash with the bottom player
// and cause audible clicks at the seek boundary.
export async function ensureStage4SentenceAudios(params: {
  client: SupabaseClient
  ownerSupabaseUserId: string
  segmentId: string
  segmentAudioBuffer: Buffer
  segmentAudioExtension: string
  contentType: string
  sentenceUnits: SentenceUnit[]
}): Promise<string[]> {
  const uploadedKeys: string[] = []
  await Promise.all(
    params.sentenceUnits.map(async (unit) => {
      const objectKey = getStage4SentenceAudioKey({
        ownerSupabaseUserId: params.ownerSupabaseUserId,
        segmentId: params.segmentId,
        index: unit.index,
        extension: params.segmentAudioExtension,
      })
      const slice = await extractAudioSegmentFromBuffer({
        inputBuffer: params.segmentAudioBuffer,
        inputExtension: params.segmentAudioExtension,
        outputExtension: params.segmentAudioExtension,
        startSeconds: unit.startMs / 1000,
        endSeconds: unit.endMs / 1000,
      })
      await uploadBufferToStorage({
        client: params.client,
        objectKey,
        buffer: slice,
        contentType: params.contentType,
      })
      uploadedKeys.push(objectKey)
    }),
  )
  return uploadedKeys
}
