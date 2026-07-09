export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { redirect } from 'next/navigation'

import { LogoutButton } from '@/components/auth/logout-button'
import { HomeRecentList, type HomeRecentItem } from '@/components/home/home-recent-list'
import { HomeStreakHero } from '@/components/home/home-streak-hero'
import { HomeTodayCard, type HomeTodaySegment } from '@/components/home/home-today-card'
import { HomeWeekHeatmap } from '@/components/home/home-week-heatmap'
import { PushNotificationCard } from '@/components/push/push-notification-card'
import { getCurrentAppUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { measureStep, withPagePerf } from '@/lib/perf'
import { TOTAL_STAGES, computeCurrentStage } from '@/lib/stage-progress'
import { isHabitFormed, summarizeStreak, toDateKey } from '@/lib/streak'
import { findUnspentTodayFullSegment } from '@/lib/streak-server'

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
        take: 500,
        select: { updatedAt: true, segmentId: true },
      }),
    )

    const today = new Date()
    const allActivityDates = progressRows.map((p) => p.updatedAt)
    const makeupRows = await measureStep('db.streak_makeups.find_for_home', () =>
      db.streakMakeup.findMany({
        where: { userId: currentUser.id },
        select: { dateKey: true },
      }),
    )
    const { currentStreak, longestStreak, heatmap, makeupRemaining } = summarizeStreak(
      allActivityDates,
      makeupRows.map((m) => m.dateKey),
      today,
    )

    // 21-day-challenge success is a one-time achievement: persist it the first
    // time the streak reaches the goal, so the hero keeps showing the streak
    // counter even after the activity evidence behind longestStreak decays.
    let habitAchieved = Boolean(currentUser.habitAchievedAt)
    if (!habitAchieved && isHabitFormed(currentStreak, longestStreak)) {
      habitAchieved = true
      await measureStep('db.user.mark_habit_achieved', () =>
        db.user.update({
          where: { id: currentUser.id },
          data: { habitAchievedAt: today },
        }),
      )
    }

    // Only probe for a funding segment when a repair is actually offerable —
    // it drives the make-up hint shown on eligible days.
    const makeupSourceAvailable =
      makeupRemaining > 0 && heatmap.some((d) => d.makeupEligible)
        ? (await measureStep('db.streak_makeup_source.find_for_home', () =>
            findUnspentTodayFullSegment(currentUser.id, today),
          )) !== null
        : false

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
      if (recentSegmentIds.length >= 10) break
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
        segmentTitle: s.title ?? `セグメント${s.index + 1}`,
        currentStage,
        completedStages: completed,
        totalStages: TOTAL_STAGES,
      }
    }

    if (inProgressTarget) {
      todaySegment = buildTodayVm(inProgressTarget)
    } else {
      // 2. Find the next uncompleted segment within the same recently-practiced project
      const recentProjectIds = [...new Set(orderedRecent.map((s) => s.project.id))]
      if (recentProjectIds.length > 0) {
        const recentProjectsWithSegments = await measureStep(
          'db.project.find_next_in_recent_for_home',
          () =>
            db.project.findMany({
              where: { id: { in: recentProjectIds } },
              include: {
                segments: {
                  orderBy: { index: 'asc' },
                  include: { progress: { select: { stage: true, status: true } } },
                },
              },
            }),
        )
        const projectMap = new Map(recentProjectsWithSegments.map((p) => [p.id, p]))
        for (const recentSeg of orderedRecent) {
          const project = projectMap.get(recentSeg.project.id)
          if (!project) continue
          const nextInProject = project.segments.find((s) => {
            if (s.index <= recentSeg.index) return false
            const { allCompleted } = computeCurrentStage(
              s.progress.map((p) => ({ stage: p.stage, status: p.status })),
            )
            return !allCompleted
          })
          if (nextInProject) {
            const completed = nextInProject.progress.filter((p) => p.status === 'completed').length
            const { currentStage } = computeCurrentStage(
              nextInProject.progress.map((p) => ({ stage: p.stage, status: p.status })),
            )
            todaySegment = {
              id: nextInProject.id,
              projectId: project.id,
              projectTitle: project.title,
              segmentTitle: nextInProject.title ?? `セグメント${nextInProject.index + 1}`,
              currentStage,
              completedStages: completed,
              totalStages: TOTAL_STAGES,
            }
            break
          }
        }
      }

      // 3. Final fallback: earliest created project
      if (!todaySegment) {
        const fallbackProject = await measureStep('db.project.find_fallback_for_home', () =>
          db.project.findFirst({
            where: { userId: currentUser.id, status: { in: ['draft', 'ready', 'processed'] } },
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
            segmentTitle: next.title ?? `セグメント${next.index + 1}`,
            currentStage,
            completedStages: completed,
            totalStages: TOTAL_STAGES,
          }
        }
      }
    }

    const toRecentItem = (s: (typeof orderedRecent)[number]): HomeRecentItem => {
      const completed = s.progress.filter((p) => p.status === 'completed').length
      return {
        id: s.id,
        projectId: s.project.id,
        projectTitle: s.project.title,
        segmentTitle: s.title ?? `セグメント${s.index + 1}`,
        completedStages: completed,
        totalStages: TOTAL_STAGES,
        lastPracticedAt: lastPracticedBySegment.get(s.id) ?? new Date(),
      }
    }

    const recentCompleted = orderedRecent.find((s) => {
      const { allCompleted } = computeCurrentStage(
        s.progress.map((p) => ({ stage: p.stage, status: p.status })),
      )
      return allCompleted
    })

    const recentInProgress = orderedRecent.find((s) => {
      const { allCompleted } = computeCurrentStage(
        s.progress.map((p) => ({ stage: p.stage, status: p.status })),
      )
      return !allCompleted
    })

    const recentItems: HomeRecentItem[] = [
      recentInProgress ? toRecentItem(recentInProgress) : null,
      recentCompleted ? toRecentItem(recentCompleted) : null,
    ].filter((item): item is HomeRecentItem => item !== null).slice(0, 2)

    return (
      <main className="min-h-screen bg-surface px-4 pt-6 pb-28 text-ink sm:px-6 sm:pt-10 sm:pb-32">
        <div className="mx-auto grid max-w-2xl gap-6">
          <header className="flex items-end justify-between gap-3 border-b border-ink-line/70 pb-4">
            <div className="min-w-0">
              <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-accent">
                影 · シャドーイング
              </p>
              <h1 className="mt-1 truncate font-display text-xl font-semibold tracking-tight">
                {currentUser.email}
              </h1>
            </div>
            <LogoutButton />
          </header>

          <HomeStreakHero
            currentStreak={currentStreak}
            longestStreak={longestStreak}
            hasPracticedToday={hasPracticedToday}
            habitAchieved={habitAchieved}
          />

          <HomeTodayCard segment={todaySegment} hasPracticedToday={hasPracticedToday} />

          <HomeRecentList items={recentItems} />

          <HomeWeekHeatmap
            days={heatmap}
            makeupRemaining={makeupRemaining}
            makeupSourceAvailable={makeupSourceAvailable}
          />

          <PushNotificationCard />

          <div className="flex justify-center pt-2">
            <Link
              href="/projects"
              className="rounded-chip border border-ink-line bg-paper px-5 py-2.5 text-sm font-medium text-ink transition hover:border-ink hover:bg-ink hover:text-paper"
            >
              プロジェクト一覧へ
            </Link>
          </div>
        </div>
      </main>
    )
  })
}
