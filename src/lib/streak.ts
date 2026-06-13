export const DEFAULT_TIME_ZONE = 'Asia/Tokyo'
export const HABIT_GOAL_DAYS = 21

// Streak make-up (補卡) rules:
// - A missed past day can be repaired by spending a segment fully completed
//   today, which makes that day count toward the streak again.
// - Only the last MAX_GAP_DAYS days are repairable; a missed day older than
//   that is beyond reach (a gap of >3 unrepaired days resets the streak).
// - At most MAX_MAKEUP_DAYS make-ups may prop up the current break window.
export const MAX_MAKEUP_DAYS = 2
export const MAX_GAP_DAYS = 3

export function toDateKey(date: Date, tz: string = DEFAULT_TIME_ZONE): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')}`
}

function shiftDateKey(key: string, offsetDays: number): string {
  const [y, m, d] = key.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + offsetDays)
  const yy = dt.getUTCFullYear()
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(dt.getUTCDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

export function previousDateKey(key: string): string {
  return shiftDateKey(key, -1)
}

export function nextDateKey(key: string): string {
  return shiftDateKey(key, 1)
}

// Whole-day distance from `fromKey` to `toKey` (positive when toKey is later).
export function dayDelta(fromKey: string, toKey: string): number {
  const parse = (key: string) => {
    const [y, m, d] = key.split('-').map(Number)
    return Date.UTC(y, m - 1, d)
  }
  return Math.round((parse(toKey) - parse(fromKey)) / 86_400_000)
}

function buildDateKeySet(activityDates: Iterable<Date>, tz: string): Set<string> {
  const set = new Set<string>()
  for (const d of activityDates) {
    set.add(toDateKey(d, tz))
  }
  return set
}

export function computeCurrentStreak(
  activityDates: Iterable<Date>,
  today: Date,
  tz: string = DEFAULT_TIME_ZONE,
  makeupKeys: Iterable<string> = [],
): number {
  const set = buildDateKeySet(activityDates, tz)
  for (const key of makeupKeys) set.add(key)
  const todayKey = toDateKey(today, tz)

  let cursor = todayKey
  if (!set.has(cursor)) {
    cursor = previousDateKey(cursor)
    if (!set.has(cursor)) return 0
  }

  let streak = 0
  while (set.has(cursor)) {
    streak += 1
    cursor = previousDateKey(cursor)
  }
  return streak
}

export function computeLongestStreak(
  activityDates: Iterable<Date>,
  tz: string = DEFAULT_TIME_ZONE,
  makeupKeys: Iterable<string> = [],
): number {
  const set = buildDateKeySet(activityDates, tz)
  for (const key of makeupKeys) set.add(key)
  if (set.size === 0) return 0

  const sorted = Array.from(set).sort()
  let longest = 1
  let current = 1
  for (let i = 1; i < sorted.length; i += 1) {
    if (previousDateKey(sorted[i]) === sorted[i - 1]) {
      current += 1
    } else {
      current = 1
    }
    if (current > longest) longest = current
  }
  return longest
}

const WEEKDAY_LABELS_JA = ['月', '火', '水', '木', '金', '土', '日']
const WEEKDAY_INDEX_FROM_SHORT: Record<string, number> = {
  Mon: 0,
  Tue: 1,
  Wed: 2,
  Thu: 3,
  Fri: 4,
  Sat: 5,
  Sun: 6,
}

function weekdayIndex(date: Date, tz: string): number {
  const short = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    weekday: 'short',
  })
    .formatToParts(date)
    .find((p) => p.type === 'weekday')?.value
  return WEEKDAY_INDEX_FROM_SHORT[short ?? 'Mon'] ?? 0
}

export type WeekHeatmapDay = {
  dateKey: string
  weekdayLabel: string
  active: boolean
  // Repaired via a make-up (補卡) — counts toward the streak but is rendered
  // distinctly from a normally-practiced day.
  madeup: boolean
  // A missed day the user can still repair right now (within the repair window
  // and under the make-up cap).
  makeupEligible: boolean
  isToday: boolean
  isFuture: boolean
}

