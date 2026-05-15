type AuthCookie = { name: string; value: string }

export function isSupabaseAuthCookieName(name: string): boolean {
  return name.includes('-auth-token')
}

function base64UrlDecodeToString(input: string): string {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/')
  const padding = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4))
  if (typeof atob === 'function') {
    const decoded = atob(padded + padding)
    try {
      return decodeURIComponent(
        Array.from(decoded)
          .map((c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0'))
          .join(''),
      )
    } catch {
      return decoded
    }
  }
  return Buffer.from(padded + padding, 'base64').toString('utf-8')
}

export function reassembleSupabaseAuthCookie(cookies: AuthCookie[]): string | null {
  const authCookies = cookies
    .filter((c) => isSupabaseAuthCookieName(c.name))
    .sort((a, b) => a.name.localeCompare(b.name))
  if (authCookies.length === 0) return null
  return authCookies.map((c) => c.value).join('')
}

export function extractAccessTokenFromCookies(cookies: AuthCookie[]): string | null {
  const raw = reassembleSupabaseAuthCookie(cookies)
  if (!raw) return null
  try {
    const jsonStr = raw.startsWith('base64-')
      ? base64UrlDecodeToString(raw.slice(7))
      : raw
    const parsed = JSON.parse(jsonStr) as { access_token?: string }
    return parsed.access_token ?? null
  } catch {
    return null
  }
}

export type AccessTokenStatus = 'missing' | 'valid' | 'expired' | 'invalid'

export function inspectAccessToken(
  token: string | null,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): AccessTokenStatus {
  if (!token) return 'missing'
  const parts = token.split('.')
  if (parts.length !== 3) return 'invalid'
  try {
    const payload = JSON.parse(base64UrlDecodeToString(parts[1])) as { exp?: number }
    if (typeof payload.exp !== 'number') return 'invalid'
    return payload.exp <= nowSeconds ? 'expired' : 'valid'
  } catch {
    return 'invalid'
  }
}
