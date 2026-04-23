export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { notFound } from 'next/navigation'

import { LogoutButton } from '@/components/auth/logout-button'
import { SegmentStageWorkspace } from '@/components/segment/segment-stage-workspace'
import { SegmentAudioPlayer } from '@/components/segment/segment-audio-player'
import { requireAppUser } from '@/lib/auth'
import { db } from '@/lib/db'

type SegmentDetailPageProps = {
  params: Promise<{
    projectId: string
    segmentId: string
  }>
}

export default async function SegmentDetailPage({ params }: SegmentDetailPageProps) {
  const currentUser = await requireAppUser()
  const { projectId, segmentId } = await params

  const project = await db.project.findFirst({
    where: { id: projectId, userId: currentUser.id },
    select: { id: true, title: true },
  })

  if (!project) {
    notFound()
  }

  const segment = await db.segment.findFirst({
    where: { id: segmentId, projectId, project: { userId: currentUser.id } },
    include: {
      progress: {
        orderBy: { stage: 'asc' },
      },
    },
  })

  if (!segment) {
    notFound()
  }

  // Fetch adjacent segments (prev and next by index)
  const [prevSegment, nextSegment] = await Promise.all([
    db.segment.findFirst({
      where: { projectId, index: { equals: segment.index - 1 } },
      select: { id: true, title: true, index: true },
    }),
    db.segment.findFirst({
      where: { projectId, index: { equals: segment.index + 1 } },
      select: { id: true, title: true, index: true },
    }),
  ])

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
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href={`/projects/${projectId}`}
              className="rounded-2xl border border-zinc-300 bg-white px-4 py-3 text-sm font-medium text-zinc-900 transition hover:border-zinc-900"
            >
              ← プロジェクトに戻る
            </Link>
            <LogoutButton />
          </div>
        </div>

        {/* audio player */}
        <section className="rounded-3xl border border-black/10 bg-white p-8 shadow-sm">
          <SegmentAudioPlayer
            src={`/api/segments/${segment.id}/audio`}
            title={segment.title ?? ''}
          />
        </section>

        <SegmentStageWorkspace
          segmentId={segment.id}
          initialProgress={segment.progress.map((p) => ({
            stage: p.stage,
            status: p.status,
          }))}
          initialText={segment.text ?? ''}
          initialNotes={segment.notes ?? null}
          initialStage={
            segment.progress
              .filter((p) => p.status === 'in_progress' || p.status === 'completed')
              .map((p) => p.stage)
              .sort((a, b) => b - a)[0] ?? 1
          }
        />

        {/* prev / next navigation */}
        <nav className="flex items-center justify-between gap-4 rounded-2xl border border-zinc-200 bg-white px-4 py-3">
          {prevSegment ? (
            <Link
              href={`/projects/${projectId}/segments/${prevSegment.id}`}
              className="flex items-center gap-2 rounded-xl border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition hover:border-indigo-400 hover:text-indigo-600"
            >
              <span className="text-zinc-400">←</span>
              <span className="max-w-32 truncate">{prevSegment.title ?? `Segment ${prevSegment.index + 1}`}</span>
            </Link>
          ) : (
            <span className="text-sm text-zinc-300">前のセグメント</span>
          )}
          {nextSegment ? (
            <Link
              href={`/projects/${projectId}/segments/${nextSegment.id}`}
              className="flex items-center gap-2 rounded-xl border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition hover:border-indigo-400 hover:text-indigo-600"
            >
              <span className="max-w-32 truncate">{nextSegment.title ?? `Segment ${nextSegment.index + 1}`}</span>
              <span className="text-zinc-400">→</span>
            </Link>
          ) : (
            <span className="text-sm text-zinc-300">次のセグメント</span>
          )}
        </nav>
      </div>
    </main>
  )
}
