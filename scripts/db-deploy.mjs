// Sync the production Postgres schema as part of the deploy build.
//
// This runs inside `npm run build`, right before `next build`, so a schema
// change can never ship ahead of its database columns again. It is guarded to
// real production deploys: local builds and Vercel preview builds skip it and
// never touch the production database.
//
// `prisma db push` is intentionally run WITHOUT `--accept-data-loss`: additive
// changes apply automatically, while destructive ones abort the build so they
// can be handled by hand instead of silently dropping data.
//
// Connection: Supabase exposes three endpoints and only one works here:
//   - direct (db.<ref>.supabase.co:5432) — IPv6-only, unreachable from Vercel
//     build containers (P1001).
//   - transaction pooler (…pooler.supabase.com:6543, pgbouncer) — used by the
//     app at runtime, but can't run DDL.
//   - session pooler (…pooler.supabase.com:5432) — IPv4 and DDL-capable.
// So we derive the session-pooler URL from DATABASE_URL (the runtime pooler
// connection) and hand that to db push, regardless of how DIRECT_URL is set.

import { execFileSync } from 'node:child_process'

const vercelEnv = process.env.VERCEL_ENV

if (vercelEnv !== 'production') {
  console.log(
    `[db-deploy] VERCEL_ENV=${vercelEnv ?? '(unset)'} — skipping db push (production builds only).`,
  )
  process.exit(0)
}

// Turn a Supabase transaction-pooler URL into its session-pooler equivalent
// (same host/credentials, port 5432, no pgbouncer flag). Non-pooler URLs are
// returned unchanged.
function toSessionPoolerUrl(raw) {
  try {
    const url = new URL(raw)
    if (!url.hostname.includes('pooler.supabase.com')) return raw
    url.port = '5432'
    url.searchParams.delete('pgbouncer')
    return url.toString()
  } catch {
    return raw
  }
}

// An explicit override wins; otherwise derive from the runtime DATABASE_URL.
const source = process.env.MIGRATE_DATABASE_URL || process.env.DATABASE_URL
if (!source) {
  console.error('[db-deploy] Neither MIGRATE_DATABASE_URL nor DATABASE_URL is set; cannot sync schema.')
  process.exit(1)
}
const migrateUrl = process.env.MIGRATE_DATABASE_URL || toSessionPoolerUrl(source)

console.log('[db-deploy] Production build — syncing database schema with `prisma db push`…')
execFileSync(
  'npx',
  ['prisma', 'db', 'push', '--schema', 'prisma/schema.prisma', '--skip-generate'],
  {
    stdio: 'inherit',
    // db push connects via the schema's `directUrl`; point both at the
    // session-pooler URL so it never falls back to the IPv6 direct endpoint.
    env: { ...process.env, DIRECT_URL: migrateUrl, DATABASE_URL: migrateUrl },
  },
)
console.log('[db-deploy] Database schema is in sync.')
