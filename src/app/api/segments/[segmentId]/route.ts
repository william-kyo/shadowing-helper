import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { Prisma } from '@prisma/client'

import { guessSpeakers } from '@/lib/segment-analysis'
import { requireAppUserForApi } from '@/lib/auth'
import { db } from '@/lib/db'
import { applySpeakerLabels, isPersistedWhisperSegments } from '@/lib/sentence-split'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { removeStorageObjects } from '@/lib/storage'

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
  const { user, response } = await requireAppUserForApi()
  if (response || !user) {
    return response
  }

  const { segmentId } = await context.params

  const json = await request.json()
  const parsed = updateSchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json({ error: 'リクエスト形式が正しくありません' }, { status: 400 })
  }

  const segment = await db.segment.findFirst({
    where: { id: segmentId, project: { userId: user.id } },
    select: { id: true, audioPath: true, text: true, whisperSegments: true },
  })

  if (!segment) {
    return NextResponse.json({ error: 'セグメントが見つかりません' }, { status: 404 })
  }

  // When the script changes and the segment has transcription chunks, re-guess
  // speaker labels so the learner's corrections in stage 1 stay in sync.
  const baseUpdateData = {
    ...(parsed.data.text !== undefined && { text: parsed.data.text }),
    ...(parsed.data.notes !== undefined && { notes: parsed.data.notes }),
  }

  let updateData: Prisma.SegmentUpdateInput = baseUpdateData
  if (
    parsed.data.text !== undefined &&
    parsed.data.text !== segment.text &&
    isPersistedWhisperSegments(segment.whisperSegments)
  ) {
    try {
      const speakers = await guessSpeakers(segment.whisperSegments)
      updateData = { ...baseUpdateData, whisperSegments: applySpeakerLabels(segment.whisperSegments, speakers) }
    } catch {
      // If re-guessing fails, proceed with the script update alone — this is
      // best-effort (like the learner correcting by hand), never a blocker.
    }
  }

  const updated = await db.segment.update({
    where: { id: segmentId },
    data: updateData,
  })

  return NextResponse.json({ text: updated.text, notes: updated.notes })
}

export async function DELETE(request: Request, context: RouteContext) {
  const { user, response } = await requireAppUserForApi()
  if (response || !user) {
    return response
  }

  const { segmentId } = await context.params

  const segment = await db.segment.findFirst({
    where: { id: segmentId, project: { userId: user.id } },
  })

  if (!segment) {
    return NextResponse.json({ error: 'セグメントが見つかりません' }, { status: 404 })
  }

  // Delete DB records (cascades to stageProgress, recordings)
  await db.segment.delete({ where: { id: segmentId } })

  const supabase = await createSupabaseServerClient()

  try {
    await removeStorageObjects({
      client: supabase,
      objectKeys: [segment.audioPath],
    })
  } catch {
    // ignore storage deletion errors
  }

  return NextResponse.json({ success: true })
}
