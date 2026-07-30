import { NextResponse } from 'next/server'

import { requireAppUserForApi } from '@/lib/auth'
import { db } from '@/lib/db'
import { createFileResponse } from '@/lib/file-response'
import { measureStep, withApiPerf } from '@/lib/perf'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { downloadStorageObject } from '@/lib/storage'
import { getRequestT } from '@/lib/i18n/server'

type RouteContext = {
  params: Promise<{
    projectId: string
  }>
}

export async function GET(request: Request, context: RouteContext) {
  const t = getRequestT(request)

  return withApiPerf('/api/projects/[projectId]/audio', request, async () => {
  const { user, response } = await measureStep('auth.require_api_user', () => requireAppUserForApi())
  if (response || !user) {
    return response
  }

  const { projectId } = await measureStep('route.params', () => context.params)

  const project = await measureStep('db.project.find_audio', () =>
    db.project.findFirst({
      where: { id: projectId, userId: user.id },
      select: {
        audioPath: true,
        audioMimeType: true,
      },
    }),
  )

  if (!project?.audioPath) {
    return NextResponse.json({ error: t.errors.audioNotFound }, { status: 404 })
  }

  const supabase = await measureStep('supabase.create_server_client', () => createSupabaseServerClient())

  let fileBuffer: ArrayBuffer
  try {
    fileBuffer = await downloadStorageObject({
      client: supabase,
      objectKey: project.audioPath,
    })
  } catch {
    return NextResponse.json({ error: t.errors.fileNotFound }, { status: 404 })
  }

  return createFileResponse({
    request,
    fileBuffer,
    contentType: project.audioMimeType,
  })
  })
}
