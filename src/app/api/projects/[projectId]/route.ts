import { NextResponse } from 'next/server'

import { requireAppUserForApi } from '@/lib/auth'
import { db } from '@/lib/db'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { removeStorageObjects } from '@/lib/storage'

type RouteContext = {
  params: Promise<{
    projectId: string
  }>
}

export async function DELETE(request: Request, context: RouteContext) {
  const { user, response } = await requireAppUserForApi()
  if (response || !user) {
    return response
  }

  const { projectId } = await context.params

  const project = await db.project.findFirst({
    where: { id: projectId, userId: user.id },
    select: {
      id: true,
      audioPath: true,
      sourceImages: { select: { imagePath: true } },
      segments: {
        select: {
          audioPath: true,
          recordings: { select: { filePath: true } },
        },
      },
    },
  })

  if (!project) {
    return NextResponse.json({ error: 'プロジェクトが見つかりません。' }, { status: 404 })
  }

  // Delete DB records (cascades to segments, sourceImages, stageProgresses, recordings)
  await db.project.delete({ where: { id: projectId } })

  const supabase = await createSupabaseServerClient()
  const objectKeys = [
    project.audioPath,
    ...project.sourceImages.map((image) => image.imagePath),
    ...project.segments.map((segment) => segment.audioPath),
    ...project.segments.flatMap((segment) => segment.recordings.map((recording) => recording.filePath)),
  ]

  try {
    await removeStorageObjects({
      client: supabase,
      objectKeys,
    })
  } catch {
    // ignore storage deletion errors
  }

  return NextResponse.json({ success: true })
}