type BuildWeekHeatmapOptions = {
  makeupKeys?: Iterable<string>
  // How many make-ups the user may still spend (0 disables eligibility).
  makeupRemaining?: number
}

// A missed day is repairable iff it is in the past, within MAX_GAP_DAYS of
// today, and not already active or made up.
export function isMakeupEligibleDay(
  dateKey: string,
  todayKey: string,
  active: boolean,
  madeup: boolean,
): boolean {
  if (active || madeup) return false
  const delta = dayDelta(dateKey, todayKey)
  return delta >= 1 && delta <= MAX_GAP_DAYS
}

export function buildWeekHeatmap(
  activityDates: Iterable<Date>,
  today: Date,
  tz: string = DEFAULT_TIME_ZONE,
  options: BuildWeekHeatmapOptions = {},
): WeekHeatmapDay[] {
  const set = buildDateKeySet(activityDates, tz)
  const makeupSet = new Set(options.makeupKeys ?? [])
  const makeupRemaining = options.makeupRemaining ?? 0
  const todayKey = toDateKey(today, tz)
  const todayIdx = weekdayIndex(today, tz)
  const mondayKey = shiftDateKey(todayKey, -todayIdx)

  const result: WeekHeatmapDay[] = []
  for (let i = 0; i < 7; i += 1) {
    const dateKey = shiftDateKey(mondayKey, i)
    const active = set.has(dateKey)
    const madeup = makeupSet.has(dateKey)
    const eligible =
      makeupRemaining > 0 && isMakeupEligibleDay(dateKey, todayKey, active, madeup)
    result.push({
      dateKey,
      weekdayLabel: WEEKDAY_LABELS_JA[i],
      active,
      madeup,
      makeupEligible: eligible,
      isToday: dateKey === todayKey,
      isFuture: i > todayIdx,
    })
  }
  return result
}

export type StreakSummary = {
  currentStreak: number
  longestStreak: number
  makeupUsed: number
  makeupRemaining: number
  heatmap: WeekHeatmapDay[]
}

// Count make-ups that fall inside the current repair window (the last
// MAX_GAP_DAYS days). Older make-ups no longer count against the cap.
export function countMakeupsInWindow(
  makeupKeys: Iterable<string>,
  today: Date,
  tz: string = DEFAULT_TIME_ZONE,
): number {
  const todayKey = toDateKey(today, tz)
  let count = 0
  for (const key of makeupKeys) {
    const delta = dayDelta(key, todayKey)
    if (delta >= 1 && delta <= MAX_GAP_DAYS) count += 1
  }
  return count
}

// One-stop streak view (counts + heatmap) shared by the home page and the
// make-up API so they never drift on the rules.
export function summarizeStreak(
  activityDates: Iterable<Date>,
  makeupKeys: Iterable<string>,
  today: Date,
  tz: string = DEFAULT_TIME_ZONE,
): StreakSummary {
  const makeupArray = Array.from(makeupKeys)
  const makeupUsed = countMakeupsInWindow(makeupArray, today, tz)
  const makeupRemaining = Math.max(0, MAX_MAKEUP_DAYS - makeupUsed)
  return {
    currentStreak: computeCurrentStreak(activityDates, today, tz, makeupArray),
    longestStreak: computeLongestStreak(activityDates, tz, makeupArray),
    makeupUsed,
    makeupRemaining,
    heatmap: buildWeekHeatmap(activityDates, today, tz, {
      makeupKeys: makeupArray,
      makeupRemaining,
    }),
  }
}

export function isHabitFormed(currentStreak: number, longestStreak: number): boolean {
  return currentStreak >= HABIT_GOAL_DAYS || longestStreak >= HABIT_GOAL_DAYS
}

export function growthStage(currentStreak: number): {
  emoji: string
  label: string
} {
  if (currentStreak >= 21) return { emoji: '🌳', label: '習慣' }
  if (currentStreak >= 14) return { emoji: '🌿', label: '成長中' }
  if (currentStreak >= 7) return { emoji: '🌱', label: '芽生え' }
  if (currentStreak >= 1) return { emoji: '🌰', label: '種まき' }
  return { emoji: '✨', label: 'スタート' }
}
