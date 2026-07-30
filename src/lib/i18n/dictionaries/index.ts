import en from '@/lib/i18n/dictionaries/en'
import ja, { type Dictionary } from '@/lib/i18n/dictionaries/ja'
import zh from '@/lib/i18n/dictionaries/zh'
import { DEFAULT_LOCALE, type Locale } from '@/lib/i18n/config'

export type { Dictionary }

// Statically imported rather than lazily loaded: these are a few kilobytes of
// strings, and having them synchronous means client components can translate
// during render without a loading state or a serialisation hop.
export const DICTIONARIES: Record<Locale, Dictionary> = { ja, en, zh }

export function getDictionary(locale: Locale): Dictionary {
  return DICTIONARIES[locale] ?? DICTIONARIES[DEFAULT_LOCALE]
}
