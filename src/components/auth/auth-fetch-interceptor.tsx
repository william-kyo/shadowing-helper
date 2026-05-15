'use client'

import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'

declare global {
  interface Window {
    __authFetchInterceptorInstalled?: boolean
  }
}

export function AuthFetchInterceptor() {
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (window.__authFetchInterceptorInstalled) return
    window.__authFetchInterceptorInstalled = true

    const originalFetch = window.fetch.bind(window)

    window.fetch = async (input, init) => {
      const response = await originalFetch(input, init)

      if (response.status !== 401) return response

      const url = typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url

      let isInternal = true
      try {
        const parsed = new URL(url, window.location.origin)
        isInternal = parsed.origin === window.location.origin
      } catch {
        isInternal = true
      }

      if (!isInternal) return response

      if (window.location.pathname !== '/login') {
        const next = window.location.pathname + window.location.search
        const target = next && next !== '/' ? `/login?next=${encodeURIComponent(next)}` : '/login'
        router.replace(target)
      }

      return response
    }

    return () => {
      window.fetch = originalFetch
      window.__authFetchInterceptorInstalled = false
    }
  }, [router, pathname])

  return null
}
