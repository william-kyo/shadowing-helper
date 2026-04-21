export const dynamic = 'force-dynamic'

import Link from 'next/link'

import { db } from '@/lib/db'

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

        {projects.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-zinc-300 bg-white p-8 text-sm leading-7 text-zinc-600">
            まだプロジェクトがありません。トップページから音声と台本画像をアップロードしてください。
          </div>
        ) : (
          <div className="grid gap-4">
            {projects.map((project) => (
              <Link key={project.id} href={`/projects/${project.id}`} className="block">
                <article className="rounded-3xl border border-black/5 bg-white p-6 shadow-sm transition hover:border-zinc-900/20 hover:shadow-md">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="grid gap-2">
                      <h2 className="text-xl font-semibold">{project.title}</h2>
                      <p className="text-sm text-zinc-500">
                        音声: {project.audioOriginalName} / 画像: {project.sourceImages.length} 枚
                      </p>
                    </div>
                    <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium uppercase tracking-wide text-zinc-600">
                      {project.status}
                    </span>
                  </div>
                  <dl className="mt-5 grid gap-3 text-sm text-zinc-600 sm:grid-cols-3">
                    <div>
                      <dt className="font-medium text-zinc-900">作成日</dt>
                      <dd>{project.createdAt.toLocaleString()}</dd>
                    </div>
                    <div>
                      <dt className="font-medium text-zinc-900">抽出テキスト</dt>
                      <dd>{project.rawExtractedText ? 'あり' : '未処理'}</dd>
                    </div>
                    <div>
                      <dt className="font-medium text-zinc-900">次フェーズ</dt>
                      <dd>OCR / 段落分割 / 学習画面</dd>
                    </div>
                  </dl>
                </article>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
