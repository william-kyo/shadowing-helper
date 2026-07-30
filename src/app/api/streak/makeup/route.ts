import { NextResponse } from 'next/server'
import { z } from 'zod'

import { requireAppUserForApi } from '@/lib/auth'
import { redeemMakeup, type RedeemMakeupResult } from '@/lib/streak-server'
import type { Dictionary } from '@/lib/i18n/dictionaries'
import { getRequestT } from '@/lib/i18n/server'

const makeupSchema = z.object({
  dateKey: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})

// Human-facing message + HTTP status for each rejection reason. Built per request
// so the message follows the caller's language.
const buildErrorResponses = (
  t: Dictionary,
): Record<
  Exclude<RedeemMakeupResult, { ok: true }>['code'],
  { status: number; message: string }
> => ({
  invalid_date: { status: 400, message: t.errors.dateFormatInvalid },
  not_past: { status: 400, message: t.errors.makeupPastOnly },
  too_old: { status: 400, message: t.errors.makeupWindowPassed },
  already_active: { status: 409, message: t.errors.makeupAlreadyPracticed },
  already_madeup: { status: 409, message: t.errors.makeupAlreadyDone },
  cap_reached: { status: 409, message: t.errors.makeupLimit },
  no_source: {
    status: 409,
    message: t.errors.makeupRequiresToday,
  },
})

export async function POST(request: Request) {
  const t = getRequestT(request)

  const { user, response } = await requireAppUserForApi()
  if (response || !user) {
    return response
  }

  const json = await request.json().catch(() => null)
  const parsed = makeupSchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json({ error: t.errors.dateFormatInvalid }, { status: 400 })
  }

  const result = await redeemMakeup(user.id, parsed.data.dateKey, new Date())
  if (!result.ok) {
    const { status, message } = buildErrorResponses(t)[result.code]
    return NextResponse.json({ error: message }, { status })
  }

  return NextResponse.json(result.summary)
}
