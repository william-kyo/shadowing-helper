import { HABIT_GOAL_DAYS, growthStage } from '@/lib/streak'

type HomeStreakHeroProps = {
  currentStreak: number
  longestStreak: number
  hasPracticedToday: boolean
}

export function HomeStreakHero({
  currentStreak,
  longestStreak,
  hasPracticedToday,
}: HomeStreakHeroProps) {
  const isHabitPhase = currentStreak >= HABIT_GOAL_DAYS || longestStreak >= HABIT_GOAL_DAYS
  const { emoji, label } = growthStage(currentStreak)

  if (isHabitPhase) {
    return (
      <section
        aria-label="現在の継続日数"
        className="rounded-3xl bg-gradient-to-br from-amber-50 via-orange-50 to-rose-50 p-6 shadow-sm ring-1 ring-amber-100"
      >
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-medium text-orange-700">継続中</p>
            <p className="mt-1 flex items-baseline gap-2">
              <span className="text-5xl font-bold tracking-tight text-orange-600">
                🔥 {currentStreak}
              </span>
              <span className="text-base font-medium text-orange-700">日</span>
            </p>
            <p className="mt-2 text-sm text-orange-700/80">
              最長記録 {longestStreak} 日 · {label} {emoji}
            </p>
          </div>
          {hasPracticedToday ? (
            <span className="shrink-0 rounded-full bg-orange-100 px-3 py-1 text-xs font-semibold text-orange-700">
              ✓ 今日完了
            </span>
          ) : (
            <span className="shrink-0 rounded-full bg-white px-3 py-1 text-xs font-semibold text-orange-600 ring-1 ring-orange-200">
              今日まだ
            </span>
          )}
        </div>
      </section>
    )
  }

  const goal = HABIT_GOAL_DAYS
  const completed = Math.min(currentStreak, goal)
  const remaining = Math.max(goal - completed, 0)
  const progressPct = Math.round((completed / goal) * 100)

  return (
    <section
      aria-label="習慣化チャレンジ"
      className="rounded-3xl bg-gradient-to-br from-emerald-50 via-teal-50 to-sky-50 p-6 shadow-sm ring-1 ring-emerald-100"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-emerald-700">21日チャレンジ</p>
          <p className="mt-1 flex items-baseline gap-2">
            <span className="text-4xl font-bold tracking-tight text-emerald-700">
              {emoji} Day {completed}
            </span>
            <span className="text-base font-medium text-emerald-700/70">/ {goal}</span>
          </p>
          <p className="mt-1 text-sm text-emerald-800/80">
            {remaining > 0 ? `あと ${remaining} 日で習慣化` : '習慣達成おめでとう！'}
          </p>
        </div>
        {hasPracticedToday ? (
          <span className="shrink-0 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
            ✓ 今日完了
          </span>
        ) : (
          <span className="shrink-0 rounded-full bg-white px-3 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">
            今日まだ
          </span>
        )}
      </div>

      <div className="mt-5">
        <div
          role="progressbar"
          aria-valuenow={completed}
          aria-valuemin={0}
          aria-valuemax={goal}
          aria-label={`${completed} / ${goal} 日達成`}
          className="h-3 w-full overflow-hidden rounded-full bg-white/60 ring-1 ring-emerald-100"
        >
          <div
            className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-teal-500 transition-all"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <div className="mt-2 flex justify-between text-[11px] font-medium text-emerald-700/70">
          <span>Day 1</span>
          <span>Day 7 🌱</span>
          <span>Day 14 🌿</span>
          <span>Day 21 🌳</span>
        </div>
      </div>
    </section>
  )
}
