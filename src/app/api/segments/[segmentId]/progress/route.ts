import { NextResponse } from 'next/server'
import { z } from 'zod'

import { requireAppUserForApi } from '@/lib/auth'
import { db } from '@/lib/db'

const progressSchema = z.object({
  stage: z.number().int().min(1).max(5),
  status: z.enum(['not_started', 'in_progress', 'completed']),
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
  const parsed = progressSchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json({ error: 'リクエスト形式が正しくありません' }, { status: 400 })
  }

  const segment = await db.segment.findFirst({
    where: { id: segmentId, project: { userId: user.id } },
  })

  if (!segment) {
    return NextResponse.json({ error: 'セグメントが見つかりません' }, { status: 404 })
  }

  const { stage, status } = parsed.data
  const completedAt = status === 'completed' ? new Date() : null

  const progress = await db.stageProgress.upsert({
    where: {
      segmentId_stage: {
        segmentId,
        stage,
      },
    },
    update: {
      status,
      completedAt,
    },
    create: {
      segmentId,
      stage,
      status,
      completedAt,
    },
  })

  return NextResponse.json({
    stage: progress.stage,
    status: progress.status,
    completedAt: progress.completedAt,
  })
}
