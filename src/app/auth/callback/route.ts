import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

import { env } from '@/lib/env'

// OAuth (PKCE) landing route. Supabase redirects the browser here with a `code`
// once the external provider (e.g. Google) has authenticated the user. We swap
// that code for a session and persist the auth cookies before entering the app.
export const dynamic = 'force-dynamic'

function sanitizeNext(raw: string | null): string {
  // Prevent open redirects: only accept same-origin relative paths. Anything
  // that could resolve to another host ("//evil", "/\\evil", protocol URLs)
  // falls back to the home page.
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) {
    return '/'
  }
  // Never bounce back into the auth routes themselves — a stale `next` pointing
  // at /auth/callback or /login would re-enter this flow and loop.
  if (raw === '/login' || raw.startsWith('/login?') || raw.startsWith('/auth/')) {
    return '/'
  }
  return raw
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = sanitizeNext(searchParams.get('next'))

  // Behind a proxy (e.g. Vercel) the public host lives in x-forwarded-host,
  // while `origin` reflects the internal request host. The header is set by the
  // trusted proxy, not the browser.
  const forwardedHost = request.headers.get('x-forwarded-host')
  const isLocalEnv = process.env.NODE_ENV === 'development'
  const base = !isLocalEnv && forwardedHost ? `https://${forwardedHost}` : origin

  if (!code) {
    return NextResponse.redirect(`${base}/login?error=oauth`)
  }

  // Build the success redirect up front and let Supabase write the session
  // cookies straight onto it, so they persist regardless of framework
  // cookie-flush behavior on a route-handler redirect.
  const response = NextResponse.redirect(`${base}${next}`)

  const supabase = createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options)
          }
        },
      },
    },
  )

  const { error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    return NextResponse.redirect(`${base}/login?error=oauth`)
  }

  return response
}
