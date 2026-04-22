import { NextResponse } from 'next/server'

import { requireAppUserForApi } from '@/lib/auth'
import { db } from '@/lib/db'
import { deleteProjectStorage } from '@/lib/storage'

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
    select: { id: true },
  })

  if (!project) {
    return NextResponse.json({ error: 'プロジェクトが見つかりません。' }, { status: 404 })
  }

  // Delete DB records (cascades to segments, sourceImages, stageProgresses, recordings)
  await db.project.delete({ where: { id: projectId } })

  // Delete all project files from storage
  await deleteProjectStorage(projectId)

  return NextResponse.json({ success: true })
}
