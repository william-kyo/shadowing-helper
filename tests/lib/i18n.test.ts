// @vitest-environment node
import { describe, expect, it } from 'vitest'

import {
  DEFAULT_LOCALE,
  LOCALES,
  isLocale,
  localeCookieFromHeader,
  localeFromAcceptLanguage,
  localeFromRequest,
  resolveLocale,
} from '@/lib/i18n/config'
import { DICTIONARIES, getDictionary } from '@/lib/i18n/dictionaries'
import ja from '@/lib/i18n/dictionaries/ja'
import { format } from '@/lib/i18n/format'

describe('locale resolution', () => {
  it('prefers an explicit cookie choice over the browser preference', () => {
    expect(resolveLocale({ cookie: 'en', acceptLanguage: 'zh-CN,zh;q=0.9' })).toBe('en')
  })

  it('falls back to Accept-Language when no choice has been made', () => {
    expect(resolveLocale({ cookie: null, acceptLanguage: 'zh-CN,zh;q=0.9' })).toBe('zh')
  })

  it('falls back to Japanese when nothing matches', () => {
    expect(resolveLocale({ cookie: null, acceptLanguage: 'fr-FR,fr;q=0.9' })).toBe('ja')
    expect(resolveLocale({})).toBe(DEFAULT_LOCALE)
  })

  it('ignores a cookie holding an unsupported locale', () => {
    expect(resolveLocale({ cookie: 'de', acceptLanguage: 'en-US' })).toBe('en')
  })

  it('matches on the base language, dropping the region subtag', () => {
    expect(localeFromAcceptLanguage('en-GB,en;q=0.9')).toBe('en')
    expect(localeFromAcceptLanguage('zh-TW')).toBe('zh')
    expect(localeFromAcceptLanguage('ja-JP')).toBe('ja')
    expect(localeFromAcceptLanguage('fr')).toBeNull()
    expect(localeFromAcceptLanguage(null)).toBeNull()
  })

  it('takes the first supported language rather than the first listed', () => {
    expect(localeFromAcceptLanguage('fr-FR,de;q=0.8,zh;q=0.5')).toBe('zh')
  })

  it('recognises exactly the supported locales', () => {
    for (const locale of LOCALES) expect(isLocale(locale)).toBe(true)
    expect(isLocale('de')).toBe(false)
    expect(isLocale(undefined)).toBe(false)
  })
})

describe('reading the choice off a request', () => {
  it('finds the cookie among others', () => {
    expect(localeCookieFromHeader('foo=1; shadowing_locale=zh; bar=2')).toBe('zh')
  })

  it('returns null when absent', () => {
    expect(localeCookieFromHeader('foo=1; bar=2')).toBeNull()
    expect(localeCookieFromHeader(null)).toBeNull()
  })

  it('resolves a route handler request without any framework context', () => {
    const request = new Request('http://localhost/api/x', {
      headers: { cookie: 'shadowing_locale=en', 'accept-language': 'ja-JP' },
    })
    expect(localeFromRequest(request)).toBe('en')
  })

  it('uses Accept-Language when the request carries no choice', () => {
    const request = new Request('http://localhost/api/x', {
      headers: { 'accept-language': 'zh-CN' },
    })
    expect(localeFromRequest(request)).toBe('zh')
  })
})

describe('dictionaries', () => {
  it('ships one for every supported locale', () => {
    for (const locale of LOCALES) expect(getDictionary(locale)).toBeDefined()
  })

  // The type system already requires this, but the check also catches a locale
  // whose value was left as an empty string.
  it('translates every key in every locale', () => {
    const paths: string[] = []
    for (const [namespace, entries] of Object.entries(ja)) {
      for (const key of Object.keys(entries)) paths.push(`${namespace}.${key}`)
    }
    expect(paths.length).toBeGreaterThan(100)

    for (const locale of LOCALES) {
      const dictionary = DICTIONARIES[locale] as unknown as Record<
        string,
        Record<string, string>
      >
      const missing = paths.filter((path) => {
        const [namespace, key] = path.split('.')
        const value = dictionary[namespace]?.[key]
        return typeof value !== 'string' || value.length === 0
      })
      expect(missing, `${locale} is missing: ${missing.join(', ')}`).toEqual([])
    }
  })

  it('keeps the same placeholders in every translation', () => {
    const placeholders = (value: string) =>
      [...value.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort()

    const mismatches: string[] = []
    for (const [namespace, entries] of Object.entries(ja)) {
      for (const [key, source] of Object.entries(entries)) {
        const expected = placeholders(source as string)
        for (const locale of LOCALES) {
          const dictionary = DICTIONARIES[locale] as unknown as Record<
            string,
            Record<string, string>
          >
          const actual = placeholders(dictionary[namespace][key])
          if (actual.join(',') !== expected.join(',')) {
            mismatches.push(`${locale} ${namespace}.${key}: ${actual} vs ${expected}`)
          }
        }
      }
    }
    expect(mismatches).toEqual([])
  })
})

describe('format', () => {
  it('substitutes named placeholders', () => {
    expect(format('{a} and {b}', { a: 'x', b: 2 })).toBe('x and 2')
  })

  it('fills a placeholder used more than once', () => {
    expect(format('{n}/{n}', { n: 3 })).toBe('3/3')
  })

  it('leaves an unknown placeholder untouched rather than printing undefined', () => {
    expect(format('{a} {b}', { a: 'x' })).toBe('x {b}')
  })

  it('returns a template with no placeholders unchanged', () => {
    expect(format('plain', { a: 1 })).toBe('plain')
  })
})
