// Shared account constants. Deliberately not in `auth.ts`: that file is
// `'use server'`, where every export has to be an async function.

// Marks a turned-away deleted account, as `/login?error=…` and as the `code` on
// the 403 from API routes.
export const ACCOUNT_DELETED_ERROR = 'account_deleted'

// Where a deleted learner is sent to ask for a new account. Re-registering is
// deliberately manual, so this is the only route back.
export const PROJECT_HOME_URL = 'https://github.com/william-kyo/shadowing-helper'
