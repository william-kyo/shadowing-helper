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
          className="inline-flex items-center justify-center rounded-2xl bg-zinc-950 px-6 py-3 text-sm font-medium text-white transition hover:bg-zinc-800"
        >
          プロジェクトを作成
        </button>
      </div>
    )
  }

  return (
    <section className="grid gap-4 rounded-3xl border border-black/5 bg-white/60 p-2 sm:p-3">
      <div className="flex flex-wrap items-start justify-between gap-3 px-4 pt-4 sm:px-5">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">新しいプロジェクトを作成</h2>
          <p className="mt-1 text-sm text-zinc-500">
            ログイン中のユーザーに紐づく音声と台本画像を登録します。
          </p>
        </div>
        <button
          type="button"
          onClick={() => setIsOpen(false)}
          className="rounded-2xl border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 transition hover:border-zinc-900 hover:text-zinc-900"
        >
          閉じる
        </button>
      </div>
      <ProjectCreateForm />
    </section>
  )
}
