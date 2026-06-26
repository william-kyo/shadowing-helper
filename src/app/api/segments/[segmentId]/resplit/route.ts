import path from 'node:path'

import { NextResponse } from 'next/server'
import { z } from 'zod'

import { requireAppUserForApi } from '@/lib/auth'
import { db } from '@/lib/db'
import { rateLimitResponseOrNull } from '@/lib/rate-limit'
import { transcribeAudioWithSegments } from '@/lib/groq'
import { addPerfAttrs, measureStep, withApiPerf } from '@/lib/perf'
import { getStage4SentenceAudioKey } from '@/lib/recording-storage'
import { punctuateText } from '@/lib/segment-analysis'
import { extractAudioSegmentFromBuffer } from '@/lib/segment-audio'
import { buildSentenceUnits, isPersistedWhisperSegments, whisperSegmentsToPersisted } from '@/lib/sentence-split'
import { emptyStage4Metadata } from '@/lib/stage-4-completion'
import {
  buildStorageObjectKey,
  createStoredFileName,
  downloadStorageObject,
  getProjectStoragePaths,
  removeStorageObjects,
  uploadBufferToStorage,
} from '@/lib/storage'
import { createSupabaseServerClient } from '@/lib/supabase/server'

// Smallest segment we allow after a manual re-split. Anything shorter is almost
// certainly a fat-finger on the inputs rather than an intended clip.
const MIN_SEGMENT_MS = 500

const resplitSchema = z.object({
  startMs: z.number().int().min(0),
  endMs: z.number().int().min(0),
})

type RouteContext = {
  params: Promise<{
    segmentId: string
  }>
}

export async function POST(request: Request, context: RouteContext) {
  return withApiPerf('/api/segments/[segmentId]/resplit', request, async () => {
    try {
      const { user, response } = await measureStep('auth.require_api_user', () => requireAppUserForApi())
      if (response || !user) {
        return response
      }

      // Re-split re-runs Groq Whisper on the new clip — rate-limit per user.
      const limited = await rateLimitResponseOrNull(user.id, 'resplit')
      if (limited) return limited

      const { segmentId } = await measureStep('route.params', () => context.params)
      const json = await measureStep('request.json', () => request.json())
      const parsed = resplitSchema.safeParse(json)
      if (!parsed.success) {
        return NextResponse.json({ error: '入力内容を確認してください。' }, { status: 400 })
      }

      const { startMs, endMs } = parsed.data
      if (endMs - startMs < MIN_SEGMENT_MS) {
        return NextResponse.json({ error: '終了時間は開始時間より後にしてください。' }, { status: 400 })
      }

      const segment = await measureStep('db.segment.find_resplit_input', () =>
        db.segment.findFirst({
          where: { id: segmentId, project: { userId: user.id } },
          select: {
            id: true,
            audioPath: true,
            whisperSegments: true,
            project: {
              select: {
                id: true,
                audioPath: true,
                audioMimeType: true,
                audioOriginalName: true,
                audioDurationMs: true,
              },
            },
          },
        }),
      )

      if (!segment) {
        return NextResponse.json({ error: 'セグメントが見つかりません。' }, { status: 404 })
      }
      if (!segment.project.audioPath) {
        return NextResponse.json({ error: '元の音声ファイルが見つかりません。' }, { status: 400 })
      }
      if (segment.project.audioDurationMs && endMs > segment.project.audioDurationMs) {
        return NextResponse.json({ error: '終了時間が音声の長さを超えています。' }, { status: 400 })
      }

      const supabase = await measureStep('supabase.create_server_client', () => createSupabaseServerClient())

      const sourceBuffer = Buffer.from(
        await measureStep('storage.download_source_audio', () =>
          downloadStorageObject({ client: supabase, objectKey: segment.project.audioPath }),
        ),
      )

      const sourceExt = path.extname(segment.project.audioOriginalName)
      const segmentExt = path.extname(segment.audioPath) || sourceExt
      const segmentBuffer = await measureStep('ffmpeg.extract_resplit_segment', () =>
        extractAudioSegmentFromBuffer({
          inputBuffer: sourceBuffer,
          inputExtension: sourceExt,
          outputExtension: segmentExt,
          startSeconds: startMs / 1000,
          endSeconds: endMs / 1000,
        }),
      )

      const storagePaths = getProjectStoragePaths(user.supabaseUserId, segment.project.id)
      const baseName = path.basename(segment.project.audioOriginalName, sourceExt)
      const storedName = createStoredFileName(`${baseName}_segment_resplit${segmentExt}`)
      const newAudioPath = buildStorageObjectKey(storagePaths.audioDir, storedName)

      await measureStep('storage.upload_resplit_segment', () =>
        uploadBufferToStorage({
          client: supabase,
          objectKey: newAudioPath,
          buffer: segmentBuffer,
          contentType: segment.project.audioMimeType,
        }),
      )

      const whisperResponse = await measureStep('groq.transcribe_resplit', () =>
        transcribeAudioWithSegments({
          audioBuffer: segmentBuffer,
          fileName: storedName,
          mimeType: segment.project.audioMimeType,
        }),
      )
      addPerfAttrs({ 'whisper.segments_count': whisperResponse.segments.length })

      const punctuatedText = await measureStep('llm.punctuate_resplit', () =>
        punctuateText(whisperResponse.text),
      )
      const persisted = whisperSegmentsToPersisted(whisperResponse.segments)

      // Update segment + reset stage 4 in one transaction: the new script and
      // sentence set invalidate stage 4's per-sentence scores, so wipe its
      // status/metadata. Stages 1-3 are left untouched (they track the learner's
      // own reading/understanding, not sentence indices).
      const [updated] = await measureStep('db.segment.resplit_update', () =>
        db.$transaction([
          db.segment.update({
            where: { id: segment.id },
            data: {
              startMs,
              endMs,
              audioPath: newAudioPath,
              text: punctuatedText,
              whisperSegments: persisted,
            },
            select: { startMs: true, endMs: true, text: true, updatedAt: true },
          }),
          db.stageProgress.updateMany({
            where: { segmentId: segment.id, stage: 4 },
            data: { status: 'not_started', metadata: emptyStage4Metadata(), completedAt: null },
          }),
        ]),
      )

      // Best-effort cleanup of the now-stale storage objects: the previous
      // segment clip and every cached stage 4 sentence reference audio (cut
      // against the old sentence boundaries). Stage 4 regenerates these from the
      // fresh whisperSegments on its next load.
      const staleKeys: string[] = [segment.audioPath]
      if (isPersistedWhisperSegments(segment.whisperSegments)) {
        for (const unit of buildSentenceUnits(segment.whisperSegments)) {
          staleKeys.push(
            getStage4SentenceAudioKey({
              ownerSupabaseUserId: user.supabaseUserId,
              segmentId: segment.id,
              index: unit.index,
              extension: segmentExt,
            }),
          )
        }
      }
      try {
        await removeStorageObjects({ client: supabase, objectKeys: staleKeys })
      } catch {
        // Orphaned objects are harmless; never fail the request over cleanup.
      }

      return NextResponse.json({
        success: true,
        startMs: updated.startMs,
        endMs: updated.endMs,
        text: updated.text,
      })
    } catch (error) {
      console.error('[resplit] failed:', error)
      return NextResponse.json({ error: '再分割に失敗しました。' }, { status: 500 })
    }
  })
}
