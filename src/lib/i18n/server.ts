import 'server-only'

import { cookies, headers } from 'next/headers'

import {
  LOCALE_COOKIE,
  localeFromRequest,
  resolveLocale,
  type Locale,
} from '@/lib/i18n/config'
import { getDictionary, type Dictionary } from '@/lib/i18n/dictionaries'

// Locale for the current request: the picker's cookie wins, otherwise the
// browser's Accept-Language, otherwise Japanese.
export async function getLocale(): Promise<Locale> {
  const [cookieStore, headerList] = await Promise.all([cookies(), headers()])
  return resolveLocale({
    cookie: cookieStore.get(LOCALE_COOKIE)?.value,
    acceptLanguage: headerList.get('accept-language'),
  })
}

export async function getT(): Promise<Dictionary> {
  return getDictionary(await getLocale())
}

// Route handlers read the request's own headers rather than next/headers, which
// keeps them callable outside a request scope (and makes them trivial to test).
export function getRequestLocale(request: Request): Locale {
  return localeFromRequest(request)
}

export function getRequestT(request: Request): Dictionary {
  return getDictionary(getRequestLocale(request))
}
