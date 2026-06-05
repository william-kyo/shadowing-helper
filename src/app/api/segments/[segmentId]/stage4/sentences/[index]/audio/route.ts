import path from 'node:path'

import { NextResponse } from 'next/server'

import { requireAppUserForApi } from '@/lib/auth'
import { db } from '@/lib/db'
import { createFileResponse } from '@/lib/file-response'
import { measureStep, withApiPerf } from '@/lib/perf'
import { getStage4SentenceAudioKey } from '@/lib/recording-storage'
import {
  buildFallbackSentenceUnits,
  buildSentenceUnits,
  isPersistedWhisperSegments,
} from '@/lib/sentence-split'
import { downloadStorageObject } from '@/lib/storage'
import { createSupabaseServerClient } from '@/lib/supabase/server'

type RouteContext = {
  params: Promise<{
    segmentId: string
    index: string
  }>
}

export async function GET(request: Request, context: RouteContext) {
  return withApiPerf('/api/segments/[segmentId]/stage4/sentences/[index]/audio', request, async () => {
    try {
      const { user, response } = await measureStep('auth.require_api_user', () => requireAppUserForApi())
      if (response || !user) {
        return response
      }

      const { segmentId, index } = await measureStep('route.params', () => context.params)
      const sentenceIndex = Number.parseInt(index, 10)
      if (!Number.isInteger(sentenceIndex) || sentenceIndex < 0) {
        return NextResponse.json({ error: '文のインデックスが不正です。' }, { status: 400 })
      }

      const segment = await measureStep('db.segment.find_stage4_audio', () =>
        db.segment.findFirst({
          where: { id: segmentId, project: { userId: user.id } },
          select: {
            id: true,
            text: true,
            audioPath: true,
            startMs: true,
            endMs: true,
            whisperSegments: true,
            project: {
              select: { audioMimeType: true },
            },
          },
        }),
      )

      if (!segment) {
        return NextResponse.json({ error: 'セグメントが見つかりません。' }, { status: 404 })
      }

      const persisted = isPersistedWhisperSegments(segment.whisperSegments)
        ? segment.whisperSegments
        : null

      let units = buildSentenceUnits(persisted)
      if (units.length === 0) {
        units = buildFallbackSentenceUnits({
          text: segment.text,
          totalStartMs: 0,
          totalEndMs: Math.max(0, (segment.endMs ?? 0) - (segment.startMs ?? 0)),
        })
      }
      if (sentenceIndex >= units.length) {
        return NextResponse.json({ error: '文が見つかりません。' }, { status: 404 })
      }

      const ext = path.extname(segment.audioPath)
      const objectKey = getStage4SentenceAudioKey({
        ownerSupabaseUserId: user.supabaseUserId,
        segmentId: segment.id,
        index: sentenceIndex,
        extension: ext,
      })

      const supabase = await measureStep('supabase.create_server_client', () =>
        createSupabaseServerClient(),
      )

      let fileBuffer: ArrayBuffer
      try {
        fileBuffer = await measureStep('storage.download_sentence_audio', () =>
          downloadStorageObject({ client: supabase, objectKey }),
        )
      } catch {
        return NextResponse.json({ error: 'お手本が見つかりません。' }, { status: 404 })
      }

      return createFileResponse({
        request,
        fileBuffer,
        contentType: segment.project.audioMimeType,
        cacheControl: 'public, max-age=31536000, immutable',
      })
    } catch (error) {
      console.error('[stage4/sentences/audio] failed:', error)
      return NextResponse.json({ error: 'お手本の取得に失敗しました。' }, { status: 500 })
    }
  })
}
