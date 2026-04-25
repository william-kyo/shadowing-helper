export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { notFound } from 'next/navigation'

import { LogoutButton } from '@/components/auth/logout-button'
import { ProjectSegmentWorkspace } from '@/components/project/project-segment-workspace'
import { requireAppUser } from '@/lib/auth'
import { db } from '@/lib/db'

type ProjectDetailPageProps = {
  params: Promise<{
    projectId: string
  }>
}

export default async function ProjectDetailPage({ params }: ProjectDetailPageProps) {
  const currentUser = await requireAppUser()
  const { projectId } = await params
  const project = await db.project.findFirst({
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
  })

  if (!project) {
    notFound()
  }

  return (
    <main className="min-h-screen bg-zinc-50 px-6 py-10 text-zinc-950">
      <div className="mx-auto grid max-w-5xl gap-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-indigo-600">Project detail</p>
            <h1 className="text-3xl font-semibold tracking-tight">{project.title}</h1>
            <p className="mt-2 text-sm text-zinc-500">状態: {project.status}</p>
          </div>
          <div className="flex flex-wrap gap-3 text-sm">
            <Link
              href="/projects"
              className="rounded-2xl border border-zinc-300 bg-white px-4 py-3 font-medium text-zinc-900 transition hover:border-zinc-900"
            >
              一覧へ戻る
            </Link>
            <LogoutButton />
          </div>
        </div>

        <ProjectSegmentWorkspace
          projectId={project.id}
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

        <section className="grid gap-4 rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
          <div>
            <h2 className="text-xl font-semibold text-zinc-950">台本画像</h2>
            <p className="mt-2 text-sm text-zinc-600">アップロード順に表示しています。</p>
          </div>

          {project.sourceImages.length === 0 ? (
            <p className="text-sm text-zinc-500">画像はまだありません。</p>
          ) : (
            <div className={`grid gap-4 ${project.sourceImages.length >= 5 ? 'grid-cols-3' : 'grid-cols-2'}`}>
              {project.sourceImages.map((image) => (
                <div key={image.id} className="flex flex-col items-center gap-2">
                  <img
                    src={`/api/projects/${project.id}/images/${image.id}`}
                    alt={image.originalName}
                    className="w-full h-auto rounded-2xl border border-zinc-200 shadow-sm"
                  />
                  <p className="text-xs text-zinc-500 text-center">{image.originalName}</p>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  )
}
