import { timingSafeEqual } from 'node:crypto'

import { NextResponse } from 'next/server'

import { env } from '@/lib/env'
import { ensureWebPushConfigured, sendDailyReminders } from '@/lib/push-server'

// Called by the Supabase pg_cron job (via pg_net) every day at 22:00 JST.
// Authenticated with a shared Bearer secret instead of a session cookie, so
// the proxy exempts this path from cookie auth.

function secretMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

export async function POST(request: Request) {
  const secret = env.CRON_SECRET
  if (!secret || !ensureWebPushConfigured()) {
    return NextResponse.json({ error: 'push is not configured' }, { status: 503 })
  }

  const authHeader = request.headers.get('authorization') ?? ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  if (!token || !secretMatches(token, secret)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const stats = await sendDailyReminders(new Date())
  return NextResponse.json(stats)
}
