export const dynamic = 'force-dynamic'

import Link from 'next/link'

import { db } from '@/lib/db'
import { ProjectList } from '@/components/project/project-list'

export default async function ProjectsPage() {
  const projects = await db.project.findMany({
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
          </div>
          <Link
            href="/"
            className="rounded-2xl border border-zinc-300 bg-white px-4 py-3 text-sm font-medium transition hover:border-zinc-900"
          >
            新しいプロジェクトを作成
          </Link>
        </div>

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
      </div>
    </main>
  )
}
