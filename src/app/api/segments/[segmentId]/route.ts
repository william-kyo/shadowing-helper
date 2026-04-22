import { NextResponse } from 'next/server'
import { z } from 'zod'
import { rm } from 'node:fs/promises'
import { db } from '@/lib/db'

const updateSchema = z.object({
  text: z.string().optional(),
  notes: z.string().optional(),
})

type RouteContext = {
  params: Promise<{
    segmentId: string
  }>
}

export async function PATCH(request: Request, context: RouteContext) {
  const { segmentId } = await context.params

  const json = await request.json()
  const parsed = updateSchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json({ error: 'リクエスト形式が正しくありません' }, { status: 400 })
  }

  const segment = await db.segment.findUnique({
    where: { id: segmentId },
  })

  if (!segment) {
    return NextResponse.json({ error: 'セグメントが見つかりません' }, { status: 404 })
  }

  const updated = await db.segment.update({
    where: { id: segmentId },
    data: {
      ...(parsed.data.text !== undefined && { text: parsed.data.text }),
      ...(parsed.data.notes !== undefined && { notes: parsed.data.notes }),
    },
  })

  return NextResponse.json({ text: updated.text, notes: updated.notes })
}

export async function DELETE(request: Request, context: RouteContext) {
  const { segmentId } = await context.params

  const segment = await db.segment.findUnique({
    where: { id: segmentId },
  })

  if (!segment) {
    return NextResponse.json({ error: 'セグメントが見つかりません' }, { status: 404 })
  }

  // Delete DB records (cascades to stageProgress, recordings)
  await db.segment.delete({ where: { id: segmentId } })

  // Delete segment audio file
  try {
    await rm(segment.audioPath, { force: true })
  } catch {
    // ignore file deletion errors
  }

  return NextResponse.json({ success: true })
}
