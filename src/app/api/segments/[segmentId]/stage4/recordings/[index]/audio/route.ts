import { NextResponse } from 'next/server'

import { requireAppUserForApi } from '@/lib/auth'
import { db } from '@/lib/db'
import { createFileResponse } from '@/lib/file-response'
import { measureStep, withApiPerf } from '@/lib/perf'
import { STAGE4_STAGE_NUMBER, recordingContentTypeFromKey } from '@/lib/recording-storage'
import { downloadStorageObject } from '@/lib/storage'
import { createSupabaseServerClient } from '@/lib/supabase/server'

type RouteContext = {
  params: Promise<{
    segmentId: string
    index: string
  }>
}

// Stream back the learner's most recent stage 4 recording for a sentence so the
// panel can play it next to the reference for self-comparison.
export async function GET(request: Request, context: RouteContext) {
  return withApiPerf(
    '/api/segments/[segmentId]/stage4/recordings/[index]/audio',
    request,
    async () => {
      try {
        const { user, response } = await measureStep('auth.require_api_user', () =>
          requireAppUserForApi(),
        )
        if (response || !user) {
          return response
        }

        const { segmentId, index } = await measureStep('route.params', () => context.params)
        const sentenceIndex = Number.parseInt(index, 10)
        if (!Number.isInteger(sentenceIndex) || sentenceIndex < 0) {
          return NextResponse.json({ error: '文のインデックスが不正です。' }, { status: 400 })
        }

        // Ownership check: only the segment owner may fetch its recordings.
        const segment = await measureStep('db.segment.find_stage4_recording_audio', () =>
          db.segment.findFirst({
            where: { id: segmentId, project: { userId: user.id } },
            select: { id: true },
          }),
        )
        if (!segment) {
          return NextResponse.json({ error: 'セグメントが見つかりません。' }, { status: 404 })
        }

        const recording = await measureStep('db.recording.find_latest_for_sentence', () =>
          db.recording.findFirst({
            where: {
              segmentId: segment.id,
              stage: STAGE4_STAGE_NUMBER,
              sentenceIndex,
            },
            orderBy: { createdAt: 'desc' },
            select: { filePath: true },
          }),
        )
        if (!recording) {
          return NextResponse.json({ error: '録音が見つかりません。' }, { status: 404 })
        }

        const supabase = await measureStep('supabase.create_server_client', () =>
          createSupabaseServerClient(),
        )

        let fileBuffer: ArrayBuffer
        try {
          fileBuffer = await measureStep('storage.download_recording', () =>
            downloadStorageObject({ client: supabase, objectKey: recording.filePath }),
          )
        } catch {
          return NextResponse.json({ error: '録音が見つかりません。' }, { status: 404 })
        }

        return createFileResponse({
          request,
          fileBuffer,
          contentType: recordingContentTypeFromKey(recording.filePath),
          // Recordings are user-private; the caller cache-busts with ?v=<id>
          // each time a new take lands, so a long immutable cache is safe.
          cacheControl: 'private, max-age=31536000, immutable',
        })
      } catch (error) {
        console.error('[stage4/recordings/audio] failed:', error)
        return NextResponse.json({ error: '録音の取得に失敗しました。' }, { status: 500 })
      }
    },
  )
}
