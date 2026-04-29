import path from 'node:path'

import { NextResponse } from 'next/server'
import { z } from 'zod'

import { requireAppUserForApi } from '@/lib/auth'
import { db } from '@/lib/db'
import { addPerfAttrs, measureStep, withApiPerf } from '@/lib/perf'
import { transcribeAudioWithSegments } from '@/lib/groq'
import { analyzeTopicBoundaries } from '@/lib/segment-analysis'
import { extractAudioSegmentFromBuffer } from '@/lib/segment-audio'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { buildStorageObjectKey, createStoredFileName, downloadStorageObject, getProjectStoragePaths, uploadBufferToStorage } from '@/lib/storage'

const autoSegmentSchema = z.object({
  minDurationSeconds: z.number().min(1).max(300).default(5),
  maxSegments: z.number().min(1).max(50).default(20),
})

type RouteContext = {
  params: Promise<{
    projectId: string
  }>
}

export async function POST(request: Request, context: RouteContext) {
  return withApiPerf('/api/projects/[projectId]/auto-segment', request, async () => {
    try {
      const { user, response } = await measureStep('auth.require_api_user', () => requireAppUserForApi())
      if (response || !user) {
        return response
      }

      const { projectId } = await measureStep('route.params', () => context.params)
      const json = await measureStep('request.json', () => request.json())
      const parsed = await measureStep('validation.auto_segment', async () => autoSegmentSchema.safeParse(json))

      if (!parsed.success) {
        return NextResponse.json({ error: parsed.error.issues[0]?.message ?? '入力内容を確認してください。' }, { status: 400 })
      }

      const project = await measureStep('db.project.find_with_segments', () =>
        db.project.findFirst({
          where: { id: projectId, userId: user.id },
          include: {
            segments: {
              orderBy: { index: 'desc' },
              take: 1,
            },
          },
        }),
      )

      if (!project) {
        return NextResponse.json({ error: 'プロジェクトが見つかりません。' }, { status: 404 })
      }

      if (!project.audioPath) {
        return NextResponse.json({ error: '音声ファイルが見つかりません。' }, { status: 400 })
      }

      const supabase = await measureStep('supabase.create_server_client', () => createSupabaseServerClient())

      const audioBuffer = Buffer.from(await downloadStorageObject({
        client: supabase,
        objectKey: project.audioPath,
      }))

      addPerfAttrs({ 'audio.bytes': audioBuffer.byteLength })

      const whisperResponse = await measureStep('groq.transcribe_with_segments', () =>
        transcribeAudioWithSegments({
          audioBuffer,
          fileName: project.audioOriginalName,
          mimeType: project.audioMimeType,
        }),
      )

      addPerfAttrs({ 'whisper.segments_count': whisperResponse.segments.length })

      const topicSegments = await measureStep('llm.analyze_topics', () =>
        analyzeTopicBoundaries(whisperResponse.segments),
      )

      const resolvedSegments = topicSegments
        .map((seg) => {
          const startWhisperSeg = whisperResponse.segments[seg.startIndex]
          const endWhisperSeg = whisperResponse.segments[seg.endIndex]
          if (!startWhisperSeg || !endWhisperSeg) {
            console.warn(`[auto-segment] Invalid indices ${seg.startIndex}-${seg.endIndex} for ${whisperResponse.segments.length} segments`)
            return null
          }
          return {
            title: seg.title,
            startSeconds: startWhisperSeg.start,
            endSeconds: endWhisperSeg.end,
            text: seg.text,
          }
        })
        .filter(Boolean) as { title: string; startSeconds: number; endSeconds: number; text: string }[]

      const filteredSegments = resolvedSegments.filter(
        (seg) => (seg.endSeconds - seg.startSeconds) >= parsed.data.minDurationSeconds,
      )

      const limitedSegments = filteredSegments.slice(0, parsed.data.maxSegments)

      addPerfAttrs({ 'segments.created_count': limitedSegments.length })

      const storagePaths = getProjectStoragePaths(user.supabaseUserId, project.id)
      const baseName = path.basename(project.audioOriginalName, path.extname(project.audioOriginalName))

      const createdSegments = await Promise.all(
        limitedSegments.map(async (seg, index: number) => {
          const storedName = createStoredFileName(`${baseName}_segment_${index + 1}${path.extname(project.audioOriginalName)}`)
          const audioPath = buildStorageObjectKey(storagePaths.audioDir, storedName)

          const segmentAudioBuffer = await measureStep(`ffmpeg.extract_segment_${index}`, () =>
            extractAudioSegmentFromBuffer({
              inputBuffer: audioBuffer,
              inputExtension: path.extname(project.audioOriginalName),
              outputExtension: path.extname(storedName),
              startSeconds: seg.startSeconds,
              endSeconds: seg.endSeconds,
            }),
          )

          await uploadBufferToStorage({
            client: supabase,
            objectKey: audioPath,
            buffer: segmentAudioBuffer,
            contentType: project.audioMimeType,
          })

          const existingIndex = project.segments[0]?.index ?? -1

          return db.segment.create({
            data: {
              projectId: project.id,
              index: existingIndex + 1 + index,
              title: seg.title,
              text: seg.text,
              audioPath,
              startMs: Math.round(seg.startSeconds * 1000),
              endMs: Math.round(seg.endSeconds * 1000),
              progress: {
                create: Array.from({ length: 5 }, (_, idx) => ({ stage: idx + 1 })),
              },
            },
            include: {
              progress: {
                orderBy: { stage: 'asc' },
              },
            },
          })
        }),
      )

      return NextResponse.json({
        success: true,
        message: `${createdSegments.length}件のセグメントを作成しました。`,
        segments: createdSegments.map((seg) => ({
          id: seg.id,
          index: seg.index,
          title: seg.title,
          startMs: seg.startMs,
          endMs: seg.endMs,
          text: seg.text,
          progress: seg.progress.map((p) => ({ stage: p.stage, status: p.status })),
        })),
      })
    } catch (error) {
      console.error('[auto-segment] Error:', error)
      return NextResponse.json({ error: '自動分割に失敗しました。' }, { status: 500 })
    }
  })
}
