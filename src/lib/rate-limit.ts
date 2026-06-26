import { NextResponse } from 'next/server'

import { db } from '@/lib/db'

// Per-user sliding-window rate limiting for the expensive endpoints (Groq STT +
// ffmpeg). DB-backed (RateLimitHit table) so the limit holds across serverless
// instances, where an in-memory counter would not. There is a small
// count-then-insert race under heavy concurrency that can let a couple of extra
// calls through — acceptable for cost/abuse control.

export type RateLimitBucket =
  | 'project_create'
  | 'transcribe'
  | 'resplit'
  | 'auto_segment'
  | 'stage4_recording'

type RateLimitRule = { limit: number; windowMs: number }

const MINUTE = 60_000
const HOUR = 60 * MINUTE

// Tuned so a human practising/uploading never hits them, while a scripted loop
// is stopped well before it runs up Groq cost or pins the CPU on ffmpeg.
const RULES: Record<RateLimitBucket, RateLimitRule> = {
  project_create: { limit: 15, windowMs: HOUR },
  transcribe: { limit: 60, windowMs: HOUR },
  resplit: { limit: 30, windowMs: HOUR },
  auto_segment: { limit: 30, windowMs: HOUR },
  // Each recording scores one take via Groq; a learner does a handful per
  // sentence, never dozens per minute.
  stage4_recording: { limit: 40, windowMs: MINUTE },
}

export type RateLimitResult = {
  allowed: boolean
  remaining: number
  retryAfterSeconds: number
}

export async function enforceRateLimit(
  userId: string,
  bucket: RateLimitBucket,
): Promise<RateLimitResult> {
  const rule = RULES[bucket]
  const since = new Date(Date.now() - rule.windowMs)

  // One query gives both the in-window count and the oldest hit (for Retry-After).
  const recent = await db.rateLimitHit.findMany({
    where: { userId, bucket, createdAt: { gte: since } },
    orderBy: { createdAt: 'asc' },
    select: { createdAt: true },
  })

  if (recent.length >= rule.limit) {
    const oldest = recent[0]!.createdAt.getTime()
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((oldest + rule.windowMs - Date.now()) / 1000),
    )
    return { allowed: false, remaining: 0, retryAfterSeconds }
  }

  await db.rateLimitHit.create({ data: { userId, bucket } })
  // Best-effort prune of this user's expired rows so the table can't grow
  // without bound — no cron required.
  void db.rateLimitHit
    .deleteMany({ where: { userId, bucket, createdAt: { lt: since } } })
    .catch(() => {})

  return { allowed: true, remaining: rule.limit - recent.length - 1, retryAfterSeconds: 0 }
}

// Returns a 429 NextResponse when the caller is over the limit, or null when the
// call is allowed. Routes use: `const r = await rateLimitResponseOrNull(...); if (r) return r`.
export async function rateLimitResponseOrNull(
  userId: string,
  bucket: RateLimitBucket,
): Promise<NextResponse | null> {
  const result = await enforceRateLimit(userId, bucket)
  if (result.allowed) return null
  return NextResponse.json(
    { error: '操作が多すぎます。しばらく待ってから再度お試しください。', code: 'rate_limited' },
    { status: 429, headers: { 'Retry-After': String(result.retryAfterSeconds) } },
  )
}
