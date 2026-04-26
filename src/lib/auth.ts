'use server'

import { createRemoteJWKSet, jwtVerify } from 'jose'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { NextResponse } from 'next/server'

import { db } from '@/lib/db'
import { env } from '@/lib/env'
import { addPerfAttrs, measureStep } from '@/lib/perf'

// Cached in memory for the lifetime of the serverless function instance.
// jose re-fetches automatically on unknown kid (key rotation).
const jwks = createRemoteJWKSet(
  new URL(`${env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/.well-known/jwks.json`)
)

function isSupabaseAuthCookie(name: string) {
  return name.includes('-auth-token')
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
      }),
    )

    const sub = payload.sub
    const email = payload.email as string | undefined

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

export async function getCurrentAppUser() {
  const supabaseUser = await getAuthenticatedSupabaseUser()
  if (!supabaseUser) return null

  addPerfAttrs({ 'auth.user_found': true })

  const appUser = await measureStep('db.user.upsert', () =>
    db.user.upsert({
      where: { supabaseUserId: supabaseUser.id },
      update: { email: supabaseUser.email },
      create: {
        supabaseUserId: supabaseUser.id,
        email: supabaseUser.email,
      },
      select: {
        id: true,
        supabaseUserId: true,
        email: true,
      },
    }),
  )

  return appUser
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
      response: NextResponse.json({ error: 'ログインしてください。' }, { status: 401 }),
    }
  }

  return {
    user,
    response: null,
  }
}
