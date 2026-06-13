import { NextResponse } from 'next/server'
import { z } from 'zod'

import { requireAppUserForApi } from '@/lib/auth'
import { redeemMakeup, type RedeemMakeupResult } from '@/lib/streak-server'

const makeupSchema = z.object({
  dateKey: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})

// Human-facing message + HTTP status for each rejection reason.
const ERROR_RESPONSES: Record<
  Exclude<RedeemMakeupResult, { ok: true }>['code'],
  { status: number; message: string }
> = {
  invalid_date: { status: 400, message: '日付の形式が正しくありません。' },
  not_past: { status: 400, message: '補完できるのは過去の日付のみです。' },
  too_old: { status: 400, message: '補完できる期間（3日以内）を過ぎています。' },
  already_active: { status: 409, message: 'その日はすでに練習済みです。' },
  already_madeup: { status: 409, message: 'その日はすでに補完済みです。' },
  cap_reached: { status: 409, message: '補完できるのは最大2日までです。' },
  no_source: {
    status: 409,
    message: '補完には、今日フルセグメント（5ステージ）を完了してください。',
  },
}

export async function POST(request: Request) {
  const { user, response } = await requireAppUserForApi()
  if (response || !user) {
    return response
  }

  const json = await request.json().catch(() => null)
  const parsed = makeupSchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json({ error: '日付の形式が正しくありません。' }, { status: 400 })
  }

  const result = await redeemMakeup(user.id, parsed.data.dateKey, new Date())
  if (!result.ok) {
    const { status, message } = ERROR_RESPONSES[result.code]
    return NextResponse.json({ error: message }, { status })
  }

  return NextResponse.json(result.summary)
}
