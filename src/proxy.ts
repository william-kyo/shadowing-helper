import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

import {
  extractAccessTokenFromCookies,
  inspectAccessToken,
  isSupabaseAuthCookieName,
} from '@/lib/auth-cookies'

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

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl

  if (isPublicPath(pathname)) {
    return NextResponse.next()
  }

  const cookies = request.cookies.getAll().map(({ name, value }) => ({ name, value }))
  const token = extractAccessTokenFromCookies(cookies)
  const status = inspectAccessToken(token)

  if (status === 'valid') {
    return NextResponse.next()
  }

  if (pathname.startsWith('/api/')) {
    const response = NextResponse.json(
      { error: 'ログインしてください。', code: 'auth_required' },
      { status: 401 },
    )
    clearAuthCookies(response, request)
    return response
  }

  const loginUrl = new URL('/login', request.url)
  if (pathname !== '/') {
    loginUrl.searchParams.set('next', pathname + (search ?? ''))
  }
  const response = NextResponse.redirect(loginUrl)
  clearAuthCookies(response, request)
  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|gif|ico)$).*)'],
}
