'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

type TabDef = {
  href: string
  label: string
  reading: string
  isActive: (pathname: string) => boolean
  icon: (active: boolean) => React.ReactNode
}

const TABS: TabDef[] = [
  {
    href: '/',
    label: 'ホーム',
    reading: 'home',
    isActive: (p) => p === '/',
    icon: (active) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 10.5 12 3l9 7.5" />
        <path d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5" />
      </svg>
    ),
  },
  {
    href: '/projects',
    label: 'プロジェクト',
    reading: 'projects',
    isActive: (p) => p.startsWith('/projects'),
    icon: (active) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 7.5A1.5 1.5 0 0 1 4.5 6h4l2 2.5h7A1.5 1.5 0 0 1 19 10v8a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 3 18z" />
      </svg>
    ),
  },
]

/**
 * Persistent bottom tab bar for the warm-paper shell.
 *
 * Hidden on routes that own the bottom of the screen or have no chrome:
 *  - /login                              (auth, no navigation)
 *  - /projects/[id]/segments/[id]        (fixed audio player already lives there)
 */
export function BottomNav() {
  const pathname = usePathname()

  if (pathname === '/login') return null
  if (/^\/projects\/[^/]+\/segments\//.test(pathname)) return null

  return (
    <nav
      aria-label="メインナビゲーション"
      className="glass-player fixed inset-x-0 bottom-0 z-30 border-t border-ink-line/60 shadow-[0_-4px_24px_rgba(29,27,24,0.06)]"
    >
      <ul
        className="mx-auto flex max-w-2xl items-stretch justify-around px-4"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 0.4rem)' }}
      >
        {TABS.map((tab) => {
          const active = tab.isActive(pathname)
          return (
            <li key={tab.href} className="flex-1">
              <Link
                href={tab.href}
                aria-current={active ? 'page' : undefined}
                className={`group flex flex-col items-center gap-1 pb-1 pt-2.5 transition ${
                  active ? 'text-accent' : 'text-ink-faint hover:text-ink-muted'
                }`}
              >
                <span
                  className={`flex h-9 w-14 items-center justify-center rounded-chip transition ${
                    active ? 'bg-accent-faint' : 'bg-transparent'
                  }`}
                >
                  {tab.icon(active)}
                </span>
                <span className="font-mono text-[9px] uppercase tracking-[0.16em]">
                  {tab.reading}
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
