import { NextResponse } from 'next/server'

import { requireAppUserForApi } from '@/lib/auth'
import { db } from '@/lib/db'
import { transcribeAudio } from '@/lib/groq'

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
  })

  if (!segment) {
    return NextResponse.json({ error: 'セグメントが見つかりません' }, { status: 404 })
  }

  // Fire-and-forget: kick off transcription without blocking the response
  // The tab/page can be refreshed later to see the updated text
  void (async () => {
    try {
      const text = await transcribeAudio(segment.audioPath)
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
