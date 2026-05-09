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
        <h2 className="text-sm font-semibold text-zinc-800">最近の練習</h2>
        <Link href="/projects" className="text-xs font-medium text-indigo-600 hover:text-indigo-700">
          すべて見る →
        </Link>
      </div>
      <ul className="divide-y divide-zinc-100 overflow-hidden rounded-2xl border border-zinc-200 bg-white">
        {items.map((item) => {
          const href = `/projects/${item.projectId}/segments/${item.id}`
          const pct = Math.round((item.completedStages / item.totalStages) * 100)
          return (
            <li key={item.id}>
              <Link
                href={href}
                className="flex items-center gap-3 px-4 py-3 transition hover:bg-zinc-50"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                  🎧
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-zinc-900">
                    {item.segmentTitle}
                  </p>
                  <p className="truncate text-xs text-zinc-500">
                    {item.projectTitle} · <span suppressHydrationWarning>{formatRelative(item.lastPracticedAt)}</span>
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className="text-[11px] font-medium text-zinc-500">
                    {item.completedStages}/{item.totalStages}
                  </span>
                  <div className="h-1 w-12 overflow-hidden rounded-full bg-zinc-100">
                    <div
                      className="h-full rounded-full bg-indigo-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
                <span className="text-zinc-300">›</span>
              </Link>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
