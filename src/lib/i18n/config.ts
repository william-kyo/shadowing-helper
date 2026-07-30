// Locale plumbing shared by the server (cookie/header resolution) and the
// client (the language picker). Kept free of `server-only` so both can import it.

export const LOCALES = ['ja', 'en', 'zh'] as const

export type Locale = (typeof LOCALES)[number]

// Japanese is the source language: the app teaches Japanese, and every string is
// authored in ja first, so it is also the fallback when nothing else matches.
export const DEFAULT_LOCALE: Locale = 'ja'

// Read on every server render, written by the language picker. Not httpOnly on
// purpose — it is a display preference the client sets directly, never a secret.
export const LOCALE_COOKIE = 'shadowing_locale'

export const LOCALE_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365

// Shown in the picker. Each label is written in its own language so it stays
// recognisable no matter which locale is currently active.
export const LOCALE_LABELS: Record<Locale, string> = {
  ja: '日本語',
  en: 'English',
  zh: '中文',
}

// Short form for the compact picker button.
export const LOCALE_SHORT_LABELS: Record<Locale, string> = {
  ja: 'JA',
  en: 'EN',
  zh: 'ZH',
}

// BCP 47 tags for Intl formatters, so dates and numbers follow the same choice
// as the copy rather than staying pinned to Japanese conventions.
export const LOCALE_BCP47: Record<Locale, string> = {
  ja: 'ja-JP',
  en: 'en-US',
  zh: 'zh-CN',
}

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value)
}

// Pick a locale from an Accept-Language header, ignoring the quality weights:
// the first supported language wins, which matches how browsers order them.
// Region subtags are dropped ("zh-CN" → "zh", "en-GB" → "en").
export function localeFromAcceptLanguage(header: string | null | undefined): Locale | null {
  if (!header) return null
  for (const part of header.split(',')) {
    const tag = part.split(';')[0]?.trim().toLowerCase()
    if (!tag) continue
    const base = tag.split('-')[0]
    if (isLocale(base)) return base
  }
  return null
}

// Explicit choice wins over the browser's preference, which wins over Japanese.
export function resolveLocale(params: {
  cookie?: string | null
  acceptLanguage?: string | null
}): Locale {
  if (isLocale(params.cookie)) return params.cookie
  return localeFromAcceptLanguage(params.acceptLanguage) ?? DEFAULT_LOCALE
}

// Pull our cookie straight out of a Cookie header. Route handlers use this
// instead of next/headers so they stay callable outside a request scope.
export function localeCookieFromHeader(header: string | null | undefined): string | null {
  if (!header) return null
  for (const part of header.split(';')) {
    const [name, ...rest] = part.trim().split('=')
    if (name === LOCALE_COOKIE) return rest.join('=')
  }
  return null
}

// Locale for an incoming request, resolved without any framework context.
export function localeFromRequest(request: {
  headers: { get(name: string): string | null }
}): Locale {
  return resolveLocale({
    cookie: localeCookieFromHeader(request.headers.get('cookie')),
    acceptLanguage: request.headers.get('accept-language'),
  })
}
