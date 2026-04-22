import path from 'node:path'

import { NextResponse } from 'next/server'
import { z } from 'zod'

import { requireAppUserForApi } from '@/lib/auth'
import { db } from '@/lib/db'
import { extractAudioSegment } from '@/lib/segment-audio'
import { createStoredFileName, getProjectStoragePaths } from '@/lib/storage'
import { transcribeAudio } from '@/lib/groq'

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
  try {
    const { user, response } = await requireAppUserForApi()
    if (response || !user) {
      return response
    }

    const { projectId } = await context.params
    const json = await request.json()
    const parsed = createSegmentSchema.safeParse(json)

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? '入力内容を確認してください。' }, { status: 400 })
    }

    const project = await db.project.findFirst({
      where: { id: projectId, userId: user.id },
      include: {
        segments: {
          orderBy: { index: 'desc' },
          take: 1,
        },
      },
    })

    if (!project) {
      return NextResponse.json({ error: 'プロジェクトが見つかりません。' }, { status: 404 })
    }

    const storagePaths = getProjectStoragePaths(project.id)
    const storedName = createStoredFileName(project.audioOriginalName)
    const audioPath = path.join(storagePaths.audioDir, storedName)

    await extractAudioSegment({
      inputPath: project.audioPath,
      outputPath: audioPath,
      startSeconds: parsed.data.startSeconds,
      endSeconds: parsed.data.endSeconds,
    })

    const segment = await db.segment.create({
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
    })

    // Fire-and-forget: start transcription immediately after segment creation
    void (async () => {
      try {
        const transcribedText = await transcribeAudio(audioPath)
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
      },
    })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: 'セグメント保存に失敗しました。' }, { status: 500 })
  }
}
