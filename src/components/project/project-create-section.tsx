'use client'

import { useState } from 'react'

import { ProjectCreateForm } from '@/components/project/project-create-form'

type ProjectCreateSectionProps = {
  initiallyOpen?: boolean
}

export function ProjectCreateSection({ initiallyOpen = true }: ProjectCreateSectionProps) {
  const [isOpen, setIsOpen] = useState(initiallyOpen)

  if (!isOpen) {
    return (
      <div className="flex justify-center pt-2">
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="inline-flex items-center justify-center rounded-chip bg-ink px-6 py-3 text-sm font-semibold text-paper transition hover:bg-accent"
        >
          プロジェクトを作成
        </button>
      </div>
    )
  }

  return (
    <section className="grid gap-4 rounded-card border border-ink-line bg-paper p-2 sm:p-3">
      <div className="flex flex-wrap items-start justify-between gap-3 px-4 pt-4 sm:px-5">
        <div>
          <h2 className="font-display text-xl font-semibold tracking-tight text-ink">新しいプロジェクトを作成</h2>
          <p className="mt-1 text-sm text-ink-muted">
            ログイン中のユーザーに紐づく音声と台本画像を登録します。
          </p>
        </div>
        <button
          type="button"
          onClick={() => setIsOpen(false)}
          className="rounded-chip border border-ink-line bg-paper px-3 py-1.5 text-sm font-medium text-ink-muted transition hover:border-ink hover:text-ink"
        >
          閉じる
        </button>
      </div>
      <ProjectCreateForm />
    </section>
  )
}
