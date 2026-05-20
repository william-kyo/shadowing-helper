export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { redirect } from 'next/navigation'

import { LogoutButton } from '@/components/auth/logout-button'
import { HomeRecentList, type HomeRecentItem } from '@/components/home/home-recent-list'
import { HomeStreakHero } from '@/components/home/home-streak-hero'
import { HomeTodayCard, type HomeTodaySegment } from '@/components/home/home-today-card'
import { HomeWeekHeatmap } from '@/components/home/home-week-heatmap'
import { getCurrentAppUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { measureStep, withPagePerf } from '@/lib/perf'
import { TOTAL_STAGES, computeCurrentStage } from '@/lib/stage-progress'
import {
  buildWeekHeatmap,
  computeCurrentStreak,
  computeLongestStreak,
  toDateKey,
} from '@/lib/streak'

export default async function HomePage() {
  const currentUser = await getCurrentAppUser()
  if (!currentUser) {
    redirect('/login')
  }

  return withPagePerf('/', async () => {
    const progressRows = await measureStep('db.stage_progress.find_for_home', () =>
      db.stageProgress.findMany({
        where: { segment: { project: { userId: currentUser.id } } },
        orderBy: { updatedAt: 'desc' },
        select: { updatedAt: true, segmentId: true },
      }),
    )

    const today = new Date()
    const allActivityDates = progressRows.map((p) => p.updatedAt)
    const currentStreak = computeCurrentStreak(allActivityDates, today)
    const longestStreak = computeLongestStreak(allActivityDates)
    const heatmap = buildWeekHeatmap(allActivityDates, today)

    const todayKey = toDateKey(today)
    const hasPracticedToday = allActivityDates.some((d) => toDateKey(d) === todayKey)

    const recentSegmentIds: string[] = []
    const seenSegments = new Set<string>()
    const lastPracticedBySegment = new Map<string, Date>()
    for (const row of progressRows) {
      if (!lastPracticedBySegment.has(row.segmentId)) {
        lastPracticedBySegment.set(row.segmentId, row.updatedAt)
      }
      if (!seenSegments.has(row.segmentId)) {
        seenSegments.add(row.segmentId)
        recentSegmentIds.push(row.segmentId)
      }
      if (recentSegmentIds.length >= 6) break
    }

    const recentSegmentRecords = recentSegmentIds.length === 0
      ? []
      : await measureStep('db.segments.find_recent_for_home', () =>
          db.segment.findMany({
            where: {
              id: { in: recentSegmentIds },
              project: { userId: currentUser.id },
            },
            include: {
              progress: { select: { stage: true, status: true } },
              project: { select: { id: true, title: true } },
            },
          }),
        )

    const segmentMap = new Map(recentSegmentRecords.map((s) => [s.id, s]))
    const orderedRecent = recentSegmentIds
      .map((id) => segmentMap.get(id))
      .filter((s): s is (typeof recentSegmentRecords)[number] => Boolean(s))

    let todaySegment: HomeTodaySegment | null = null
    const inProgressTarget = orderedRecent.find((s) => {
      const { allCompleted } = computeCurrentStage(
        s.progress.map((p) => ({ stage: p.stage, status: p.status })),
      )
      return !allCompleted
    })

    const buildTodayVm = (s: (typeof recentSegmentRecords)[number]): HomeTodaySegment => {
      const completed = s.progress.filter((p) => p.status === 'completed').length
      const { currentStage } = computeCurrentStage(
        s.progress.map((p) => ({ stage: p.stage, status: p.status })),
      )
      return {
        id: s.id,
        projectId: s.project.id,
        projectTitle: s.project.title,
        segmentTitle: s.title ?? `Segment ${s.index + 1}`,
        currentStage,
        completedStages: completed,
        totalStages: TOTAL_STAGES,
      }
    }

    if (inProgressTarget) {
      todaySegment = buildTodayVm(inProgressTarget)
    } else {
      const fallbackProject = await measureStep('db.project.find_fallback_for_home', () =>
        db.project.findFirst({
          where: { userId: currentUser.id, status: { in: ['ready', 'processed'] } },
          orderBy: { createdAt: 'asc' },
          include: {
            segments: {
              orderBy: { index: 'asc' },
              include: { progress: { select: { stage: true, status: true } } },
            },
          },
        }),
      )
      if (fallbackProject && fallbackProject.segments.length > 0) {
        const next =
          fallbackProject.segments.find((s) => {
            const { allCompleted } = computeCurrentStage(
              s.progress.map((p) => ({ stage: p.stage, status: p.status })),
            )
            return !allCompleted
          }) ?? fallbackProject.segments[0]
        const completed = next.progress.filter((p) => p.status === 'completed').length
        const { currentStage } = computeCurrentStage(
          next.progress.map((p) => ({ stage: p.stage, status: p.status })),
        )
        todaySegment = {
          id: next.id,
          projectId: fallbackProject.id,
          projectTitle: fallbackProject.title,
          segmentTitle: next.title ?? `Segment ${next.index + 1}`,
          currentStage,
          completedStages: completed,
          totalStages: TOTAL_STAGES,
        }
      }
    }

    const recentItems: HomeRecentItem[] = orderedRecent.slice(0, 5).map((s) => {
      const completed = s.progress.filter((p) => p.status === 'completed').length
      return {
        id: s.id,
        projectId: s.project.id,
        projectTitle: s.project.title,
        segmentTitle: s.title ?? `Segment ${s.index + 1}`,
        completedStages: completed,
        totalStages: TOTAL_STAGES,
        lastPracticedAt: lastPracticedBySegment.get(s.id) ?? new Date(),
      }
    })

    return (
      <main className="min-h-screen bg-zinc-50 px-4 py-6 text-zinc-950 sm:px-6 sm:py-10">
        <div className="mx-auto grid max-w-2xl gap-5">
          <header className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-medium text-indigo-600">こんにちは 👋</p>
              <h1 className="truncate text-lg font-semibold tracking-tight">
                {currentUser.email}
              </h1>
            </div>
            <LogoutButton />
          </header>

          <HomeStreakHero
            currentStreak={currentStreak}
            longestStreak={longestStreak}
            hasPracticedToday={hasPracticedToday}
          />

          <HomeTodayCard segment={todaySegment} hasPracticedToday={hasPracticedToday} />

          <HomeRecentList items={recentItems} />

          <HomeWeekHeatmap days={heatmap} />

          <div className="flex justify-center pt-2">
            <Link
              href="/projects"
              className="rounded-2xl border border-zinc-300 bg-white px-5 py-2.5 text-sm font-medium text-zinc-700 transition hover:border-zinc-900 hover:text-zinc-900"
            >
              プロジェクト一覧へ
            </Link>
          </div>
        </div>
      </main>
    )
  })
}
