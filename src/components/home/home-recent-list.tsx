import Link from 'next/link'

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
}

function formatRelative(date: Date, now: Date = new Date()): string {
  const diffMs = now.getTime() - date.getTime()
  const minutes = Math.floor(diffMs / (60 * 1000))
  if (minutes < 1) return 'たった今'
  if (minutes < 60) return `${minutes}分前`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}時間前`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}日前`
  return new Intl.DateTimeFormat('ja-JP', { month: 'short', day: 'numeric' }).format(date)
}

export function HomeRecentList({ items }: HomeRecentListProps) {
  if (items.length === 0) return null

  return (
    <section aria-label="最近の練習" className="grid gap-3">
      <div className="flex items-center justify-between">
        <h2 className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-muted">
          最近の練習 · recent
        </h2>
        <Link
          href="/projects"
          className="text-xs font-medium text-accent transition hover:text-accent-deep"
        >
          すべて見る →
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
                      {formatRelative(item.lastPracticedAt)}
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
