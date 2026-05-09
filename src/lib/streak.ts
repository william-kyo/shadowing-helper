export const DEFAULT_TIME_ZONE = 'Asia/Tokyo'
export const HABIT_GOAL_DAYS = 21

export function toDateKey(date: Date, timeZone: string = DEFAULT_TIME_ZONE): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
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

function buildDateKeySet(activityDates: Iterable<Date>, timeZone: string): Set<string> {
  const set = new Set<string>()
  for (const d of activityDates) {
    set.add(toDateKey(d, timeZone))
  }
  return set
}

export function computeCurrentStreak(
  activityDates: Iterable<Date>,
  today: Date,
  timeZone: string = DEFAULT_TIME_ZONE,
): number {
  const set = buildDateKeySet(activityDates, timeZone)
  const todayKey = toDateKey(today, timeZone)

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
  timeZone: string = DEFAULT_TIME_ZONE,
): number {
  const set = buildDateKeySet(activityDates, timeZone)
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

function weekdayIndex(date: Date, timeZone: string): number {
  const short = new Intl.DateTimeFormat('en-US', {
    timeZone,
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
  isToday: boolean
  isFuture: boolean
}

export function buildWeekHeatmap(
  activityDates: Iterable<Date>,
  today: Date,
  timeZone: string = DEFAULT_TIME_ZONE,
): WeekHeatmapDay[] {
  const set = buildDateKeySet(activityDates, timeZone)
  const todayKey = toDateKey(today, timeZone)
  const todayIdx = weekdayIndex(today, timeZone)
  const mondayKey = shiftDateKey(todayKey, -todayIdx)

  const result: WeekHeatmapDay[] = []
  for (let i = 0; i < 7; i += 1) {
    const dateKey = shiftDateKey(mondayKey, i)
    result.push({
      dateKey,
      weekdayLabel: WEEKDAY_LABELS_JA[i],
      active: set.has(dateKey),
      isToday: dateKey === todayKey,
      isFuture: i > todayIdx,
    })
  }
  return result
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
