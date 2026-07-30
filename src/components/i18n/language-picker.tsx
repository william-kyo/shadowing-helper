'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

import {
  LOCALES,
  LOCALE_LABELS,
  LOCALE_SHORT_LABELS,
  type Locale,
} from '@/lib/i18n/config'
import { persistLocale, useLocale, useT } from '@/lib/i18n/client'

// Language switcher. Writes the preference cookie and refreshes so the server
// re-renders every string — including the ones only the server knows about, like
// page metadata and the `<html lang>` attribute.
export function LanguagePicker() {
  const router = useRouter()
  const active = useLocale()
  const t = useT()
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return

    const handlePointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [open])

  const choose = (locale: Locale) => {
    setOpen(false)
    if (locale === active) return
    persistLocale(locale)
    router.refresh()
  }

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-label={t.language.pickerAriaLabel}
        aria-expanded={open}
        aria-haspopup="menu"
        title={t.language.label}
        className="flex items-center gap-1.5 rounded-chip border border-ink-line bg-paper/60 px-2.5 py-1.5 font-mono text-[11px] uppercase tracking-[0.12em] text-ink-muted transition hover:border-accent hover:text-accent"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <circle cx="12" cy="12" r="10" />
          <path d="M2 12h20" />
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
        </svg>
        {LOCALE_SHORT_LABELS[active]}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-30 mt-1.5 min-w-36 rounded-inset border border-ink-line bg-paper py-1 shadow-lg"
        >
          <div className="border-b border-ink-line/50 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-faint">
            {t.language.label}
          </div>
          {LOCALES.map((locale) => (
            <button
              key={locale}
              type="button"
              role="menuitemradio"
              aria-checked={locale === active}
              onClick={() => choose(locale)}
              className={`flex w-full items-center gap-2 px-3 py-2 text-start text-sm transition hover:bg-surface ${
                locale === active ? 'font-medium text-accent' : 'text-ink-muted'
              }`}
            >
              {locale === active && (
                <span className="flex h-2 w-2 shrink-0 rounded-full bg-accent" />
              )}
              <span className={locale === active ? '' : 'ps-4'}>{LOCALE_LABELS[locale]}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
