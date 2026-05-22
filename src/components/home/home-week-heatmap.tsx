import type { WeekHeatmapDay } from '@/lib/streak'

type HomeWeekHeatmapProps = {
  days: WeekHeatmapDay[]
}

export function HomeWeekHeatmap({ days }: HomeWeekHeatmapProps) {
  const activeCount = days.filter((d) => d.active).length

  return (
    <section
      aria-label="今週の記録"
      className="grid gap-3 rounded-card border border-ink-line bg-paper p-5"
    >
      <div className="flex items-center justify-between">
        <h2 className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-muted">
          今週の記録 · this week
        </h2>
        <span className="font-mono text-xs tabular-nums text-ink-muted">
          {activeCount} / 7
        </span>
      </div>
      <ul className="grid grid-cols-7 gap-1.5">
        {days.map((d) => {
          const baseCell =
            'flex aspect-square flex-col items-center justify-center gap-0.5 rounded-inset text-[10px] font-medium'
          const stateClass = d.active
            ? 'bg-accent text-paper'
            : d.isFuture
              ? 'bg-paper-soft/50 text-ink-faint'
              : 'bg-paper-soft text-ink-faint'
          const todayRing = d.isToday
            ? ' outline outline-2 outline-offset-2 outline-accent'
            : ''
          return (
            <li
              key={d.dateKey}
              aria-label={`${d.weekdayLabel}曜日 ${d.active ? '練習済' : d.isFuture ? '未来' : '未練習'}`}
              className={`${baseCell} ${stateClass}${todayRing}`}
            >
              <span className="font-mono text-[10px] font-semibold tracking-wider">
                {d.weekdayLabel}
              </span>
              <span className="text-base leading-none">
                {d.active ? '●' : d.isToday ? '·' : ''}
              </span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
