import Link from 'next/link'

import type { Dictionary } from '@/lib/i18n/dictionaries'

// Shown on the seeded sample's detail page while the learner still owns nothing
// of their own. Audio belongs to a project in this model, so "upload my own
// audio" means creating a project — which happens back on the list page, hence
// the link rather than an inline form.
export function SampleProjectBanner({ t }: { t: Dictionary }) {
  return (
    <section
      data-tour="sample-project-banner"
      className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-accent-soft bg-accent-faint px-5 py-4"
    >
      <div className="min-w-0">
        <p className="font-display text-base font-semibold tracking-tight text-accent-deep">
          {t.tour.sampleProjectTitle}
        </p>
        <p className="mt-1 text-sm leading-relaxed text-ink-muted">
          {t.tour.sampleProjectBody}
        </p>
      </div>
      <Link
        href="/projects"
        className="shrink-0 rounded-chip bg-accent px-4 py-2.5 text-sm font-semibold text-paper transition hover:bg-accent-deep"
      >
        {t.projects.createButton}
      </Link>
    </section>
  )
}
