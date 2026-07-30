'use client'

import { useState } from 'react'

import { ProjectCreateForm } from '@/components/project/project-create-form'
import { useT } from '@/lib/i18n/client'

type ProjectCreateSectionProps = {
  initiallyOpen?: boolean
}

export function ProjectCreateSection({ initiallyOpen = true }: ProjectCreateSectionProps) {
  const t = useT()
  const [isOpen, setIsOpen] = useState(initiallyOpen)

  if (!isOpen) {
    return (
      <div className="flex justify-center pt-2">
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="inline-flex items-center justify-center rounded-chip bg-ink px-6 py-3 text-sm font-semibold text-paper transition hover:bg-accent"
        >
          {t.projects.createButton}
        </button>
      </div>
    )
  }

  return (
    <section className="grid gap-4 rounded-card border border-ink-line bg-paper p-2 sm:p-3">
      <div className="flex flex-wrap items-start justify-between gap-3 px-4 pt-4 sm:px-5">
        <div>
          <h2 className="font-display text-xl font-semibold tracking-tight text-ink">{t.projects.createPanelTitle}</h2>
          <p className="mt-1 text-sm text-ink-muted">
            {t.projects.createPanelBody}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setIsOpen(false)}
          className="rounded-chip border border-ink-line bg-paper px-3 py-1.5 text-sm font-medium text-ink-muted transition hover:border-ink hover:text-ink"
        >
          {t.common.close}
        </button>
      </div>
      <ProjectCreateForm />
    </section>
  )
}
