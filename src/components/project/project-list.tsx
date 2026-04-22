'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

type Project = {
  id: string
  title: string
  audioOriginalName: string
  sourceImages: { id: string }[]
  status: string
  createdAt: Date
  rawExtractedText: string | null
}

async function deleteProject(projectId: string): Promise<{ success: boolean; error?: string }> {
  const res = await fetch(`/api/projects/${projectId}`, { method: 'DELETE' })
  if (!res.ok) {
    const data = await res.json()
    return { success: false, error: data.error ?? '削除に失敗しました。' }
  }
  return { success: true }
}

type ProjectCardProps = {
  project: Project
}

export function ProjectCard({ project }: ProjectCardProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [isDeleting, setIsDeleting] = useState(false)
  const projectHref = `/projects/${project.id}`

  function handleDelete() {
    if (!confirm(`「${project.title}」を削除しますか？音声・画像・セグメントもすべて削除されます。`)) {
      return
    }
    setIsDeleting(true)
    startTransition(async () => {
      const result = await deleteProject(project.id)
      setIsDeleting(false)
      if (result.success) {
        router.refresh()
      } else {
        alert(result.error)
      }
    })
  }

  return (
    <article className="relative rounded-3xl border border-black/5 bg-white p-6 shadow-sm transition hover:border-zinc-900/20 hover:shadow-md">
      <Link
        href={projectHref}
        aria-label={`${project.title} の詳細を開く`}
        className="absolute inset-0 rounded-3xl"
      />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="grid gap-2">
          <h2 className="text-xl font-semibold">{project.title}</h2>
          <p className="text-sm text-zinc-500">
            音声: {project.audioOriginalName} / 画像: {project.sourceImages.length} 枚
          </p>
        </div>
        <div className="relative z-10 flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium uppercase tracking-wide text-zinc-600">
            {project.status}
          </span>
          <Link
            href={projectHref}
            className="rounded-2xl border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 transition hover:border-zinc-900 hover:text-zinc-900"
          >
            詳細
          </Link>
          <button
            onClick={handleDelete}
            disabled={isPending || isDeleting}
            className="rounded-2xl border border-red-200 bg-white px-3 py-1.5 text-sm font-medium text-red-600 transition hover:border-red-400 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isDeleting ? '削除中...' : '削除'}
          </button>
        </div>
      </div>
      <dl className="mt-5 grid gap-3 text-sm text-zinc-600 sm:grid-cols-3">
        <div>
          <dt className="font-medium text-zinc-900">作成日</dt>
          <dd>{new Date(project.createdAt).toLocaleString()}</dd>
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
  )
}

type ProjectListProps = {
  projects: Project[]
}

export function ProjectList({ projects }: ProjectListProps) {
  if (projects.length === 0) {
    return (
      <div className="rounded-3xl border border-dashed border-zinc-300 bg-white p-8 text-sm leading-7 text-zinc-600">
        まだプロジェクトがありません。トップページから音声と台本画像をアップロードしてください。
      </div>
    )
  }

  return (
    <div className="grid gap-4">
      {projects.map((project) => (
        <ProjectCard key={project.id} project={project} />
      ))}
    </div>
  )
}
