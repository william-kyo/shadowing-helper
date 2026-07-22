import { NextResponse } from 'next/server'

import { requireAppUserForApi } from '@/lib/auth'
import { cerScore, isPassingScore } from '@/lib/cer'
import { db } from '@/lib/db'
import { rateLimitResponseOrNull } from '@/lib/rate-limit'
import { transcribeAudio } from '@/lib/groq'
import { GroqTranscriptionError } from '@/lib/groq-errors'
import { addPerfAttrs, measureStep, withApiPerf } from '@/lib/perf'
import { STAGE4_STAGE_NUMBER, getStage4RecordingKey } from '@/lib/recording-storage'
import {
  buildFallbackSentenceUnits,
  buildSentenceUnits,
  isPersistedWhisperSegments,
} from '@/lib/sentence-split'
import {
  emptyStage4Metadata,
  evaluateStage4Completion,
  isStage4Metadata,
  recordSentenceScore,
} from '@/lib/stage-4-completion'
import { uploadBufferToStorage } from '@/lib/storage'
import { createStoredFileName, sanitizeExtension, sanitizeFileExtension } from '@/lib/storage-paths'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { acceptedAudioMimeTypes } from '@/lib/validations/project'

const RECORDING_MIME_FALLBACK = 'audio/webm'
const RECORDING_EXT_FALLBACK = '.webm'
const MAX_RECORDING_BYTES = 10 * 1024 * 1024
// A take stopped almost immediately after start yields a container-header-only
// blob (a few hundred bytes; any real take is several KB) that Whisper rejects
// with "could not process file". Reject those up front, before the recording
// is uploaded or a Recording row is created.
const MIN_RECORDING_BYTES = 1024

type RouteContext = {
  params: Promise<{
    segmentId: string
  }>
}

function pickRecordingExtension(file: File): string {
  const fromName = sanitizeFileExtension(file.name)
  if (fromName) return fromName
  const fromType = file.type?.includes('/') ? sanitizeExtension(file.type.split('/')[1]) : ''
  if (fromType) return fromType
  return RECORDING_EXT_FALLBACK
}

