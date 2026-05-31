export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { notFound } from 'next/navigation'

import { LogoutButton } from '@/components/auth/logout-button'
import { SegmentStageWorkspace } from '@/components/segment/segment-stage-workspace'
import { SegmentAudioPlayer } from '@/components/segment/segment-audio-player'
import { requireAppUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { measureStep, withPagePerf } from '@/lib/perf'
import { findNextIncompleteSegment } from '@/lib/segment-navigation'
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

  const allSegments = await measureStep('db.segment.find_all_for_project', () =>
    db.segment.findMany({
      where: { projectId },
      orderBy: { index: 'asc' },
      select: { id: true, title: true, index: true },
    }),
  )

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

  // Where to send the learner once every stage of this segment is completed:
  // the next segment still needing work, then the next project's first such
  // segment. Null means there's nothing left ahead.
  const nextIncomplete = await measureStep('db.segment.find_next_incomplete', () =>
    findNextIncompleteSegment({
      userId: currentUser.id,
      projectId,
      projectCreatedAt: project.createdAt,
      segmentIndex: segment.index,
    }),
  )

  const nextIncompleteHref = nextIncomplete
    ? `/projects/${nextIncomplete.projectId}/segments/${nextIncomplete.segmentId}`
    : null

  return (
    <main className="min-h-screen overflow-x-hidden bg-surface text-ink">
      <div className="mx-auto grid max-w-2xl gap-8 px-4 py-10 pb-[calc(env(safe-area-inset-bottom)+17rem)] sm:px-6 sm:pb-[calc(env(safe-area-inset-bottom)+15rem)]">
        {/* header */}
        <div className="flex flex-wrap items-end justify-between gap-2 border-b border-ink-line/70 pb-5 sm:gap-4">
          <div className="min-w-0">
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-accent">
              segment · 練習
            </p>
            <h1 className="mt-2 truncate font-display text-2xl font-semibold tracking-tight sm:text-3xl">
              {segment.title ?? `Segment ${segment.index + 1}`}
            </h1>
            <p className="mt-1 text-sm text-ink-muted">
              {project.title} · {segment.index + 1}番目
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <LogoutButton />
          </div>
        </div>

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
          nextIncompleteHref={nextIncompleteHref}
        />

        {/* prev / next navigation */}
        <nav className="flex items-center justify-between gap-4 rounded-card border border-ink-line bg-paper px-4 py-3">
          {/* left side */}
          {prevSegment ? (
            <Link
              href={`/projects/${projectId}/segments/${prevSegment.id}`}
              className="flex items-center gap-2 rounded-chip border border-ink-line bg-paper px-4 py-2 text-sm font-medium text-ink-muted transition hover:border-accent hover:text-accent"
            >
              <span className="text-ink-faint">←</span>
              <span className="max-w-32 truncate">{prevSegment.title ?? `Segment ${prevSegment.index + 1}`}</span>
            </Link>
          ) : prevProjectEntry ? (
            <Link
              href={
                prevProjectEntry.segments[0]
                  ? `/projects/${prevProjectEntry.id}/segments/${prevProjectEntry.segments[0].id}`
                  : `/projects/${prevProjectEntry.id}`
              }
              className="flex items-center gap-2 rounded-chip border border-accent-soft bg-accent-faint px-4 py-2 text-sm font-medium text-accent-deep transition hover:border-accent hover:bg-accent-soft"
            >
              <span>←</span>
              <span className="max-w-40 truncate">{prevProjectEntry.title}</span>
              <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.14em] text-accent/70">prev</span>
            </Link>
          ) : (
            <Link
              href="/projects"
              className="flex items-center gap-2 rounded-chip border border-ink-line bg-paper px-4 py-2 text-sm font-medium text-ink-faint transition hover:border-ink hover:text-ink"
            >
              <span>＋</span>
              <span>プロジェクトを追加</span>
            </Link>
          )}

          {/* right side */}
          {nextSegment ? (
            <Link
              href={`/projects/${projectId}/segments/${nextSegment.id}`}
              className="flex items-center gap-2 rounded-chip border border-ink-line bg-paper px-4 py-2 text-sm font-medium text-ink-muted transition hover:border-accent hover:text-accent"
            >
              <span className="max-w-32 truncate">{nextSegment.title ?? `Segment ${nextSegment.index + 1}`}</span>
              <span className="text-ink-faint">→</span>
            </Link>
          ) : nextProjectEntry ? (
            <Link
              href={
                nextProjectEntry.segments[0]
                  ? `/projects/${nextProjectEntry.id}/segments/${nextProjectEntry.segments[0].id}`
                  : `/projects/${nextProjectEntry.id}`
              }
              className="flex items-center gap-2 rounded-chip border border-accent-soft bg-accent-faint px-4 py-2 text-sm font-medium text-accent-deep transition hover:border-accent hover:bg-accent-soft"
            >
              <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.14em] text-accent/70">next</span>
              <span className="max-w-40 truncate">{nextProjectEntry.title}</span>
              <span>→</span>
            </Link>
          ) : (
            <Link
              href="/projects"
              className="flex items-center gap-2 rounded-chip border border-ink-line bg-paper px-4 py-2 text-sm font-medium text-ink-faint transition hover:border-ink hover:text-ink"
            >
              <span>プロジェクトを追加</span>
              <span>＋</span>
            </Link>
          )}
        </nav>
      </div>

      {/* fixed bottom audio player — always visible for quick mobile playback control.
          The nav row below the slider doubles as a buffer against the iOS bottom
          gesture area so the progress bar thumb stays comfortably draggable. */}
      <div className="glass-player fixed inset-x-0 bottom-0 z-30 border-t border-ink-line/60 shadow-[0_-4px_24px_rgba(29,27,24,0.06)]">
        <div
          className="mx-auto max-w-2xl px-4 pt-3 sm:px-6 sm:pt-4"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 0.5rem)' }}
        >
          <SegmentAudioPlayer
            src={`/api/segments/${segment.id}/audio`}
            title={segment.title ?? ''}
            projectId={projectId}
            segmentId={segment.id}
            segments={allSegments}
          />

          <div className="mt-3 flex items-center justify-between gap-2 text-xs">
            <Link
              href="/"
              className="inline-flex items-center gap-1 rounded-chip border border-ink-line bg-paper px-3 py-2 font-medium text-ink-muted transition hover:border-ink hover:text-ink"
            >
              ホーム
            </Link>
            <Link
              href={`/projects/${projectId}`}
              aria-label="プロジェクトに戻る"
              className="inline-flex items-center gap-1 rounded-chip border border-ink-line bg-paper px-3 py-2 font-medium text-ink-muted transition hover:border-ink hover:text-ink"
            >
              ← 戻る
            </Link>
          </div>
        </div>
      </div>
    </main>
  )
  })
}
