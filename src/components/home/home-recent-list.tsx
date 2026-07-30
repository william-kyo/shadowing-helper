import Link from 'next/link'

import { LOCALE_BCP47, type Locale } from '@/lib/i18n/config'
import type { Dictionary } from '@/lib/i18n/dictionaries'
import { format } from '@/lib/i18n/format'

export type HomeRecentItem = {
  id: string
  projectId: string
  projectTitle: string
  segmentTitle: string
  completedStages: number
  totalStages: number
  lastPracticedAt: Date
}

type HomeRecentListProps = {
  items: HomeRecentItem[]
  t: Dictionary
  locale: Locale
}

function formatRelative(
  date: Date,
  t: Dictionary,
  locale: Locale,
  now: Date = new Date(),
): string {
  const diffMs = now.getTime() - date.getTime()
  const minutes = Math.floor(diffMs / (60 * 1000))
  if (minutes < 1) return t.home.justNow
  if (minutes < 60) return format(t.home.minutesAgo, { n: minutes })
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return format(t.home.hoursAgo, { n: hours })
  const days = Math.floor(hours / 24)
  if (days < 7) return format(t.home.daysAgo, { n: days })
  return new Intl.DateTimeFormat(LOCALE_BCP47[locale], {
    month: 'short',
    day: 'numeric',
  }).format(date)
}

export function HomeRecentList({ items, t, locale }: HomeRecentListProps) {
  if (items.length === 0) return null

  return (
    <section aria-label={t.home.recentAriaLabel} className="grid gap-3">
      <div className="flex items-center justify-between">
        <h2 className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-muted">
          {t.home.recentTitle}
        </h2>
        <Link
          href="/projects"
          className="text-xs font-medium text-accent transition hover:text-accent-deep"
        >
          {t.home.seeAll}
        </Link>
      </div>
      <ul className="divide-y divide-ink-line/60 overflow-hidden rounded-card border border-ink-line bg-paper">
        {items.map((item) => {
          const href = `/projects/${item.projectId}/segments/${item.id}`
          const pct = Math.round((item.completedStages / item.totalStages) * 100)
          return (
            <li key={item.id}>
              <Link
                href={href}
                className="flex items-center gap-3 px-4 py-3.5 transition hover:bg-paper-soft"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-inset bg-accent-faint font-display text-base font-semibold text-accent">
                  ♪
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink">
                    {item.segmentTitle}
                  </p>
                  <p className="truncate text-xs text-ink-muted">
                    {item.projectTitle} ·{' '}
                    <span suppressHydrationWarning>
                      {formatRelative(item.lastPracticedAt, t, locale)}
                    </span>
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className="font-mono text-[10px] tabular-nums text-ink-faint">
                    {item.completedStages}/{item.totalStages}
                  </span>
                  <div className="h-1 w-12 overflow-hidden rounded-chip bg-paper-soft">
                    <div
                      className="h-full rounded-chip bg-accent"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
                <span className="text-ink-faint">›</span>
              </Link>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
