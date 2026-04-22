import { rm } from 'node:fs/promises'

import { NextResponse } from 'next/server'

import { db } from '@/lib/db'

type RouteContext = {
  params: Promise<{
    segmentId: string
  }>
}

export async function DELETE(request: Request, context: RouteContext) {
  const { segmentId } = await context.params

  const segment = await db.segment.findUnique({
    where: { id: segmentId },
    select: { id: true, audioPath: true },
  })

  if (!segment) {
    return NextResponse.json({ error: 'セグメントが見つかりません。' }, { status: 404 })
  }

  // Delete DB record (cascades to stageProgresses, recordings)
  await db.segment.delete({ where: { id: segmentId } })

  // Delete segment audio file
  try {
    await rm(segment.audioPath, { force: true })
  } catch {
    // ignore
  }

  return NextResponse.json({ success: true })
}
