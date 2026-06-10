export const dynamic = 'force-dynamic'

import { LogoutButton } from '@/components/auth/logout-button'
import { ProjectCreateSection } from '@/components/project/project-create-section'
import { db } from '@/lib/db'
import { requireAppUser } from '@/lib/auth'
import { ProjectList } from '@/components/project/project-list'
import { measureStep, withPagePerf } from '@/lib/perf'

export default async function ProjectsPage() {
  return withPagePerf('/projects', async () => {
  const currentUser = await measureStep('auth.require_user', () => requireAppUser())

  const projects = await measureStep('db.project.find_many_with_images', () =>
    db.project.findMany({
      where: { userId: currentUser.id },
      orderBy: { createdAt: 'desc' },
      take: 3,
      include: {
        sourceImages: true,
        segments: {
          select: {
            id: true,
            progress: { select: { stage: true, status: true } },
          },
        },
      },
    }),
  )

  return (
    <main className="min-h-screen bg-surface px-6 pt-10 pb-28 text-ink">
      <div className="mx-auto grid max-w-5xl gap-8">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-ink-line/70 pb-6">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-accent">
              project dashboard
            </p>
            <h1 className="mt-2 font-display text-4xl font-semibold tracking-tight">
              プロジェクト一覧
            </h1>
            <p className="mt-2 text-sm text-ink-muted">{currentUser.email}</p>
          </div>
          <LogoutButton />
        </div>

        {projects.length === 0 ? <ProjectCreateSection /> : null}

        <ProjectList
          projects={projects.map((p) => ({
            id: p.id,
            title: p.title,
            audioOriginalName: p.audioOriginalName,
            status: p.status,
            sourceImages: p.sourceImages,
            createdAt: p.createdAt,
            segments: p.segments.map((s) => ({
              progress: s.progress,
            })),
          }))}
        />

        {projects.length > 0 ? <ProjectCreateSection initiallyOpen={false} /> : null}
      </div>
    </main>
  )
  })
}
