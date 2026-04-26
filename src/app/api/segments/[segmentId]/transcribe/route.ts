import path from 'node:path'

import { NextResponse } from 'next/server'

import { requireAppUserForApi } from '@/lib/auth'
import { db } from '@/lib/db'
import { transcribeAudio } from '@/lib/groq'
import { measureStep, withApiPerf } from '@/lib/perf'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { downloadStorageObject } from '@/lib/storage'

type RouteContext = {
  params: Promise<{
    segmentId: string
  }>
}

export async function POST(request: Request, context: RouteContext) {
  return withApiPerf('/api/segments/[segmentId]/transcribe', request, async () => {
  const { user, response } = await measureStep('auth.require_api_user', () => requireAppUserForApi())
  if (response || !user) {
    return response
  }

  const { segmentId } = await measureStep('route.params', () => context.params)

  const segment = await measureStep('db.segment.find_transcribe_input', () =>
    db.segment.findFirst({
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
    }),
  )

  if (!segment) {
    return NextResponse.json({ error: 'セグメントが見つかりません' }, { status: 404 })
  }

  const supabase = await measureStep('supabase.create_server_client', () => createSupabaseServerClient())

  // Fire-and-forget: kick off transcription without blocking the response
  // The tab/page can be refreshed later to see the updated text
  void (async () => {
    try {
      const audioBuffer = await downloadStorageObject({
        client: supabase,
        objectKey: segment.audioPath,
      })
      const text = await measureStep('groq.transcribe.fire_and_forget', () =>
        transcribeAudio({
          audioBuffer,
          fileName: path.basename(segment.audioPath) || segment.project.audioOriginalName,
          mimeType: segment.project.audioMimeType,
        }),
      )
      await measureStep('db.segment.update_text.fire_and_forget', () =>
        db.segment.update({
          where: { id: segmentId },
          data: { text },
        }),
      )
    } catch (err) {
      console.error(`[transcribe] Failed for segment ${segmentId}:`, err)
    }
  })()

  return NextResponse.json({ success: true, message: '文字起こしを開始しました。ページを更新して結果を確認してください。' })
  })
}
