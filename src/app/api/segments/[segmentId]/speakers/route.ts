import { NextResponse } from 'next/server'
import { z } from 'zod'

import { requireAppUserForApi } from '@/lib/auth'
import { db } from '@/lib/db'
import {
  applySpeakerLabels,
  isPersistedWhisperSegments,
  type Speaker,
} from '@/lib/sentence-split'

// Labels are keyed by position in `Segment.whisperSegments`. A null speaker
// clears the label (back to unannotated).
const speakersSchema = z.object({
  labels: z
    .array(
      z.object({
        index: z.number().int().min(0),
        speaker: z.enum(['A', 'B']).nullable(),
      }),
    )
    .max(500),
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

  const json = await request.json().catch(() => null)
  const parsed = speakersSchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json({ error: 'リクエスト形式が正しくありません' }, { status: 400 })
  }

  const segment = await db.segment.findFirst({
    where: { id: segmentId, project: { userId: user.id } },
    select: { id: true, whisperSegments: true },
  })

  if (!segment) {
    return NextResponse.json({ error: 'セグメントが見つかりません' }, { status: 404 })
  }

  if (!isPersistedWhisperSegments(segment.whisperSegments)) {
    return NextResponse.json(
      { error: '文字起こしがまだありません。ステージ4を開いて生成してください。' },
      { status: 409 },
    )
  }

  const chunks = segment.whisperSegments

  // Start from what is already stored so a partial edit doesn't wipe labels the
  // client didn't send, then overlay this request's changes.
  const labels: (Speaker | null)[] = chunks.map((chunk) => chunk.speaker ?? null)
  for (const label of parsed.data.labels) {
    if (label.index >= chunks.length) {
      return NextResponse.json(
        { error: '話者ラベルの位置が正しくありません' },
        { status: 400 },
      )
    }
    labels[label.index] = label.speaker
  }

  await db.segment.update({
    where: { id: segment.id },
    data: { whisperSegments: applySpeakerLabels(chunks, labels) },
  })

  return NextResponse.json({ labels })
}
