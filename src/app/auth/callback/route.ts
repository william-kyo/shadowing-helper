import { NextResponse } from 'next/server'

import { createSupabaseServerClient } from '@/lib/supabase/server'

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
  return raw
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = sanitizeNext(searchParams.get('next'))

  // Behind a proxy (e.g. Vercel) the public host lives in x-forwarded-host,
  // while `origin` reflects the internal request host. Resolve it once so every
  // redirect — success and failure alike — lands on the same public domain the
  // user started on. The header is set by the trusted proxy, not the browser.
  const forwardedHost = request.headers.get('x-forwarded-host')
  const isLocalEnv = process.env.NODE_ENV === 'development'
  const base = !isLocalEnv && forwardedHost ? `https://${forwardedHost}` : origin

  // On failure, keep `next` so a successful retry still reaches the intended page.
  const failureParams = new URLSearchParams({ error: 'oauth' })
  if (next !== '/') {
    failureParams.set('next', next)
  }
  const failure = NextResponse.redirect(`${base}/login?${failureParams.toString()}`)

  if (!code) {
    return failure
  }

  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    return failure
  }

  return NextResponse.redirect(`${base}${next}`)
}
