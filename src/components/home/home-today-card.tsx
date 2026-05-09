import Link from 'next/link'

export type HomeTodaySegment = {
  id: string
  projectId: string
  projectTitle: string
  segmentTitle: string
  currentStage: number
  completedStages: number
  totalStages: number
}

type HomeTodayCardProps = {
  segment: HomeTodaySegment | null
  hasPracticedToday: boolean
}

export function HomeTodayCard({ segment, hasPracticedToday }: HomeTodayCardProps) {
  if (!segment) {
    return (
      <section
        aria-label="今日のおすすめ"
        className="rounded-3xl border border-dashed border-zinc-300 bg-white p-6 text-center"
      >
        <p className="text-sm font-medium text-zinc-500">今日の課題はまだありません</p>
        <p className="mt-2 text-xs text-zinc-400">
          プロジェクトを追加して、最初のセグメントを練習しましょう
        </p>
        <Link
          href="/projects"
          className="mt-4 inline-flex items-center justify-center rounded-2xl bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-700"
        >
          プロジェクトを追加 →
        </Link>
      </section>
    )
  }

  const href = `/projects/${segment.projectId}/segments/${segment.id}`
  const stageLabel = `ステージ ${segment.currentStage} / ${segment.totalStages}`
  const heading = hasPracticedToday ? '今日もう一本、いける？' : '今日の練習 · 5分から'
  const ctaLabel = hasPracticedToday ? '続けて練習する' : '練習を始める'

  return (
    <section aria-label="今日のおすすめ" className="rounded-3xl bg-zinc-900 p-6 text-white shadow-md">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-widest text-indigo-300">
          {hasPracticedToday ? '✓ 今日完了' : '📍 今日の続き'}
        </p>
        <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-[11px] font-medium text-white/80">
          {stageLabel}
        </span>
      </div>

      <h2 className="mt-3 text-lg font-semibold leading-tight">
        {heading}
      </h2>

      <div className="mt-4 rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
        <p className="truncate text-xs font-medium text-white/60">{segment.projectTitle}</p>
        <p className="mt-1 truncate text-base font-semibold">{segment.segmentTitle}</p>
        <div className="mt-3 flex items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-gradient-to-r from-indigo-400 to-fuchsia-400"
              style={{
                width: `${Math.round(
                  (segment.completedStages / segment.totalStages) * 100,
                )}%`,
              }}
            />
          </div>
          <span className="text-[11px] font-medium text-white/70">
            {segment.completedStages}/{segment.totalStages}
          </span>
        </div>
      </div>

      <Link
        href={href}
        aria-label={`${segment.segmentTitle} の練習を始める`}
        className="mt-5 flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-indigo-500 to-fuchsia-500 px-5 py-3.5 text-base font-semibold !text-white shadow-lg shadow-indigo-500/30 transition hover:from-indigo-400 hover:to-fuchsia-400"
      >
        <span aria-hidden>▶</span>
        <span>{ctaLabel}</span>
      </Link>
    </section>
  )
}
