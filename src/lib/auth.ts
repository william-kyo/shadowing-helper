'use server'

import { createRemoteJWKSet, jwtVerify } from 'jose'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { NextResponse } from 'next/server'

import { db } from '@/lib/db'
import { env } from '@/lib/env'
import { provisionExampleProject } from '@/lib/example-project'
import { getT } from '@/lib/i18n/server'
import { addPerfAttrs, measureStep } from '@/lib/perf'

// Cached in memory for the lifetime of the serverless function instance.
// jose re-fetches automatically on unknown kid (key rotation).
const jwks = createRemoteJWKSet(
  new URL(`${env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/.well-known/jwks.json`)
)

function isSupabaseAuthCookie(name: string) {
  // Match the session token cookie (and its chunked ".0", ".1"… variants) but
  // exclude the transient PKCE "…-auth-token-code-verifier" cookie set during
  // OAuth sign-in. It sorts before the token chunks and would otherwise corrupt
  // reassembly in extractAccessToken(), reading a valid session as logged-out.
  return name.includes('-auth-token') && !name.includes('-code-verifier')
}

async function clearSupabaseAuthCookies() {
  const cookieStore = await cookies()

  for (const cookie of cookieStore.getAll()) {
    if (!isSupabaseAuthCookie(cookie.name)) {
      continue
    }

    try {
      cookieStore.delete(cookie.name)
    } catch {
      // Server components cannot always mutate cookies.
    }
  }
}

function extractAccessToken(cookieStore: Awaited<ReturnType<typeof cookies>>): string | null {
  // Supabase SSR stores: base64-<base64url(JSON)> or plain JSON
  // It may also chunk large values across multiple cookies with suffixes .0, .1, ...
  const authCookies = cookieStore
    .getAll()
    .filter((c) => isSupabaseAuthCookie(c.name))
    .sort((a, b) => a.name.localeCompare(b.name))

  if (authCookies.length === 0) return null

  // Reassemble chunked cookies
  const raw = authCookies.map((c) => c.value).join('')

  try {
    const jsonStr = raw.startsWith('base64-')
      ? Buffer.from(raw.slice(7), 'base64').toString('utf-8')
      : raw
    const parsed = JSON.parse(jsonStr) as { access_token?: string }
    return parsed.access_token ?? null
  } catch {
    return null
  }
}

async function getAuthenticatedSupabaseUser() {
  const cookieStore = await measureStep('auth.cookies', () => cookies())

  const accessToken = await measureStep('auth.extract_cookie', async () => extractAccessToken(cookieStore))
  if (!accessToken) return null

  try {
    const { payload } = await measureStep('auth.jwt_verify', () =>
      jwtVerify(accessToken, jwks, {
        issuer: `${env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1`,
        // Only Supabase USER access tokens are sessions. Pinning audience +
        // asymmetric algs + role rejects any other same-issuer token the
        // project might mint in the future (and alg-confusion by construction).
        audience: 'authenticated',
        algorithms: ['ES256', 'RS256'],
      }),
    )

    const sub = payload.sub
    const email = payload.email as string | undefined

    if (payload.role !== 'authenticated') return null
    if (!sub || !email) return null

    return { id: sub, email }
  } catch (err) {
    // Expired or invalid token — clear cookies so the client can re-authenticate
    const message = err instanceof Error ? err.message : String(err)
    if (message.includes('expired') || message.includes('invalid')) {
      await clearSupabaseAuthCookies()
    }
    return null
  }
}

const APP_USER_SELECT = {
  id: true,
  supabaseUserId: true,
  email: true,
  habitAchievedAt: true,
} as const

export async function getCurrentAppUser() {
  const supabaseUser = await getAuthenticatedSupabaseUser()
  if (!supabaseUser) return null

  addPerfAttrs({ 'auth.user_found': true })

  // Read before writing rather than upserting: knowing whether this is the
  // account's first request is what tells us to seed the sample project, and it
  // keeps the hot path (every authenticated request) to one indexed lookup.
  const existing = await measureStep('db.user.find', () =>
    db.user.findUnique({
      where: { supabaseUserId: supabaseUser.id },
      select: APP_USER_SELECT,
    }),
  )

  if (existing) {
    if (existing.email === supabaseUser.email) return existing
    return measureStep('db.user.update_email', () =>
      db.user.update({
        where: { supabaseUserId: supabaseUser.id },
        data: { email: supabaseUser.email },
        select: APP_USER_SELECT,
      }),
    )
  }

  try {
    const created = await measureStep('db.user.create', () =>
      db.user.create({
        data: {
          supabaseUserId: supabaseUser.id,
          email: supabaseUser.email,
        },
        select: APP_USER_SELECT,
      }),
    )

    // Brand-new account: seed the sample project so the first visit has
    // something to practise. Awaited rather than deferred so it is already there
    // when the dashboard renders, and swallowed on failure — a missing sample
    // must never stop someone signing in. Runs once per account, so deleting the
    // sample doesn't bring it back.
    try {
      await measureStep('db.example_project.provision', () =>
        provisionExampleProject(created.id),
      )
    } catch (err) {
      console.error('[example-project] failed to seed for user', created.id, err)
    }

    return created
  } catch {
    // Two concurrent first requests race to insert the row; the loser reads back
    // the winner's.
    return measureStep('db.user.find_after_race', () =>
      db.user.findUnique({
        where: { supabaseUserId: supabaseUser.id },
        select: APP_USER_SELECT,
      }),
    )
  }
}

export async function requireAppUser() {
  const user = await getCurrentAppUser()
  if (!user) {
    redirect('/login')
  }

  return user
}

export async function requireAppUserForApi() {
  const user = await getCurrentAppUser()
  if (!user) {
    return {
      user: null,
      response: NextResponse.json({ error: (await getT()).errors.authRequired }, { status: 401 }),
    }
  }

  return {
    user,
    response: null,
  }
}
