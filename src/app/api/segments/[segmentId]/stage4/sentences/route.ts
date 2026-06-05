import { NextResponse } from 'next/server'

import { requireAppUserForApi } from '@/lib/auth'
import { loadStage4Setup } from '@/lib/stage-4-server'
import { addPerfAttrs, measureStep, withApiPerf } from '@/lib/perf'

type RouteContext = {
  params: Promise<{
    segmentId: string
  }>
}

export async function GET(request: Request, context: RouteContext) {
  return withApiPerf('/api/segments/[segmentId]/stage4/sentences', request, async () => {
    try {
      const { user, response } = await measureStep('auth.require_api_user', () => requireAppUserForApi())
      if (response || !user) {
        return response
      }

      const { segmentId } = await measureStep('route.params', () => context.params)

      const setup = await measureStep('stage4.load_setup', () =>
        loadStage4Setup({ segmentId, user: { id: user.id, supabaseUserId: user.supabaseUserId } }),
      )

      if (!setup) {
        return NextResponse.json({ error: 'セグメントが見つかりません。' }, { status: 404 })
      }

      addPerfAttrs({
        'stage4.sentences_count': setup.sentences.length,
        'stage4.did_backfill': setup.didBackfill,
      })

      return NextResponse.json({
        sentences: setup.sentences,
        initialMetadata: setup.initialMetadata,
      })
    } catch (error) {
      console.error('[stage4/sentences] failed:', error)
      return NextResponse.json({ error: 'ステージ4の読み込みに失敗しました。' }, { status: 500 })
    }
  })
}
