import path from 'node:path'

import { NextResponse } from 'next/server'
import { z } from 'zod'

import { requireAppUserForApi } from '@/lib/auth'
import { db } from '@/lib/db'
import { addPerfAttrs, measureStep, withApiPerf } from '@/lib/perf'
import { extractAudioSegmentFromBuffer } from '@/lib/segment-audio'
import { transcribeAudio } from '@/lib/groq'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { buildStorageObjectKey, createStoredFileName, downloadStorageObject, getProjectStoragePaths, uploadBufferToStorage } from '@/lib/storage'

const createSegmentSchema = z.object({
  title: z.string().trim().min(1, 'セグメント名を入力してください。'),
  startSeconds: z.number().min(0, '開始秒は 0 以上にしてください。'),
  endSeconds: z.number().min(0, '終了秒は 0 以上にしてください。'),
}).refine((value) => value.endSeconds > value.startSeconds, {
  message: '終了秒は開始秒より後にしてください。',
  path: ['endSeconds'],
})

type RouteContext = {
  params: Promise<{
    projectId: string
  }>
}

export async function POST(request: Request, context: RouteContext) {
  return withApiPerf('/api/projects/[projectId]/segments', request, async () => {
  try {
    const { user, response } = await measureStep('auth.require_api_user', () => requireAppUserForApi())
    if (response || !user) {
      return response
    }

    const { projectId } = await measureStep('route.params', () => context.params)
    const json = await measureStep('request.json', () => request.json())
    const parsed = await measureStep('validation.segment_create', async () => createSegmentSchema.safeParse(json))

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? '入力内容を確認してください。' }, { status: 400 })
    }

    addPerfAttrs({
      'segment.duration_ms': Math.round((parsed.data.endSeconds - parsed.data.startSeconds) * 1000),
    })

    const project = await measureStep('db.project.find_with_last_segment', () =>
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

    const supabase = await measureStep('supabase.create_server_client', () => createSupabaseServerClient())
    const storagePaths = getProjectStoragePaths(user.supabaseUserId, project.id)
    const storedName = createStoredFileName(project.audioOriginalName)
    const audioPath = buildStorageObjectKey(storagePaths.audioDir, storedName)

    const projectAudioBuffer = Buffer.from(await downloadStorageObject({
      client: supabase,
      objectKey: project.audioPath,
    }))

    const segmentAudioBuffer = await measureStep('ffmpeg.extract_segment', () =>
      extractAudioSegmentFromBuffer({
        inputBuffer: projectAudioBuffer,
        inputExtension: path.extname(project.audioOriginalName),
        outputExtension: path.extname(storedName),
        startSeconds: parsed.data.startSeconds,
        endSeconds: parsed.data.endSeconds,
      }),
    )

    addPerfAttrs({ 'segment.audio_bytes': segmentAudioBuffer.byteLength })

    await uploadBufferToStorage({
      client: supabase,
      objectKey: audioPath,
      buffer: segmentAudioBuffer,
      contentType: project.audioMimeType,
    })

    const segment = await measureStep('db.segment.create_with_progress', () =>
      db.segment.create({
        data: {
          projectId: project.id,
          index: (project.segments[0]?.index ?? -1) + 1,
          title: parsed.data.title,
          text: '',
          audioPath,
          startMs: Math.round(parsed.data.startSeconds * 1000),
          endMs: Math.round(parsed.data.endSeconds * 1000),
          progress: {
            create: Array.from({ length: 5 }, (_, idx) => ({ stage: idx + 1 })),
          },
        },
        include: {
          progress: {
            orderBy: { stage: 'asc' },
          },
        },
      }),
    )

    // Fire-and-forget: start transcription immediately after segment creation
    void (async () => {
      try {
        const transcribedText = await transcribeAudio({
          audioBuffer: segmentAudioBuffer,
          fileName: storedName,
          mimeType: project.audioMimeType,
        })
        await db.segment.update({
          where: { id: segment.id },
          data: { text: transcribedText },
        })
      } catch (err) {
        console.error(`[transcribe] Failed for segment ${segment.id}:`, err)
      }
    })()

    return NextResponse.json({
      segment: {
        id: segment.id,
        index: segment.index,
        title: segment.title,
        startMs: segment.startMs,
        endMs: segment.endMs,
        audioPath: segment.audioPath,
        progressCount: segment.progress.length,
        progress: segment.progress.map((p) => ({ stage: p.stage, status: p.status })),
      },
    })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: 'セグメント保存に失敗しました。' }, { status: 500 })
  }
  })
}
