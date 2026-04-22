import { NextResponse } from 'next/server'

import { db } from '@/lib/db'
import { deleteProjectStorage } from '@/lib/storage'

type RouteContext = {
  params: Promise<{
    projectId: string
  }>
}

export async function DELETE(request: Request, context: RouteContext) {
  const { projectId } = await context.params

  const project = await db.project.findUnique({
    where: { id: projectId },
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
