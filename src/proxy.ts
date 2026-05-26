import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

import { isSupabaseAuthCookieName } from '@/lib/auth-cookies'

const PUBLIC_PATHS = new Set(['/login'])

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PATHS.has(pathname)) return true
  if (pathname.startsWith('/_next')) return true
  if (pathname.startsWith('/api/perf')) return true
  if (pathname === '/favicon.ico' || pathname === '/manifest.webmanifest') return true
  return false
}

function clearAuthCookies(response: NextResponse, request: NextRequest) {
  for (const cookie of request.cookies.getAll()) {
    if (isSupabaseAuthCookieName(cookie.name)) {
      response.cookies.delete(cookie.name)
    }
  }
}

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl

  if (isPublicPath(pathname)) {
    return NextResponse.next()
  }

  const response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value)
          }
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options)
          }
        },
      },
    },
  )

  // getUser() automatically refreshes the access_token via the refresh_token
  // when it has expired, writing updated cookies through setAll above.
  const { data: { user } } = await supabase.auth.getUser()

  if (user) {
    return response
  }

  if (pathname.startsWith('/api/')) {
    const errorResponse = NextResponse.json(
      { error: 'ログインしてください。', code: 'auth_required' },
      { status: 401 },
    )
    clearAuthCookies(errorResponse, request)
    return errorResponse
  }

  const loginUrl = new URL('/login', request.url)
  if (pathname !== '/') {
    loginUrl.searchParams.set('next', pathname + (search ?? ''))
  }
  const redirectResponse = NextResponse.redirect(loginUrl)
  clearAuthCookies(redirectResponse, request)
  return redirectResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|gif|ico)$).*)'],
}
