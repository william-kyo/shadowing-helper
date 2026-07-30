'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { useT } from '@/lib/i18n/client'
import type { Dictionary } from '@/lib/i18n/dictionaries'
import { format } from '@/lib/i18n/format'
import type { WeekdayKey, WeekHeatmapDay } from '@/lib/streak'

const WEEKDAY_LABEL_KEYS: Record<WeekdayKey, keyof Dictionary['home']> = {
  mon: 'weekdayMon',
  tue: 'weekdayTue',
  wed: 'weekdayWed',
  thu: 'weekdayThu',
  fri: 'weekdayFri',
  sat: 'weekdaySat',
  sun: 'weekdaySun',
}

type HomeWeekHeatmapProps = {
  days: WeekHeatmapDay[]
  // How many make-ups the user may still spend this window.
  makeupRemaining: number
  // Whether the user currently has a fully-completed-today segment to pay with.
  makeupSourceAvailable: boolean
}

export function HomeWeekHeatmap({
  days,
  makeupRemaining,
  makeupSourceAvailable,
}: HomeWeekHeatmapProps) {
  const router = useRouter()
  const t = useT()
  const [pendingKey, setPendingKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // A made-up day counts as kept, same as a practiced one.
  const keptCount = days.filter((d) => d.active || d.madeup).length
  const hasEligible = days.some((d) => d.makeupEligible)

  const handleMakeup = async (dateKey: string) => {
    if (pendingKey) return
    setError(null)
    setPendingKey(dateKey)
    try {
      const res = await fetch('/api/streak/makeup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dateKey }),
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(data.error ?? t.home.makeupFailed)
      }
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : t.home.makeupFailed)
    } finally {
      setPendingKey(null)
    }
  }

  return (
    <section
      aria-label={t.home.weekAriaLabel}
      className="grid gap-3 rounded-card border border-ink-line bg-paper p-5"
    >
      <div className="flex items-center justify-between">
        <h2 className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-muted">
          {t.home.weekTitle}
        </h2>
        <span className="font-mono text-xs tabular-nums text-ink-muted">{keptCount} / 7</span>
      </div>
      <ul className="grid grid-cols-7 gap-1.5">
        {days.map((d) => {
          const baseCell =
            'flex aspect-square w-full flex-col items-center justify-center gap-0.5 rounded-inset text-[10px] font-medium transition-colors'
          const todayRing = d.isToday
            ? ' outline outline-2 outline-offset-2 outline-spark'
            : ''
          const isPending = pendingKey === d.dateKey

          const stateClass = d.active
            ? 'bg-accent text-paper'
            : d.madeup
              ? 'bg-accent-soft text-paper'
              : d.isFuture
                ? 'bg-paper-soft/50 text-ink-faint'
                : 'bg-paper-soft text-ink-faint'

          const label = (
            <>
              <span className="font-mono text-[10px] font-semibold tracking-wider">
                {t.home[WEEKDAY_LABEL_KEYS[d.weekdayKey]]}
              </span>
              <span className="text-base leading-none">
                {d.active
                  ? '●'
                  : d.madeup
                    ? t.home.makeupMark
                    : d.makeupEligible
                      ? isPending
                        ? '…'
                        : '＋'
                      : d.isToday
                        ? '·'
                        : ''}
              </span>
            </>
          )

          if (d.makeupEligible) {
            return (
              <li key={d.dateKey}>
                <button
                  type="button"
                  onClick={() => handleMakeup(d.dateKey)}
                  disabled={isPending || Boolean(pendingKey)}
                  aria-label={format(t.home.makeupDayAria, {
                    weekday: t.home[WEEKDAY_LABEL_KEYS[d.weekdayKey]],
                  })}
                  className={`${baseCell} cursor-pointer border-2 border-dashed border-accent/60 bg-accent-faint text-accent-deep hover:bg-accent-faint/60 disabled:cursor-wait${todayRing}`}
                >
                  {label}
                </button>
              </li>
            )
          }

          return (
            <li
              key={d.dateKey}
              aria-label={format(t.home.dayStateAria, {
                weekday: t.home[WEEKDAY_LABEL_KEYS[d.weekdayKey]],
                state:
                  d.active || d.madeup
                    ? t.home.statePracticed
                    : d.isFuture
                      ? t.home.stateFuture
                      : t.home.stateNotPracticed,
              })}
              className={`${baseCell} ${stateClass}${todayRing}`}
            >
              {label}
            </li>
          )
        })}
      </ul>

      {hasEligible && makeupRemaining > 0 ? (
        <p className="text-[11px] leading-relaxed text-ink-muted">
          {makeupSourceAvailable
            ? format(t.home.makeupHintRemaining, { days: makeupRemaining })
            : t.home.makeupHintLocked}
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="text-[11px] leading-relaxed text-accent-deep">
          {error}
        </p>
      ) : null}
    </section>
  )
}
