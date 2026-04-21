export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { notFound } from 'next/navigation'

import { SegmentAudioPlayer } from '@/components/segment/segment-audio-player'
import { StageIcons } from '@/components/segment/stage-icons'
import { db } from '@/lib/db'

type SegmentDetailPageProps = {
  params: Promise<{
    projectId: string
    segmentId: string
  }>
}

export default async function SegmentDetailPage({ params }: SegmentDetailPageProps) {
  const { projectId, segmentId } = await params

  const project = await db.project.findUnique({
    where: { id: projectId },
    select: { id: true, title: true },
  })

  if (!project) {
    notFound()
  }

  const segment = await db.segment.findUnique({
    where: { id: segmentId },
    include: {
      progress: {
        orderBy: { stage: 'asc' },
      },
    },
  })

  if (!segment) {
    notFound()
  }

  return (
    <main className="min-h-screen bg-zinc-50 px-6 py-10 text-zinc-950">
      <div className="mx-auto grid max-w-2xl gap-8">
        {/* header */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-indigo-600">セグメント詳細</p>
            <h1 className="text-2xl font-semibold tracking-tight">
              {segment.title ?? `Segment ${segment.index + 1}`}
            </h1>
            <p className="mt-1 text-sm text-zinc-500">
              {project.title} · {segment.index + 1}番目
            </p>
          </div>
          <Link
            href={`/projects/${projectId}`}
            className="rounded-2xl border border-zinc-300 bg-white px-4 py-3 text-sm font-medium text-zinc-900 transition hover:border-zinc-900"
          >
            ← プロジェクトに戻る
          </Link>
        </div>

        {/* audio player */}
        <section className="rounded-3xl border border-black/10 bg-white p-8 shadow-sm">
          <SegmentAudioPlayer
            src={`/api/segments/${segment.id}/audio`}
            title={segment.title ?? ''}
          />
        </section>

        {/* stage 1-5 */}
        <section className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-zinc-950">Stage 1–5</h2>
          <div className="flex items-center gap-2">
            <StageIcons
              progress={segment.progress.map((p) => ({
                stage: p.stage,
                status: p.status,
              }))}
            />
          </div>
          <p className="mt-4 text-sm text-zinc-500">
            タップしてステージを開始 / 完了状態を確認
          </p>
        </section>
      </div>
    </main>
  )
}
