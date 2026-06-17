'use client'

import { useEffect, useRef, useState } from 'react'

import { HABIT_GOAL_DAYS, growthStage } from '@/lib/streak'

type HomeStreakHeroProps = {
  currentStreak: number
  longestStreak: number
  hasPracticedToday: boolean
}

function AnimatedNumber({ value }: { value: number }) {
  const [display, setDisplay] = useState(0)
  const [previousValue, setPreviousValue] = useState(value)
  const rafRef = useRef<number>(0)

  // Reset the display whenever `value` changes (including the 0 transition).
  // Setting state during render is React's recommended pattern for syncing
  // state to a prop change — see
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
  if (previousValue !== value) {
    setPreviousValue(value)
    setDisplay(0)
  }

  useEffect(() => {
    if (value === 0) {
      return
    }

    const duration = 600
    const start = performance.now()

    const step = (now: number) => {
      const elapsed = now - start
      const progress = Math.min(elapsed / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setDisplay(Math.round(eased * value))
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(step)
      }
    }

    rafRef.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(rafRef.current)
  }, [value])

  return <>{display}</>
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
        className={`rounded-card p-6 shadow-[0_1px_0_rgba(29,27,24,0.04),0_18px_40px_-30px_rgba(29,27,24,0.4)] ${
          hasPracticedToday
            ? 'bg-paper-soft ring-2 ring-spark'
            : 'bg-paper ring-1 ring-ink-line'
        }`}
      >
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-muted">
              継続中
            </p>
            <p className="mt-2 flex items-baseline gap-2">
              <span className="animate-streak-in font-display text-6xl font-semibold leading-none tracking-tighter text-accent sm:text-7xl">
                <AnimatedNumber value={currentStreak} />
              </span>
              <span className="text-base font-medium text-ink-muted">日連続</span>
            </p>
            <p className="mt-2 text-sm text-ink-muted">
              最長 {longestStreak} 日 · {label} {emoji}
            </p>
          </div>
          {hasPracticedToday ? (
            <span className="shrink-0 rounded-chip bg-spark px-3 py-1 text-xs font-semibold text-paper">
              ✓ 今日完了
            </span>
          ) : (
            <span className="shrink-0 rounded-chip bg-paper px-3 py-1 text-xs font-semibold text-accent ring-1 ring-accent-soft">
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
      className={`rounded-card p-6 shadow-[0_1px_0_rgba(29,27,24,0.04),0_18px_40px_-30px_rgba(29,27,24,0.4)] ${
        hasPracticedToday
          ? 'bg-paper-soft ring-2 ring-accent'
          : 'bg-paper ring-1 ring-ink-line'
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-muted">
            21日チャレンジ
          </p>
          <p className="mt-2 flex items-baseline gap-2">
            <span className="animate-streak-in font-display text-5xl font-semibold leading-none tracking-tighter text-ink sm:text-6xl">
              <AnimatedNumber value={completed} />日目
            </span>
            <span className="text-base font-medium text-ink-faint">/ {goal}</span>
          </p>
          <p className="mt-2 text-sm text-ink-muted">
            {remaining > 0 ? `あと ${remaining} 日で習慣化 ${emoji}` : `習慣達成おめでとう ${emoji}`}
          </p>
        </div>
        {hasPracticedToday ? (
          <span className="shrink-0 rounded-chip bg-accent px-3 py-1 text-xs font-semibold text-paper">
            ✓ 今日完了
          </span>
        ) : (
          <span className="shrink-0 rounded-chip bg-paper px-3 py-1 text-xs font-semibold text-accent ring-1 ring-accent-soft">
            今日まだ
          </span>
        )}
      </div>

      <div className="mt-6">
        <div
          role="progressbar"
          aria-valuenow={completed}
          aria-valuemin={0}
          aria-valuemax={goal}
          aria-label={`${completed} / ${goal} 日達成`}
          className="h-2 w-full overflow-hidden rounded-chip bg-paper-soft ring-1 ring-ink-line/60"
        >
          <div
            className="h-full rounded-chip bg-accent transition-[width] duration-700 ease-out"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <div className="mt-2 flex justify-between font-mono text-[10px] uppercase tracking-[0.14em] text-ink-faint">
          <span>1日</span>
          <span>7日</span>
          <span>14日</span>
          <span>21日</span>
        </div>
      </div>
    </section>
  )
}
