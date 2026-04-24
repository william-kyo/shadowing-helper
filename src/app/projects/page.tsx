export const dynamic = 'force-dynamic'

import { LogoutButton } from '@/components/auth/logout-button'
import { ProjectCreateSection } from '@/components/project/project-create-section'
import { db } from '@/lib/db'
import { requireAppUser } from '@/lib/auth'
import { ProjectList } from '@/components/project/project-list'

export default async function ProjectsPage() {
  const currentUser = await requireAppUser()

  const projects = await db.project.findMany({
    where: { userId: currentUser.id },
    orderBy: { createdAt: 'desc' },
    include: { sourceImages: true },
  })

  return (
    <main className="min-h-screen bg-zinc-50 px-6 py-10 text-zinc-950">
      <div className="mx-auto grid max-w-5xl gap-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-indigo-600">Project dashboard</p>
            <h1 className="text-3xl font-semibold tracking-tight">プロジェクト一覧</h1>
            <p className="mt-2 text-sm text-zinc-500">{currentUser.email}</p>
          </div>
          <LogoutButton />
        </div>

        {projects.length === 0 ? <ProjectCreateSection /> : null}

        <ProjectList
          projects={projects.map((p) => ({
            id: p.id,
            title: p.title,
            audioOriginalName: p.audioOriginalName,
            sourceImages: p.sourceImages,
            status: p.status,
            createdAt: p.createdAt,
            rawExtractedText: p.rawExtractedText,
          }))}
        />

        {projects.length > 0 ? <ProjectCreateSection initiallyOpen={false} /> : null}
      </div>
    </main>
  )
}
