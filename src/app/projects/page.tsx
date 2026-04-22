export const dynamic = 'force-dynamic'

import { LogoutButton } from '@/components/auth/logout-button'
import { ProjectCreateForm } from '@/components/project/project-create-form'
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

        <section className="grid gap-4 rounded-3xl border border-black/5 bg-white/60 p-2 sm:p-3">
          <div className="px-4 pt-4 sm:px-5">
            <h2 className="text-lg font-semibold tracking-tight">新しいプロジェクトを作成</h2>
            <p className="mt-1 text-sm text-zinc-500">
              ログイン中のユーザーに紐づく音声と台本画像を登録します。
            </p>
          </div>
          <ProjectCreateForm />
        </section>

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
