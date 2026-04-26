import { NextResponse } from 'next/server'

import { requireAppUserForApi } from '@/lib/auth'
import { db } from '@/lib/db'
import { createFileResponse } from '@/lib/file-response'
import { measureStep, withApiPerf } from '@/lib/perf'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { downloadStorageObject } from '@/lib/storage'

type RouteContext = {
  params: Promise<{
    segmentId: string
  }>
}

export async function GET(request: Request, context: RouteContext) {
  return withApiPerf('/api/segments/[segmentId]/audio', request, async () => {
  const { user, response } = await measureStep('auth.require_api_user', () => requireAppUserForApi())
  if (response || !user) {
    return response
  }

  const { segmentId } = await measureStep('route.params', () => context.params)

  const segment = await measureStep('db.segment.find_audio', () =>
    db.segment.findFirst({
      where: { id: segmentId, project: { userId: user.id } },
      select: {
        audioPath: true,
        project: {
          select: { audioMimeType: true },
        },
      },
    }),
  )

  if (!segment?.audioPath) {
    return NextResponse.json({ error: 'セグメント音声が見つかりません。' }, { status: 404 })
  }

  const supabase = await measureStep('supabase.create_server_client', () => createSupabaseServerClient())

  let fileBuffer: ArrayBuffer
  try {
    fileBuffer = await downloadStorageObject({
      client: supabase,
      objectKey: segment.audioPath,
    })
  } catch {
    return NextResponse.json({ error: 'ファイルが見つかりません。' }, { status: 404 })
  }

  return createFileResponse({
    request,
    fileBuffer,
    contentType: segment.project.audioMimeType,
  })
  })
}
