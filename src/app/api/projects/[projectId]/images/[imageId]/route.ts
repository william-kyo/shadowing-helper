import { NextResponse } from 'next/server'

import { requireAppUserForApi } from '@/lib/auth'
import { db } from '@/lib/db'
import { measureStep, withApiPerf } from '@/lib/perf'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { downloadStorageObject } from '@/lib/storage'

type RouteParams = {
  params: Promise<{
    projectId: string
    imageId: string
  }>
}

export async function GET(request: Request, { params }: RouteParams) {
  return withApiPerf('/api/projects/[projectId]/images/[imageId]', request, async () => {
  const { user, response } = await measureStep('auth.require_api_user', () => requireAppUserForApi())
  if (response || !user) {
    return response
  }

  const { projectId, imageId } = await measureStep('route.params', () => params)

  const sourceImage = await measureStep('db.source_image.find', () =>
    db.sourceImage.findFirst({
      where: {
        id: imageId,
        projectId: projectId,
        project: { userId: user.id },
      },
    }),
  )

  if (!sourceImage) {
    return NextResponse.json({ error: '画像が見つかりません' }, { status: 404 })
  }

  const supabase = await measureStep('supabase.create_server_client', () => createSupabaseServerClient())

  let fileBuffer: ArrayBuffer
  try {
    fileBuffer = await downloadStorageObject({
      client: supabase,
      objectKey: sourceImage.imagePath,
    })
  } catch {
    return NextResponse.json({ error: '画像ファイルが見つかりません' }, { status: 404 })
  }

  return new NextResponse(fileBuffer, {
    headers: {
      'Content-Type': sourceImage.mimeType,
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  })
  })
}
