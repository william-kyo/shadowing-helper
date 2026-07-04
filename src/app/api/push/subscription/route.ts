import { NextResponse } from 'next/server'
import { z } from 'zod'

import { requireAppUserForApi } from '@/lib/auth'
import { db } from '@/lib/db'

// Browser push-service endpoints are always HTTPS URLs.
const endpointSchema = z
  .url()
  .max(2048)
  .refine((u) => u.startsWith('https://'), 'endpoint must be https')

const subscribeSchema = z.object({
  endpoint: endpointSchema,
  keys: z.object({
    p256dh: z.string().min(1).max(512),
    auth: z.string().min(1).max(512),
  }),
})

const unsubscribeSchema = z.object({
  endpoint: endpointSchema,
})

export async function POST(request: Request) {
  const { user, response } = await requireAppUserForApi()
  if (response || !user) {
    return response
  }

  const json = await request.json().catch(() => null)
  const parsed = subscribeSchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json({ error: '購読情報の形式が正しくありません。' }, { status: 400 })
  }

  const { endpoint, keys } = parsed.data
  const userAgent = request.headers.get('user-agent')?.slice(0, 255) ?? null

  // The endpoint identifies the browser installation. Upsert so re-subscribing
  // (or a different account on the same browser) replaces the old owner/keys.
  await db.pushSubscription.upsert({
    where: { endpoint },
    update: { userId: user.id, p256dh: keys.p256dh, auth: keys.auth, userAgent },
    create: { userId: user.id, endpoint, p256dh: keys.p256dh, auth: keys.auth, userAgent },
  })

  return NextResponse.json({ ok: true })
}

export async function DELETE(request: Request) {
  const { user, response } = await requireAppUserForApi()
  if (response || !user) {
    return response
  }

  const json = await request.json().catch(() => null)
  const parsed = unsubscribeSchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json({ error: '購読情報の形式が正しくありません。' }, { status: 400 })
  }

  await db.pushSubscription.deleteMany({
    where: { endpoint: parsed.data.endpoint, userId: user.id },
  })

  return NextResponse.json({ ok: true })
}
