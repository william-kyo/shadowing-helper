// Server-side orchestration shared by the home page (server prefetch) and the
// make-up API. Centralizing the DB wiring keeps the make-up rules from drifting
// between the two callers.

import { Prisma } from '@prisma/client'

import { db } from '@/lib/db'
import { TOTAL_STAGES } from '@/lib/stage-progress'
import {
  DEFAULT_TIME_ZONE,
  MAX_GAP_DAYS,
  MAX_MAKEUP_DAYS,
  countMakeupsInWindow,
  dayDelta,
  summarizeStreak,
  toDateKey,
  type StreakSummary,
} from '@/lib/streak'

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export type StreakActivity = {
  activityDates: Date[]
  makeupKeys: string[]
}

// Load the raw inputs a streak view needs: the user's stage-progress activity
// timestamps and their existing make-up day keys.
export async function loadStreakActivity(userId: string): Promise<StreakActivity> {
  const [progressRows, makeups] = await Promise.all([
    db.stageProgress.findMany({
      where: { segment: { project: { userId } } },
      orderBy: { updatedAt: 'desc' },
      take: 500,
      select: { updatedAt: true },
    }),
    db.streakMakeup.findMany({ where: { userId }, select: { dateKey: true } }),
  ])
  return {
    activityDates: progressRows.map((p) => p.updatedAt),
    makeupKeys: makeups.map((m) => m.dateKey),
  }
}

// The JST day boundaries [start, end) for a given date key, as UTC instants.
function dayBounds(dateKey: string): { start: Date; end: Date } {
  const start = new Date(`${dateKey}T00:00:00+09:00`)
  const end = new Date(start.getTime() + 86_400_000)
  return { start, end }
}

// Find one segment the user fully completed (all stages) today that hasn't
// already funded a make-up. Returns its id, or null when no such segment
// exists — i.e. the user hasn't done the extra full-segment task required.
export async function findUnspentTodayFullSegment(
  userId: string,
  today: Date,
  tz: string = DEFAULT_TIME_ZONE,
): Promise<string | null> {
  const todayKey = toDateKey(today, tz)
  const { start, end } = dayBounds(todayKey)

  const completedTodayRows = await db.stageProgress.findMany({
    where: {
      status: 'completed',
      completedAt: { gte: start, lt: end },
      segment: { project: { userId } },
    },
    select: { segmentId: true },
  })
  const candidateIds = [...new Set(completedTodayRows.map((r) => r.segmentId))]
  if (candidateIds.length === 0) return null

  const usedRows = await db.streakMakeup.findMany({
    where: { userId },
    select: { sourceSegmentId: true },
  })
  const usedIds = new Set(usedRows.map((r) => r.sourceSegmentId))

  const freeCandidateIds = candidateIds.filter((id) => !usedIds.has(id))
  if (freeCandidateIds.length === 0) return null

  // Confirm each candidate is actually fully completed (all stages), not just
  // touched today.
  const segments = await db.segment.findMany({
    where: { id: { in: freeCandidateIds } },
    select: { id: true, progress: { select: { stage: true, status: true } } },
  })
  for (const segment of segments) {
    const completedStages = new Set(
      segment.progress.filter((p) => p.status === 'completed').map((p) => p.stage),
    )
    const allCompleted = Array.from({ length: TOTAL_STAGES }, (_, i) => i + 1).every((s) =>
      completedStages.has(s),
    )
    if (allCompleted) return segment.id
  }
  return null
}

export type RedeemMakeupResult =
  | { ok: true; summary: StreakSummary }
  | {
      ok: false
      code:
        | 'invalid_date'
        | 'not_past'
        | 'too_old'
        | 'already_active'
        | 'already_madeup'
        | 'cap_reached'
        | 'no_source'
    }

// Validate and persist a make-up for `dateKey`, spending one full-segment
// completion done today. Pure rule checks live in `@/lib/streak`; this wires
// them to the database.
export async function redeemMakeup(
  userId: string,
  dateKey: string,
  today: Date,
  tz: string = DEFAULT_TIME_ZONE,
): Promise<RedeemMakeupResult> {
  if (!DATE_KEY_PATTERN.test(dateKey)) return { ok: false, code: 'invalid_date' }

  const todayKey = toDateKey(today, tz)
  const delta = dayDelta(dateKey, todayKey)
  if (delta < 1) return { ok: false, code: 'not_past' }
  if (delta > MAX_GAP_DAYS) return { ok: false, code: 'too_old' }

  const { activityDates, makeupKeys } = await loadStreakActivity(userId)
  const activeKeys = new Set(activityDates.map((d) => toDateKey(d, tz)))
  if (activeKeys.has(dateKey)) return { ok: false, code: 'already_active' }
  if (makeupKeys.includes(dateKey)) return { ok: false, code: 'already_madeup' }
  if (countMakeupsInWindow(makeupKeys, today, tz) >= MAX_MAKEUP_DAYS) {
    return { ok: false, code: 'cap_reached' }
  }

  const sourceSegmentId = await findUnspentTodayFullSegment(userId, today, tz)
  if (!sourceSegmentId) return { ok: false, code: 'no_source' }

  try {
    await db.streakMakeup.create({ data: { userId, dateKey, sourceSegmentId } })
  } catch (err) {
    // Lost a race on one of the unique constraints (userId+dateKey or
    // userId+sourceSegmentId). Re-resolve below from current state.
    if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')) {
      throw err
    }
    if (!makeupKeys.includes(dateKey)) {
      // The segment was spent on a different day by a concurrent request.
      return { ok: false, code: 'no_source' }
    }
  }

  const refreshed = await loadStreakActivity(userId)
  return {
    ok: true,
    summary: summarizeStreak(refreshed.activityDates, refreshed.makeupKeys, today, tz),
  }
}
