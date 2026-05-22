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
        className="rounded-card border border-dashed border-ink-line bg-paper p-6 text-center"
      >
        <p className="text-sm font-medium text-ink-muted">今日の課題はまだありません</p>
        <p className="mt-2 text-xs text-ink-faint">
          プロジェクトを追加して、最初のセグメントを練習しましょう
        </p>
        <Link
          href="/projects"
          className="mt-4 inline-flex items-center justify-center rounded-chip bg-ink px-5 py-2.5 text-sm font-semibold text-paper transition hover:bg-accent"
        >
          プロジェクトを追加 →
        </Link>
      </section>
    )
  }

  const href = `/projects/${segment.projectId}/segments/${segment.id}`
  const stageLabel = `STAGE ${segment.currentStage} / ${segment.totalStages}`
  const heading = hasPracticedToday ? '今日もう一本、いける？' : '今日の練習 · 5分から'
  const ctaLabel = hasPracticedToday ? '続けて練習する' : '練習を始める'
  const pct = Math.round((segment.completedStages / segment.totalStages) * 100)

  return (
    <section
      aria-label="今日のおすすめ"
      className="relative overflow-hidden rounded-card bg-paper-deep p-6 text-paper shadow-[0_18px_50px_-24px_rgba(29,27,24,0.6)]"
    >
      {/* corner mark — like a stamped seal */}
      <span
        aria-hidden
        className="pointer-events-none absolute -right-6 -top-6 grid h-24 w-24 place-items-center rounded-chip border border-accent/40 font-display text-[10px] uppercase tracking-[0.3em] text-accent/70"
      >
        SHADOW
      </span>

      <div className="flex items-center justify-between">
        <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-accent">
          {hasPracticedToday ? '✓ 今日完了' : '今日の続き'}
        </p>
        <span className="rounded-chip border border-paper/15 px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.16em] text-paper/70">
          {stageLabel}
        </span>
      </div>

      <h2 className="mt-3 font-display text-2xl font-semibold leading-tight tracking-tight">
        {heading}
      </h2>

      <div className="mt-5 rounded-inset bg-paper/[0.06] p-4 ring-1 ring-paper/10">
        <p className="truncate font-mono text-[10px] uppercase tracking-[0.18em] text-paper/55">
          {segment.projectTitle}
        </p>
        <p className="mt-1 truncate text-base font-semibold">{segment.segmentTitle}</p>
        <div className="mt-3 flex items-center gap-3">
          <div className="h-1.5 flex-1 overflow-hidden rounded-chip bg-paper/10">
            <div
              className="h-full rounded-chip bg-accent transition-[width] duration-700 ease-out"
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="font-mono text-[11px] tabular-nums text-paper/70">
            {segment.completedStages}/{segment.totalStages}
          </span>
        </div>
      </div>

      <Link
        href={href}
        aria-label={`${segment.segmentTitle} の練習を始める`}
        className="mt-5 flex items-center justify-center gap-2 rounded-chip bg-accent px-5 py-3.5 text-base font-semibold !text-paper transition hover:bg-accent-deep"
      >
        <span aria-hidden>▶</span>
        <span>{ctaLabel}</span>
      </Link>
    </section>
  )
}
