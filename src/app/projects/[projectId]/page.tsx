export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { notFound } from 'next/navigation'

import { LogoutButton } from '@/components/auth/logout-button'
import { ProjectSegmentWorkspace } from '@/components/project/project-segment-workspace'
import { requireAppUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { measureStep, withPagePerf } from '@/lib/perf'

type ProjectDetailPageProps = {
  params: Promise<{
    projectId: string
  }>
}

export default async function ProjectDetailPage({ params }: ProjectDetailPageProps) {
  return withPagePerf('/projects/[projectId]', async () => {
  const currentUser = await measureStep('auth.require_user', () => requireAppUser())
  const { projectId } = await measureStep('route.params', () => params)
  const project = await measureStep('db.project.find_detail', () =>
    db.project.findFirst({
      where: { id: projectId, userId: currentUser.id },
      include: {
        sourceImages: {
          orderBy: { sortOrder: 'asc' },
        },
        segments: {
          orderBy: { index: 'asc' },
          include: {
            progress: {
              orderBy: { stage: 'asc' },
            },
          },
        },
      },
    }),
  )

  if (!project) {
    notFound()
  }

  const totalSegments = project.segments.length
  const completedSegments = project.segments.filter((s) =>
    [1, 2, 3, 4, 5].every((stage) =>
      s.progress.some((p) => p.stage === stage && p.status === 'completed'),
    ),
  ).length
  const projectStatusLabel =
    totalSegments === 0
      ? '未着手'
      : completedSegments === totalSegments
        ? '完了'
        : '進行中'
  const projectStatusDetail =
    totalSegments === 0 ? 'セグメントなし' : `${completedSegments} / ${totalSegments} 完了`

  const [prevProject, nextProject] = await measureStep('db.project.find_adjacent', () =>
    Promise.all([
      db.project.findFirst({
        where: { userId: currentUser.id, createdAt: { lt: project.createdAt } },
        orderBy: { createdAt: 'desc' },
        select: { id: true, title: true },
      }),
      db.project.findFirst({
        where: { userId: currentUser.id, createdAt: { gt: project.createdAt } },
        orderBy: { createdAt: 'asc' },
        select: { id: true, title: true },
      }),
    ]),
  )

  return (
    <main className="min-h-screen bg-surface px-6 py-10 text-ink">
      <div className="mx-auto grid max-w-5xl gap-8">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-ink-line/70 pb-6">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-accent">
              project · detail
            </p>
            <h1 className="mt-2 font-display text-4xl font-semibold tracking-tight">
              {project.title}
            </h1>
            <p className="mt-2 text-sm text-ink-muted">
              {projectStatusLabel} · {projectStatusDetail}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-sm">
            <Link
              href="/"
              className="rounded-chip border border-ink-line bg-paper px-4 py-2.5 font-medium text-ink-muted transition hover:border-ink hover:text-ink"
            >
              ホーム
            </Link>
            <Link
              href="/projects"
              className="rounded-chip border border-ink-line bg-paper px-4 py-2.5 font-medium text-ink-muted transition hover:border-ink hover:text-ink"
            >
              一覧へ戻る
            </Link>
            <LogoutButton />
          </div>
        </div>

        <ProjectSegmentWorkspace
          projectId={project.id}
          projectStatus={project.status}
          audioSrc={`/api/projects/${project.id}/audio`}
          audioMimeType={project.audioMimeType}
          audioOriginalName={project.audioOriginalName}
          initialSegments={project.segments.map((segment) => ({
            id: segment.id,
            index: segment.index,
            title: segment.title,
            startMs: segment.startMs,
            endMs: segment.endMs,
            progressCount: segment.progress.length,
            progress: segment.progress.map((p) => ({ stage: p.stage, status: p.status })),
          }))}
        />

        <section className="grid gap-4 rounded-card border border-ink-line bg-paper p-6">
          <div>
            <h2 className="font-display text-2xl font-semibold tracking-tight">台本画像</h2>
            <p className="mt-2 text-sm text-ink-muted">アップロード順に表示しています。</p>
          </div>

          {project.sourceImages.length === 0 ? (
            <p className="text-sm text-ink-faint">画像はまだありません。</p>
          ) : (
            <div className={`grid gap-4 ${project.sourceImages.length >= 5 ? 'grid-cols-3' : 'grid-cols-2'}`}>
              {project.sourceImages.map((image) => (
                <div key={image.id} className="flex flex-col items-center gap-2">
                  <img
                    src={`/api/projects/${project.id}/images/${image.id}`}
                    alt={image.originalName}
                    className="w-full h-auto rounded-inset border border-ink-line"
                  />
                  <p className="text-xs text-ink-muted text-center">{image.originalName}</p>
                </div>
              ))}
            </div>
          )}
        </section>
        {/* prev / next project navigation */}
        <nav className="flex items-center justify-between gap-4 rounded-card border border-ink-line bg-paper px-4 py-3">
          {prevProject ? (
            <Link
              href={`/projects/${prevProject.id}`}
              className="flex items-center gap-2 rounded-chip border border-ink-line bg-paper px-4 py-2 text-sm font-medium text-ink-muted transition hover:border-accent hover:text-accent"
            >
              <span className="text-ink-faint">←</span>
              <span className="max-w-48 truncate">{prevProject.title}</span>
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
          {nextProject ? (
            <Link
              href={`/projects/${nextProject.id}`}
              className="flex items-center gap-2 rounded-chip border border-ink-line bg-paper px-4 py-2 text-sm font-medium text-ink-muted transition hover:border-accent hover:text-accent"
            >
              <span className="max-w-48 truncate">{nextProject.title}</span>
              <span className="text-ink-faint">→</span>
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
    </main>
  )
  })
}