export async function POST(request: Request, context: RouteContext) {
  return withApiPerf('/api/segments/[segmentId]/stage4/recordings', request, async () => {
    try {
      const { user, response } = await measureStep('auth.require_api_user', () => requireAppUserForApi())
      if (response || !user) {
        return response
      }

      // Each take is scored via Groq Whisper — rate-limit per user to cap cost.
      const limited = await rateLimitResponseOrNull(user.id, 'stage4_recording')
      if (limited) return limited

      const { segmentId } = await measureStep('route.params', () => context.params)

      const formData = await measureStep('request.formdata', () => request.formData())
      const sentenceIndexRaw = formData.get('sentenceIndex')
      const audioEntry = formData.get('audio')

      if (typeof sentenceIndexRaw !== 'string') {
        return NextResponse.json({ error: 'sentenceIndex が必要です。' }, { status: 400 })
      }
      // Duck-typed file check (works across Node / jsdom realms where
      // `instanceof File` may be a different constructor). Once the guard
      // passes, treat the value as a File for the rest of the handler.
      const audioFile =
        audioEntry &&
        typeof audioEntry === 'object' &&
        typeof audioEntry.arrayBuffer === 'function' &&
        typeof audioEntry.size === 'number' &&
        audioEntry.size > 0
          ? (audioEntry as unknown as File)
          : null
      if (!audioFile) {
        return NextResponse.json({ error: '音声ファイルが必要です。' }, { status: 400 })
      }

      if (audioFile.size > MAX_RECORDING_BYTES) {
        return NextResponse.json({ error: '録音ファイルは10MB以下にしてください。' }, { status: 413 })
      }

      if (audioFile.size < MIN_RECORDING_BYTES) {
        return NextResponse.json(
          { error: '録音が短すぎるため採点できません。もう一度録音してください。' },
          { status: 400 },
        )
      }

      // MediaRecorder reports the recorded MIME WITH a codec parameter, e.g.
      // "audio/webm;codecs=opus" (Chrome/Firefox) or "audio/mp4;codecs=mp4a.40.2"
      // (iOS Safari). Compare the base type against the allowlist, otherwise a
      // perfectly valid recording is rejected with 400 — which is exactly what
      // made stage 4 recording fail in real browsers.
      const baseMimeType = audioFile.type.split(';')[0]?.trim().toLowerCase() ?? ''
      if (
        baseMimeType &&
        !acceptedAudioMimeTypes.includes(baseMimeType as (typeof acceptedAudioMimeTypes)[number])
      ) {
        return NextResponse.json({ error: '対応していない音声形式です。' }, { status: 400 })
      }

      const sentenceIndex = Number.parseInt(sentenceIndexRaw, 10)
      if (!Number.isInteger(sentenceIndex) || sentenceIndex < 0) {
        return NextResponse.json({ error: 'sentenceIndex が不正です。' }, { status: 400 })
      }

      const segment = await measureStep('db.segment.find_stage4_recordings', () =>
        db.segment.findFirst({
          where: { id: segmentId, project: { userId: user.id } },
          select: {
            id: true,
            text: true,
            startMs: true,
            endMs: true,
            whisperSegments: true,
            project: {
              select: { id: true, audioMimeType: true },
            },
            progress: {
              where: { stage: STAGE4_STAGE_NUMBER },
              select: { id: true, status: true, metadata: true },
            },
          },
        }),
      )

      if (!segment) {
        return NextResponse.json({ error: 'セグメントが見つかりません。' }, { status: 404 })
      }

      const persisted = isPersistedWhisperSegments(segment.whisperSegments)
        ? segment.whisperSegments
        : null
      let units = buildSentenceUnits(persisted)
      if (units.length === 0) {
        units = buildFallbackSentenceUnits({
          text: segment.text,
          totalStartMs: 0,
          totalEndMs: Math.max(0, (segment.endMs ?? 0) - (segment.startMs ?? 0)),
        })
      }
      if (sentenceIndex >= units.length) {
        return NextResponse.json({ error: '文が見つかりません。' }, { status: 400 })
      }

      const expectedText = units[sentenceIndex]?.text ?? ''

      const supabase = await measureStep('supabase.create_server_client', () =>
        createSupabaseServerClient(),
      )

      const recordingExt = pickRecordingExtension(audioFile)
      const storedName = `${createStoredFileName('recording')}${recordingExt}`
      const recordingKey = getStage4RecordingKey({
        ownerSupabaseUserId: user.supabaseUserId,
        projectId: segment.project.id,
        segmentId: segment.id,
        sentenceIndex,
        fileName: storedName,
      })

      const audioBuffer = Buffer.from(await measureStep('file.array_buffer', () =>
        audioFile.arrayBuffer(),
      ))
      addPerfAttrs({ 'recording.bytes': audioBuffer.byteLength })

      await measureStep('storage.upload_recording', () =>
        uploadBufferToStorage({
          client: supabase,
          objectKey: recordingKey,
          buffer: audioBuffer,
          contentType: audioFile.type || RECORDING_MIME_FALLBACK,
        }),
      )

      const recording = await measureStep('db.recording.create', () =>
        db.recording.create({
          data: {
            segmentId: segment.id,
            stage: STAGE4_STAGE_NUMBER,
            filePath: recordingKey,
            sentenceIndex,
          },
          select: { id: true },
        }),
      )

      const transcript = await measureStep('groq.transcribe_recording', () =>
        transcribeAudio({
          audioBuffer,
          fileName: storedName,
          mimeType: audioFile.type || RECORDING_MIME_FALLBACK,
        }),
      )

      const result = cerScore(expectedText, transcript)
      const pass = isPassingScore(result.score)
      addPerfAttrs({ 'stage4.cer_score': Math.round(result.score * 100) / 100 })

      const existingProgress = segment.progress[0]
      const previousMetadata = isStage4Metadata(existingProgress?.metadata)
        ? existingProgress.metadata
        : emptyStage4Metadata()
      const nextMetadata = recordSentenceScore(previousMetadata, {
        index: sentenceIndex,
        score: result.score,
        transcript,
      })

      const completion = evaluateStage4Completion({
        metadata: nextMetadata,
        totalSentences: units.length,
      })

      // Single upsert that:
      //  - always writes the new metadata
      //  - promotes `not_started` → `in_progress` once a first attempt lands
      //  - flips to `completed` only on the transition (preserves the
      //    original completedAt on retries after completion)
      const previousStatus = existingProgress?.status
      const nextStatus: 'in_progress' | 'completed' =
        previousStatus === 'completed'
          ? 'completed'
          : completion.done
            ? 'completed'
            : 'in_progress'
      const completingNow = nextStatus === 'completed' && previousStatus !== 'completed'

      const stageUpsert = await measureStep('db.stage_progress.upsert', () =>
        db.stageProgress.upsert({
          where: {
            segmentId_stage: { segmentId: segment.id, stage: STAGE4_STAGE_NUMBER },
          },
          update: {
            metadata: nextMetadata,
            status: nextStatus,
            ...(completingNow ? { completedAt: new Date() } : {}),
          },
          create: {
            segmentId: segment.id,
            stage: STAGE4_STAGE_NUMBER,
            status: nextStatus,
            completedAt: completingNow ? new Date() : null,
            metadata: nextMetadata,
          },
        }),
      )

      return NextResponse.json({
        recordingId: recording.id,
        score: result.score,
        pass,
        transcript,
        expected: expectedText,
        distance: result.distance,
        expectedLength: result.expectedLength,
        actualLength: result.actualLength,
        threshold: completion.passThreshold,
        stageComplete: stageUpsert.status === 'completed',
        passingSentences: completion.passedSentences,
        totalSentences: completion.totalSentences,
      })
    } catch (error) {
      // Groq 400 means the uploaded take itself was unusable (typically a
      // header-only blob from an instant stop) — recoverable by re-recording,
      // so answer 422 with an actionable message instead of a blind 500.
      if (error instanceof GroqTranscriptionError && error.status === 400) {
        console.warn('[stage4/recordings] transcription rejected:', error.message)
        return NextResponse.json(
          { error: '録音を解析できませんでした。録音が短すぎる可能性があります。もう一度録音してください。' },
          { status: 422 },
        )
      }
      console.error('[stage4/recordings] failed:', error)
      return NextResponse.json({ error: '録音の採点に失敗しました。' }, { status: 500 })
    }
  })
}
