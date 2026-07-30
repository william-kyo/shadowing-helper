import 'server-only'

import { db } from '@/lib/db'
import { measureStep } from '@/lib/perf'
import { listStorageObjectKeys, removeStorageObjects } from '@/lib/storage'
import { createSupabaseServerClient } from '@/lib/supabase/server'

// Storage removals go out in batches; the API rejects very large key lists.
const REMOVE_BATCH_SIZE = 100

export type DeleteAccountResult = {
  removedStorageObjects: number
  // Storage cleanup is best-effort, so the caller can report a partial sweep
  // without implying the account survived.
  storageFailed: boolean
}

// Delete a learner's account.
//
// Their content goes for real — projects cascade to segments, progress and
// recordings, and every object under their own storage prefix is removed. What
// survives is the User row itself, carrying `deletedAt`: without that tombstone
// the same Supabase identity would simply sign in again and be handed a fresh
// account, and the requirement is that coming back needs the author.
//
// The shared sample audio lives under `examples/`, outside any user's prefix, so
// the sweep below cannot touch it — one account leaving never breaks anyone else's
// seeded sample.
export async function deleteAccount(user: {
  id: string
  supabaseUserId: string
}): Promise<DeleteAccountResult> {
  const supabase = await createSupabaseServerClient()

  // Storage first: while the rows still exist the caller can retry a failed
  // sweep, whereas orphaning files after the rows are gone leaves nothing to
  // find them by.
  let removedStorageObjects = 0
  let storageFailed = false
  try {
    const keys = await measureStep('storage.list_account_objects', () =>
      listStorageObjectKeys({ client: supabase, prefix: user.supabaseUserId }),
    )
    for (let index = 0; index < keys.length; index += REMOVE_BATCH_SIZE) {
      const batch = keys.slice(index, index + REMOVE_BATCH_SIZE)
      await removeStorageObjects({ client: supabase, objectKeys: batch })
      removedStorageObjects += batch.length
    }
  } catch (err) {
    // A stuck file must not block the learner from leaving. Log it and carry on;
    // the row-level delete below is what makes the account gone.
    console.error('[account-deletion] storage sweep failed for user', user.id, err)
    storageFailed = true
  }

  await measureStep('db.account.delete', () =>
    db.$transaction([
      // Cascades to SourceImage, Segment, StageProgress and Recording.
      db.project.deleteMany({ where: { userId: user.id } }),
      db.pushSubscription.deleteMany({ where: { userId: user.id } }),
      db.streakMakeup.deleteMany({ where: { userId: user.id } }),
      // RateLimitHit carries a userId but has no foreign key, so nothing cascades
      // to it — it has to be cleared by hand.
      db.rateLimitHit.deleteMany({ where: { userId: user.id } }),
      db.user.update({
        where: { id: user.id },
        data: { deletedAt: new Date(), habitAchievedAt: null },
      }),
    ]),
  )

  return { removedStorageObjects, storageFailed }
}
