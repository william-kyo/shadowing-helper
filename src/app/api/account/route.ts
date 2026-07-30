import { NextResponse } from 'next/server'

import { deleteAccount } from '@/lib/account-deletion'
import { requireAppUserForApi } from '@/lib/auth'
import { getRequestT } from '@/lib/i18n/server'
import { measureStep, withApiPerf } from '@/lib/perf'

export async function DELETE(request: Request) {
  return withApiPerf('/api/account', request, async () => {
    const t = getRequestT(request)

    const { user, response } = await measureStep('auth.require_api_user', () =>
      requireAppUserForApi(),
    )
    if (response || !user) {
      return response
    }

    try {
      const result = await deleteAccount(user)
      // `storageFailed` is reported rather than raised: the account is gone
      // either way, and refusing here would leave the learner unable to leave
      // because of a stuck file.
      return NextResponse.json({ success: true, ...result })
    } catch (err) {
      console.error('[account] deletion failed for user', user.id, err)
      return NextResponse.json({ error: t.account.deleteFailed }, { status: 500 })
    }
  })
}
