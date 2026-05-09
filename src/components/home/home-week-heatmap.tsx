import type { WeekHeatmapDay } from '@/lib/streak'

type HomeWeekHeatmapProps = {
  days: WeekHeatmapDay[]
}

export function HomeWeekHeatmap({ days }: HomeWeekHeatmapProps) {
  const activeCount = days.filter((d) => d.active).length

  return (
    <section aria-label="今週の記録" className="grid gap-3 rounded-2xl border border-zinc-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-zinc-800">今週の記録</h2>
        <span className="text-xs font-medium text-zinc-500">{activeCount} / 7 日</span>
      </div>
      <ul className="grid grid-cols-7 gap-1.5">
        {days.map((d) => {
          const baseCell =
            'flex aspect-square flex-col items-center justify-center gap-0.5 rounded-xl text-[10px] font-medium'
          const stateClass = d.active
            ? 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200'
            : d.isFuture
              ? 'bg-zinc-50 text-zinc-300'
              : 'bg-zinc-100 text-zinc-400'
          const todayRing = d.isToday ? ' outline outline-2 outline-offset-1 outline-indigo-500' : ''
          return (
            <li
              key={d.dateKey}
              aria-label={`${d.weekdayLabel}曜日 ${d.active ? '練習済' : d.isFuture ? '未来' : '未練習'}`}
              className={`${baseCell} ${stateClass}${todayRing}`}
            >
              <span className="text-[11px] font-semibold">{d.weekdayLabel}</span>
              <span className="text-base leading-none">
                {d.active ? '✓' : d.isToday ? '·' : ''}
              </span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
