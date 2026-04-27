export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { notFound } from 'next/navigation'

import { LogoutButton } from '@/components/auth/logout-button'
import { SegmentStageWorkspace } from '@/components/segment/segment-stage-workspace'
import { SegmentAudioPlayer } from '@/components/segment/segment-audio-player'
import { requireAppUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { measureStep, withPagePerf } from '@/lib/perf'
import { computeCurrentStage } from '@/lib/stage-progress'

type SegmentDetailPageProps = {
  params: Promise<{
    projectId: string
    segmentId: string
  }>
}

export default async function SegmentDetailPage({ params }: SegmentDetailPageProps) {
  return withPagePerf('/projects/[projectId]/segments/[segmentId]', async () => {
  const currentUser = await measureStep('auth.require_user', () => requireAppUser())
  const { projectId, segmentId } = await measureStep('route.params', () => params)

  const project = await measureStep('db.project.find_segment_page', () =>
    db.project.findFirst({
      where: { id: projectId, userId: currentUser.id },
      select: { id: true, title: true, createdAt: true },
    }),
  )

  if (!project) {
    notFound()
  }

  const segment = await measureStep('db.segment.find_detail', () =>
    db.segment.findFirst({
      where: { id: segmentId, projectId, project: { userId: currentUser.id } },
      include: {
        progress: {
          orderBy: { stage: 'asc' },
        },
      },
    }),
  )

  if (!segment) {
    notFound()
  }

  // Fetch adjacent segments (prev and next by index)
  const [prevSegment, nextSegment] = await measureStep('db.segment.find_adjacent', () =>
    Promise.all([
      db.segment.findFirst({
        where: { projectId, index: { equals: segment.index - 1 } },
        select: { id: true, title: true, index: true },
      }),
      db.segment.findFirst({
        where: { projectId, index: { equals: segment.index + 1 } },
        select: { id: true, title: true, index: true },
      }),
    ]),
  )

  // Fetch adjacent projects only when at the boundary of the current project
  const [prevProjectEntry, nextProjectEntry] = await measureStep('db.project.find_adjacent', () =>
    Promise.all([
      prevSegment
        ? Promise.resolve(null)
        : db.project.findFirst({
            where: { userId: currentUser.id, createdAt: { lt: project.createdAt } },
            orderBy: { createdAt: 'desc' },
            select: {
              id: true,
              title: true,
              segments: { orderBy: { index: 'desc' }, take: 1, select: { id: true, title: true, index: true } },
            },
          }),
      nextSegment
        ? Promise.resolve(null)
        : db.project.findFirst({
            where: { userId: currentUser.id, createdAt: { gt: project.createdAt } },
            orderBy: { createdAt: 'asc' },
            select: {
              id: true,
              title: true,
              segments: { orderBy: { index: 'asc' }, take: 1, select: { id: true, title: true, index: true } },
            },
          }),
    ]),
  )

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
            computeCurrentStage(
              segment.progress.map((p) => ({ stage: p.stage, status: p.status })),
            ).currentStage
          }
        />

        {/* prev / next navigation */}
        <nav className="flex items-center justify-between gap-4 rounded-2xl border border-zinc-200 bg-white px-4 py-3">
          {/* left side */}
          {prevSegment ? (
            <Link
              href={`/projects/${projectId}/segments/${prevSegment.id}`}
              className="flex items-center gap-2 rounded-xl border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition hover:border-indigo-400 hover:text-indigo-600"
            >
              <span className="text-zinc-400">←</span>
              <span className="max-w-32 truncate">{prevSegment.title ?? `Segment ${prevSegment.index + 1}`}</span>
            </Link>
          ) : prevProjectEntry ? (
            <Link
              href={
                prevProjectEntry.segments[0]
                  ? `/projects/${prevProjectEntry.id}/segments/${prevProjectEntry.segments[0].id}`
                  : `/projects/${prevProjectEntry.id}`
              }
              className="flex items-center gap-2 rounded-xl border border-indigo-300 bg-indigo-50 px-4 py-2 text-sm font-medium text-indigo-700 transition hover:border-indigo-500 hover:bg-indigo-100"
            >
              <span>←</span>
              <span className="max-w-40 truncate">{prevProjectEntry.title}</span>
              <span className="shrink-0 text-xs text-indigo-400">前のプロジェクト</span>
            </Link>
          ) : (
            <Link
              href="/projects"
              className="flex items-center gap-2 rounded-xl border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-500 transition hover:border-zinc-400 hover:text-zinc-700"
            >
              <span>＋</span>
              <span>プロジェクトを追加</span>
            </Link>
          )}

          {/* right side */}
          {nextSegment ? (
            <Link
              href={`/projects/${projectId}/segments/${nextSegment.id}`}
              className="flex items-center gap-2 rounded-xl border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition hover:border-indigo-400 hover:text-indigo-600"
            >
              <span className="max-w-32 truncate">{nextSegment.title ?? `Segment ${nextSegment.index + 1}`}</span>
              <span className="text-zinc-400">→</span>
            </Link>
          ) : nextProjectEntry ? (
            <Link
              href={
                nextProjectEntry.segments[0]
                  ? `/projects/${nextProjectEntry.id}/segments/${nextProjectEntry.segments[0].id}`
                  : `/projects/${nextProjectEntry.id}`
              }
              className="flex items-center gap-2 rounded-xl border border-indigo-300 bg-indigo-50 px-4 py-2 text-sm font-medium text-indigo-700 transition hover:border-indigo-500 hover:bg-indigo-100"
            >
              <span className="shrink-0 text-xs text-indigo-400">次のプロジェクト</span>
              <span className="max-w-40 truncate">{nextProjectEntry.title}</span>
              <span>→</span>
            </Link>
          ) : (
            <Link
              href="/projects"
              className="flex items-center gap-2 rounded-xl border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-500 transition hover:border-zinc-400 hover:text-zinc-700"
            >
              <span>プロジェクトを追加</span>
              <span>＋</span>
            </Link>
          )}
        </nav>
      </div>
    </main>
  )
  })
}
