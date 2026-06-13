// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const stageProgressFindMany = vi.fn()
const segmentFindMany = vi.fn()
const streakMakeupFindMany = vi.fn()
const streakMakeupCreate = vi.fn()

vi.mock('@/lib/db', () => ({
  db: {
    stageProgress: { findMany: (...args: unknown[]) => stageProgressFindMany(...args) },
    segment: { findMany: (...args: unknown[]) => segmentFindMany(...args) },
    streakMakeup: {
      findMany: (...args: unknown[]) => streakMakeupFindMany(...args),
      create: (...args: unknown[]) => streakMakeupCreate(...args),
    },
  },
}))

import { redeemMakeup } from '@/lib/streak-server'

const TZ = 'Asia/Tokyo'
const TODAY = new Date('2026-05-09T10:00:00+09:00') // Saturday JST

const fullyCompletedSegment = (id: string) => ({
  id,
  progress: [1, 2, 3, 4, 5].map((stage) => ({ stage, status: 'completed' })),
})

beforeEach(() => {
  vi.clearAllMocks()
  // Defaults: today is active, no existing make-ups, one fully-completed
  // segment available today to fund a repair.
  stageProgressFindMany.mockResolvedValue([
    { updatedAt: new Date('2026-05-09T09:00:00+09:00'), segmentId: 'seg-today' },
  ])
  streakMakeupFindMany.mockResolvedValue([])
  segmentFindMany.mockResolvedValue([fullyCompletedSegment('seg-today')])
  streakMakeupCreate.mockResolvedValue({ id: 'mk-1' })
})

afterEach(() => vi.restoreAllMocks())

describe('redeemMakeup', () => {
  it('rejects a malformed date', async () => {
    const r = await redeemMakeup('user-1', '2026/05/08', TODAY, TZ)
    expect(r).toEqual({ ok: false, code: 'invalid_date' })
  })

  it('rejects today or a future day', async () => {
    expect(await redeemMakeup('user-1', '2026-05-09', TODAY, TZ)).toEqual({
      ok: false,
      code: 'not_past',
    })
    expect(await redeemMakeup('user-1', '2026-05-10', TODAY, TZ)).toEqual({
      ok: false,
      code: 'not_past',
    })
  })

  it('rejects a day older than the 3-day repair window', async () => {
    const r = await redeemMakeup('user-1', '2026-05-05', TODAY, TZ) // 4 days back
    expect(r).toEqual({ ok: false, code: 'too_old' })
  })

  it('rejects a day that is already active', async () => {
    stageProgressFindMany.mockResolvedValue([
      { updatedAt: new Date('2026-05-08T09:00:00+09:00'), segmentId: 'seg-x' },
    ])
    const r = await redeemMakeup('user-1', '2026-05-08', TODAY, TZ)
    expect(r).toEqual({ ok: false, code: 'already_active' })
  })

  it('rejects a day already made up', async () => {
    streakMakeupFindMany.mockResolvedValue([{ dateKey: '2026-05-08', sourceSegmentId: 's' }])
    const r = await redeemMakeup('user-1', '2026-05-08', TODAY, TZ)
    expect(r).toEqual({ ok: false, code: 'already_madeup' })
  })

  it('rejects once the 2-make-up cap is reached', async () => {
    streakMakeupFindMany.mockResolvedValue([
      { dateKey: '2026-05-06', sourceSegmentId: 'a' },
      { dateKey: '2026-05-07', sourceSegmentId: 'b' },
    ])
    const r = await redeemMakeup('user-1', '2026-05-08', TODAY, TZ)
    expect(r).toEqual({ ok: false, code: 'cap_reached' })
  })

  it('rejects when no full-segment-today is available to pay with', async () => {
    // Nothing completed today.
    stageProgressFindMany.mockResolvedValue([])
    const r = await redeemMakeup('user-1', '2026-05-08', TODAY, TZ)
    expect(r).toEqual({ ok: false, code: 'no_source' })
  })

  it('rejects when the only completed-today segment is not fully completed', async () => {
    segmentFindMany.mockResolvedValue([
      { id: 'seg-today', progress: [{ stage: 1, status: 'completed' }] },
    ])
    const r = await redeemMakeup('user-1', '2026-05-08', TODAY, TZ)
    expect(r).toEqual({ ok: false, code: 'no_source' })
  })

  it('creates a make-up spending the fully-completed segment and returns a summary', async () => {
    const r = await redeemMakeup('user-1', '2026-05-08', TODAY, TZ)
    expect(r.ok).toBe(true)
    expect(streakMakeupCreate).toHaveBeenCalledWith({
      data: { userId: 'user-1', dateKey: '2026-05-08', sourceSegmentId: 'seg-today' },
    })
    if (r.ok) {
      expect(r.summary.heatmap).toHaveLength(7)
    }
  })
})
