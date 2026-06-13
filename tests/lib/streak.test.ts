// @vitest-environment node
import { describe, expect, it } from 'vitest'

import {
  buildWeekHeatmap,
  computeCurrentStreak,
  computeLongestStreak,
  countMakeupsInWindow,
  dayDelta,
  growthStage,
  isHabitFormed,
  nextDateKey,
  previousDateKey,
  summarizeStreak,
  toDateKey,
} from '@/lib/streak'

const TZ = 'Asia/Tokyo'

function jstDate(iso: string): Date {
  // Construct a Date that represents the given JST wall-clock time.
  // `2026-05-09T10:00:00+09:00` → equivalent UTC instant.
  return new Date(iso)
}

describe('toDateKey', () => {
  it('formats a date in JST as YYYY-MM-DD', () => {
    expect(toDateKey(jstDate('2026-05-09T10:00:00+09:00'), TZ)).toBe('2026-05-09')
  })

  it('rolls forward across midnight when UTC is still the previous day', () => {
    // JST is +9, so 2026-05-09 22:00 UTC = 2026-05-10 07:00 JST
    expect(toDateKey(new Date('2026-05-09T22:00:00Z'), TZ)).toBe('2026-05-10')
  })
})

describe('previousDateKey / nextDateKey', () => {
  it('handles month boundaries', () => {
    expect(previousDateKey('2026-03-01')).toBe('2026-02-28')
    expect(nextDateKey('2026-02-28')).toBe('2026-03-01')
  })

  it('handles year boundaries', () => {
    expect(previousDateKey('2026-01-01')).toBe('2025-12-31')
    expect(nextDateKey('2025-12-31')).toBe('2026-01-01')
  })
})

describe('computeCurrentStreak', () => {
  const today = jstDate('2026-05-09T10:00:00+09:00') // Saturday in JST

  it('returns 0 when there is no activity at all', () => {
    expect(computeCurrentStreak([], today)).toBe(0)
  })

  it('returns 0 when last activity was 2+ days ago', () => {
    const dates = [jstDate('2026-05-06T10:00:00+09:00')]
    expect(computeCurrentStreak(dates, today)).toBe(0)
  })

  it('counts streak when today has activity', () => {
    const dates = [
      jstDate('2026-05-09T10:00:00+09:00'),
      jstDate('2026-05-08T10:00:00+09:00'),
      jstDate('2026-05-07T10:00:00+09:00'),
    ]
    expect(computeCurrentStreak(dates, today)).toBe(3)
  })

  it('keeps streak alive if yesterday has activity but today does not', () => {
    const dates = [
      jstDate('2026-05-08T10:00:00+09:00'),
      jstDate('2026-05-07T10:00:00+09:00'),
    ]
    expect(computeCurrentStreak(dates, today)).toBe(2)
  })

  it('deduplicates multiple sessions on the same day', () => {
    const dates = [
      jstDate('2026-05-09T08:00:00+09:00'),
      jstDate('2026-05-09T20:00:00+09:00'),
      jstDate('2026-05-08T10:00:00+09:00'),
    ]
    expect(computeCurrentStreak(dates, today)).toBe(2)
  })
})

describe('computeLongestStreak', () => {
  it('returns 0 for empty', () => {
    expect(computeLongestStreak([])).toBe(0)
  })

  it('finds the longest run', () => {
    const dates = [
      // run of 3
      jstDate('2026-04-01T10:00:00+09:00'),
      jstDate('2026-04-02T10:00:00+09:00'),
      jstDate('2026-04-03T10:00:00+09:00'),
      // gap
      // run of 2
      jstDate('2026-04-10T10:00:00+09:00'),
      jstDate('2026-04-11T10:00:00+09:00'),
    ]
    expect(computeLongestStreak(dates)).toBe(3)
  })
})

describe('buildWeekHeatmap', () => {
  it('returns 7 days starting from Monday with today flagged', () => {
    const today = jstDate('2026-05-09T10:00:00+09:00') // Saturday
    const days = buildWeekHeatmap([], today)
    expect(days).toHaveLength(7)
    expect(days[0].weekdayLabel).toBe('月')
    expect(days[6].weekdayLabel).toBe('日')
    const todayCell = days.find((d) => d.isToday)
    expect(todayCell?.weekdayLabel).toBe('土')
    expect(todayCell?.isFuture).toBe(false)
    expect(days[6].isFuture).toBe(true)
  })

  it('marks days with activity as active', () => {
    const today = jstDate('2026-05-09T10:00:00+09:00')
    const days = buildWeekHeatmap(
      [
        jstDate('2026-05-04T10:00:00+09:00'), // Monday
        jstDate('2026-05-09T08:00:00+09:00'), // Saturday today
      ],
      today,
    )
    expect(days[0].active).toBe(true) // Monday
    expect(days[5].active).toBe(true) // Saturday (today)
    expect(days[1].active).toBe(false)
  })
})

