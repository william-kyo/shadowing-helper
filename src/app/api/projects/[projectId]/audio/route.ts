import { NextResponse } from 'next/server'

import { requireAppUserForApi } from '@/lib/auth'
import { db } from '@/lib/db'
import { createFileResponse } from '@/lib/file-response'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { downloadStorageObject } from '@/lib/storage'

type RouteContext = {
  params: Promise<{
    projectId: string
  }>
}

export async function GET(request: Request, context: RouteContext) {
  const { user, response } = await requireAppUserForApi()
  if (response || !user) {
    return response
  }

  const { projectId } = await context.params

  const project = await db.project.findFirst({
    where: { id: projectId, userId: user.id },
    select: {
      audioPath: true,
      audioMimeType: true,
    },
  })

  if (!project?.audioPath) {
    return NextResponse.json({ error: '音声が見つかりません。' }, { status: 404 })
  }

  const supabase = await createSupabaseServerClient()

  let fileBuffer: ArrayBuffer
  try {
    fileBuffer = await downloadStorageObject({
      client: supabase,
      objectKey: project.audioPath,
    })
  } catch {
    return NextResponse.json({ error: 'ファイルが見つかりません。' }, { status: 404 })
  }

  return createFileResponse({
    request,
    fileBuffer,
    contentType: project.audioMimeType,
  })
}
