import { NextResponse } from 'next/server'

import { requireAppUserForApi } from '@/lib/auth'
import { db } from '@/lib/db'
import { transcribeAudio } from '@/lib/groq'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { downloadStorageObject } from '@/lib/storage'

type RouteContext = {
  params: Promise<{
    segmentId: string
  }>
}

export async function POST(request: Request, context: RouteContext) {
  const { user, response } = await requireAppUserForApi()
  if (response || !user) {
    return response
  }

  const { segmentId } = await context.params

  const segment = await db.segment.findFirst({
    where: { id: segmentId, project: { userId: user.id } },
    select: {
      audioPath: true,
      title: true,
      project: {
        select: {
          audioMimeType: true,
          audioOriginalName: true,
        },
      },
    },
  })

  if (!segment) {
    return NextResponse.json({ error: 'セグメントが見つかりません' }, { status: 404 })
  }

  const supabase = await createSupabaseServerClient()

  // Fire-and-forget: kick off transcription without blocking the response
  // The tab/page can be refreshed later to see the updated text
  void (async () => {
    try {
      const audioBuffer = await downloadStorageObject({
        client: supabase,
        objectKey: segment.audioPath,
      })
      const text = await transcribeAudio({
        audioBuffer,
        fileName: segment.title ?? segment.project.audioOriginalName,
        mimeType: segment.project.audioMimeType,
      })
      await db.segment.update({
        where: { id: segmentId },
        data: { text },
      })
    } catch (err) {
      console.error(`[transcribe] Failed for segment ${segmentId}:`, err)
    }
  })()

  return NextResponse.json({ success: true, message: '文字起こしを開始しました。稍后刷新页面查看结果。' })
}
