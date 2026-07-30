'use client'

// Client-side locale access. Only the locale string crosses the server/client
// boundary — the dictionaries are imported directly, so nothing large is
// serialised into the RSC payload and `useT()` needs no loading state.

import { createContext, useContext, useMemo, type ReactNode } from 'react'

import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  LOCALE_COOKIE_MAX_AGE_SECONDS,
  type Locale,
} from '@/lib/i18n/config'
import { getDictionary, type Dictionary } from '@/lib/i18n/dictionaries'

const LocaleContext = createContext<Locale>(DEFAULT_LOCALE)

export function I18nProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>
}

export function useLocale(): Locale {
  return useContext(LocaleContext)
}

export function useT(): Dictionary {
  const locale = useLocale()
  return useMemo(() => getDictionary(locale), [locale])
}

// Persist the choice so the next server render picks it up. Written from the
// client rather than through a server action so the switch is immediate; it is a
// display preference, never a credential, so it needs no httpOnly protection.
export function persistLocale(locale: Locale) {
  document.cookie = [
    `${LOCALE_COOKIE}=${locale}`,
    'path=/',
    `max-age=${LOCALE_COOKIE_MAX_AGE_SECONDS}`,
    'samesite=lax',
  ].join('; ')
}
