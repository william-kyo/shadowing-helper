// Server-side Web Push orchestration: VAPID configuration and the daily
// "you haven't practiced today" reminder fan-out, triggered by a Supabase
// pg_cron job hitting /api/cron/notify.

import 'server-only'

import webpush from 'web-push'

import { db } from '@/lib/db'
import { env } from '@/lib/env'
import { DEFAULT_LOCALE } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { DEFAULT_TIME_ZONE, toDateKey } from '@/lib/streak'

let vapidConfigured = false

// Configure web-push once per serverless instance. Returns false (feature
// disabled) when the VAPID key pair is not present in the environment.
export function ensureWebPushConfigured(): boolean {
  if (vapidConfigured) return true
  const publicKey = env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const privateKey = env.VAPID_PRIVATE_KEY
  if (!publicKey || !privateKey) return false
  webpush.setVapidDetails(env.VAPID_SUBJECT ?? 'mailto:admin@localhost', publicKey, privateKey)
  vapidConfigured = true
  return true
}

// The JST start of the day containing `now`, as a UTC instant — same day
// convention as the streak logic (streak-server.ts dayBounds).
function jstDayStart(now: Date, tz: string = DEFAULT_TIME_ZONE): Date {
  return new Date(`${toDateKey(now, tz)}T00:00:00+09:00`)
}

export type SubscriptionRecord = {
  id: string
  userId: string
  endpoint: string
  p256dh: string
  auth: string
}

// All push subscriptions belonging to users with no stage-progress activity
// today (JST) — the same "practiced today" definition the home page uses.
export async function findSubscriptionsNeedingReminder(now: Date): Promise<SubscriptionRecord[]> {
  const subscriptions = await db.pushSubscription.findMany({
    select: { id: true, userId: true, endpoint: true, p256dh: true, auth: true },
  })
  if (subscriptions.length === 0) return []

  const userIds = [...new Set(subscriptions.map((s) => s.userId))]
  const activeRows = await db.stageProgress.findMany({
    where: {
      updatedAt: { gte: jstDayStart(now) },
      segment: { project: { userId: { in: userIds } } },
    },
    select: { segment: { select: { project: { select: { userId: true } } } } },
  })
  const activeUserIds = new Set(
    activeRows
      .map((r) => r.segment.project.userId)
      .filter((id): id is string => id !== null),
  )

  return subscriptions.filter((s) => !activeUserIds.has(s.userId))
}

export type ReminderStats = {
  subscriptions: number
  sent: number
  failed: number
  removed: number
}

// Reminders are sent from cron, which has no request and therefore no locale
// cookie to read, so they go out in the default language. Following each user's
// picker choice here would mean persisting it on the User row; until then the
// copy at least lives in the dictionary with everything else.
const REMINDER_PAYLOAD = JSON.stringify({
  title: getDictionary(DEFAULT_LOCALE).push.reminderTitle,
  body: getDictionary(DEFAULT_LOCALE).push.reminderBody,
  url: '/',
})

// Send the daily reminder to every subscription whose user has not practiced
// today. Subscriptions the push service reports as gone (404/410) are deleted.
export async function sendDailyReminders(now: Date): Promise<ReminderStats> {
  const targets = await findSubscriptionsNeedingReminder(now)
  const stats: ReminderStats = { subscriptions: targets.length, sent: 0, failed: 0, removed: 0 }

  await Promise.all(
    targets.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          REMINDER_PAYLOAD,
          { TTL: 6 * 60 * 60 },
        )
        stats.sent += 1
      } catch (err) {
        const statusCode = (err as { statusCode?: number }).statusCode
        if (statusCode === 404 || statusCode === 410) {
          // The browser dropped this subscription — clean it up.
          await db.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {})
          stats.removed += 1
        } else {
          stats.failed += 1
          console.error('[push] send failed', { endpoint: sub.endpoint.slice(0, 60), statusCode })
        }
      }
    }),
  )

  return stats
}
