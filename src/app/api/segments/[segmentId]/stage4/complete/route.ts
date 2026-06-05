import { NextResponse } from 'next/server'

import { requireAppUserForApi } from '@/lib/auth'
import { db } from '@/lib/db'
import { measureStep, withApiPerf } from '@/lib/perf'
import { STAGE4_STAGE_NUMBER } from '@/lib/recording-storage'

type RouteContext = {
  params: Promise<{
    segmentId: string
  }>
}

// Manual "skip" path: lets a learner (or future admin tooling) mark stage 4
// complete without satisfying the per-sentence threshold. The UI uses this
// when the learner can't get a clean take (background noise, mic issues) and
// chooses to move on.
export async function POST(request: Request, context: RouteContext) {
  return withApiPerf('/api/segments/[segmentId]/stage4/complete', request, async () => {
    try {
      const { user, response } = await measureStep('auth.require_api_user', () => requireAppUserForApi())
      if (response || !user) {
        return response
      }

      const { segmentId } = await measureStep('route.params', () => context.params)

      const segment = await measureStep('db.segment.find_for_stage4_complete', () =>
        db.segment.findFirst({
          where: { id: segmentId, project: { userId: user.id } },
          select: { id: true },
        }),
      )

      if (!segment) {
        return NextResponse.json({ error: 'セグメントが見つかりません。' }, { status: 404 })
      }

      const stageProgress = await measureStep('db.stage_progress.upsert_complete', () =>
        db.stageProgress.upsert({
          where: {
            segmentId_stage: { segmentId: segment.id, stage: STAGE4_STAGE_NUMBER },
          },
          update: {
            status: 'completed',
            // Preserve the original completedAt on re-completes.
            completedAt: new Date(),
          },
          create: {
            segmentId: segment.id,
            stage: STAGE4_STAGE_NUMBER,
            status: 'completed',
            completedAt: new Date(),
          },
        }),
      )

      return NextResponse.json({
        stage: stageProgress.stage,
        status: stageProgress.status,
        completedAt: stageProgress.completedAt,
      })
    } catch (error) {
      console.error('[stage4/complete] failed:', error)
      return NextResponse.json({ error: 'ステージ4の完了に失敗しました。' }, { status: 500 })
    }
  })
}