describe('dayDelta', () => {
  it('measures whole-day distance and handles month boundaries', () => {
    expect(dayDelta('2026-05-08', '2026-05-09')).toBe(1)
    expect(dayDelta('2026-05-09', '2026-05-09')).toBe(0)
    expect(dayDelta('2026-05-09', '2026-05-08')).toBe(-1)
    expect(dayDelta('2026-02-28', '2026-03-01')).toBe(1)
  })
})

describe('make-up (補卡) streak', () => {
  const today = jstDate('2026-05-09T10:00:00+09:00') // Saturday in JST

  it('bridges a missed day so the streak stays continuous', () => {
    const dates = [
      jstDate('2026-05-09T10:00:00+09:00'), // Sat (today)
      // Fri 2026-05-08 missed
      jstDate('2026-05-07T10:00:00+09:00'), // Thu
      jstDate('2026-05-06T10:00:00+09:00'), // Wed
    ]
    expect(computeCurrentStreak(dates, today)).toBe(1)
    expect(computeCurrentStreak(dates, today, TZ, ['2026-05-08'])).toBe(4)
  })

  it('counts make-ups in longest streak too', () => {
    const dates = [
      jstDate('2026-05-09T10:00:00+09:00'),
      jstDate('2026-05-07T10:00:00+09:00'),
      jstDate('2026-05-06T10:00:00+09:00'),
    ]
    expect(computeLongestStreak(dates, TZ, ['2026-05-08'])).toBe(4)
  })

  it('only counts make-ups inside the 3-day repair window against the cap', () => {
    // delta 1 and 3 are in-window; delta 8 is an old (already-banked) make-up.
    expect(
      countMakeupsInWindow(['2026-05-08', '2026-05-06', '2026-05-01'], today, TZ),
    ).toBe(2)
  })
})

describe('buildWeekHeatmap make-up eligibility', () => {
  const today = jstDate('2026-05-09T10:00:00+09:00') // Saturday

  it('flags a recent missed day as eligible only when budget remains', () => {
    const dates = [jstDate('2026-05-09T08:00:00+09:00')] // only today active
    const eligible = buildWeekHeatmap(dates, today, TZ, { makeupRemaining: 2 })
    const fri = eligible.find((d) => d.dateKey === '2026-05-08')
    expect(fri?.makeupEligible).toBe(true)

    const noBudget = buildWeekHeatmap(dates, today, TZ, { makeupRemaining: 0 })
    expect(noBudget.find((d) => d.dateKey === '2026-05-08')?.makeupEligible).toBe(false)
  })

  it('does not offer days outside the 3-day window, today, or future', () => {
    const dates = [jstDate('2026-05-09T08:00:00+09:00')]
    const days = buildWeekHeatmap(dates, today, TZ, { makeupRemaining: 2 })
    // Mon 2026-05-04 is 5 days back — beyond repair.
    expect(days.find((d) => d.dateKey === '2026-05-04')?.makeupEligible).toBe(false)
    // Today is never a make-up target.
    expect(days.find((d) => d.isToday)?.makeupEligible).toBe(false)
    // Sunday is in the future.
    expect(days.find((d) => d.dateKey === '2026-05-10')?.makeupEligible).toBe(false)
  })

  it('marks made-up days distinctly and not as eligible', () => {
    const dates = [jstDate('2026-05-09T08:00:00+09:00')]
    const days = buildWeekHeatmap(dates, today, TZ, {
      makeupKeys: ['2026-05-08'],
      makeupRemaining: 1,
    })
    const fri = days.find((d) => d.dateKey === '2026-05-08')
    expect(fri?.madeup).toBe(true)
    expect(fri?.makeupEligible).toBe(false)
  })
})

describe('summarizeStreak', () => {
  const today = jstDate('2026-05-09T10:00:00+09:00')

  it('reports counts, used/remaining budget, and a make-up-aware streak', () => {
    const dates = [
      jstDate('2026-05-09T10:00:00+09:00'), // Sat
      jstDate('2026-05-07T10:00:00+09:00'), // Thu
    ]
    const summary = summarizeStreak(dates, ['2026-05-08'], today, TZ)
    expect(summary.makeupUsed).toBe(1)
    expect(summary.makeupRemaining).toBe(1)
    expect(summary.currentStreak).toBe(3) // Sat + made-up Fri + Thu
    expect(summary.heatmap).toHaveLength(7)
  })
})

describe('growthStage and isHabitFormed', () => {
  it('progresses through growth labels', () => {
    expect(growthStage(0).label).toBe('スタート')
    expect(growthStage(3).label).toBe('種まき')
    expect(growthStage(7).label).toBe('芽生え')
    expect(growthStage(14).label).toBe('成長中')
    expect(growthStage(21).label).toBe('習慣')
  })

  it('flags habit formed once 21 days reached', () => {
    expect(isHabitFormed(0, 0)).toBe(false)
    expect(isHabitFormed(20, 20)).toBe(false)
    expect(isHabitFormed(21, 21)).toBe(true)
    expect(isHabitFormed(5, 25)).toBe(true)
  })
})
