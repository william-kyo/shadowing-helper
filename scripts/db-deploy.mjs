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

import { execFileSync } from 'node:child_process'

const vercelEnv = process.env.VERCEL_ENV

if (vercelEnv !== 'production') {
  console.log(
    `[db-deploy] VERCEL_ENV=${vercelEnv ?? '(unset)'} — skipping db push (production builds only).`,
  )
  process.exit(0)
}

// db push talks to the database through the schema's `directUrl` (DIRECT_URL),
// the direct 5432 connection — not the pgbouncer pooler the app uses at runtime.
if (!process.env.DIRECT_URL) {
  console.error(
    '[db-deploy] DIRECT_URL is not set. `prisma db push` needs the direct (non-pooler) ' +
      'connection. Add DIRECT_URL to the Vercel Production environment, then redeploy.',
  )
  process.exit(1)
}

console.log('[db-deploy] Production build — syncing database schema with `prisma db push`…')
execFileSync(
  'npx',
  ['prisma', 'db', 'push', '--schema', 'prisma/schema.prisma', '--skip-generate'],
  { stdio: 'inherit' },
)
console.log('[db-deploy] Database schema is in sync.')
