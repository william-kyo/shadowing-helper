'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

type SegmentSummary = {
  progress: { stage: number; status: string }[]
}

type Project = {
  id: string
  title: string
  audioOriginalName: string
  status: string
  sourceImages: { id: string }[]
  createdAt: Date
  segments: SegmentSummary[]
}

function computeProjectStatus(project: Project): {
  label: string
  detail: string
  color: 'gray' | 'indigo' | 'green' | 'yellow'
} {
  if (project.status === 'segmenting') {
    return { label: '分割中', detail: 'AI が音声を処理中...', color: 'yellow' }
  }

  if (project.status === 'failed') {
    return { label: '失敗', detail: '分割処理に失敗しました', color: 'gray' }
  }

  if (project.segments.length === 0) {
    return { label: '未着手', detail: 'セグメントなし', color: 'gray' }
  }

  const completedCount = project.segments.filter((s) =>
    [1, 2, 3, 4, 5].every((stage) =>
      s.progress.some((p) => p.stage === stage && p.status === 'completed'),
    ),
  ).length

  if (completedCount === project.segments.length) {
    return { label: '完了', detail: `${project.segments.length} / ${project.segments.length} 完了`, color: 'green' }
  }

  return {
    label: '進行中',
    detail: `${completedCount} / ${project.segments.length} 完了`,
    color: 'indigo',
  }
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

const statusStyles = {
  gray: 'bg-paper-soft text-ink-muted',
  indigo: 'bg-accent-faint text-accent-deep',
  green: 'bg-ink text-paper',
  yellow: 'bg-accent-soft text-accent-deep',
}

export function ProjectCard({ project }: ProjectCardProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [isDeleting, setIsDeleting] = useState(false)
  const projectHref = `/projects/${project.id}`
  const { label, detail, color } = computeProjectStatus(project)

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
    <article className="relative rounded-card border border-ink-line bg-paper p-6 shadow-[0_1px_0_rgba(29,27,24,0.03),0_18px_40px_-30px_rgba(29,27,24,0.4)] transition hover:border-ink hover:shadow-[0_1px_0_rgba(29,27,24,0.06),0_20px_44px_-26px_rgba(29,27,24,0.5)]">
      <Link
        href={projectHref}
        aria-label={`${project.title} の詳細を開く`}
        className="absolute inset-0 rounded-card"
      />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="grid gap-2">
          <h2 className="font-display text-2xl font-semibold tracking-tight">
            {project.title}
          </h2>
          <p className="text-sm text-ink-muted">
            音声: {project.audioOriginalName} · 画像: {project.sourceImages.length} 枚
          </p>
        </div>
        <div className="relative z-10 flex flex-wrap items-center gap-2">
          <span className={`rounded-chip px-3 py-1 font-mono text-[10px] uppercase tracking-[0.16em] ${statusStyles[color]}`}>
            {label}
          </span>
          <Link
            href={projectHref}
            className="rounded-chip border border-ink-line bg-paper px-3 py-1.5 text-sm font-medium text-ink-muted transition hover:border-ink hover:text-ink"
          >
            詳細
          </Link>
          <button
            onClick={handleDelete}
            disabled={isPending || isDeleting}
            className="rounded-chip border border-accent-soft bg-paper px-3 py-1.5 text-sm font-medium text-accent transition hover:border-accent hover:bg-accent-faint disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isDeleting ? '削除中...' : '削除'}
          </button>
        </div>
      </div>
      <dl className="mt-5 grid gap-3 text-sm text-ink-muted sm:grid-cols-2">
        <div>
          <dt className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-faint">
            作成日
          </dt>
          <dd className="mt-1 text-ink" suppressHydrationWarning>
            {new Date(project.createdAt).toLocaleString('ja-JP')}
          </dd>
        </div>
        <div>
          <dt className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-faint">
            進捗
          </dt>
          <dd className="mt-1 text-ink">{detail}</dd>
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
      <div className="rounded-card border border-dashed border-ink-line bg-paper p-8 text-sm leading-7 text-ink-muted">
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
