import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, waitFor } from '@testing-library/react'

const replaceMock = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock, push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/projects/abc',
}))

import { AuthFetchInterceptor } from '@/components/auth/auth-fetch-interceptor'

describe('AuthFetchInterceptor', () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    replaceMock.mockReset()
    delete (window as unknown as { __authFetchInterceptorInstalled?: boolean }).__authFetchInterceptorInstalled
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { origin: 'http://localhost', pathname: '/projects/abc', search: '' } as Location,
    })
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  it('redirects to /login on 401 from same-origin requests', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response('{"error":"unauth"}', { status: 401, headers: { 'content-type': 'application/json' } }),
    ) as unknown as typeof fetch
    window.fetch = global.fetch

    render(<AuthFetchInterceptor />)
    await window.fetch('/api/projects')

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith('/login?next=%2Fprojects%2Fabc')
    })
  })

  it('does not redirect on non-401 responses', async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response('ok', { status: 200 })) as unknown as typeof fetch
    window.fetch = global.fetch

    render(<AuthFetchInterceptor />)
    await window.fetch('/api/projects')

    expect(replaceMock).not.toHaveBeenCalled()
  })

  it('does not redirect when already on /login', async () => {
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { origin: 'http://localhost', pathname: '/login', search: '' } as Location,
    })
    global.fetch = vi.fn().mockResolvedValue(new Response('', { status: 401 })) as unknown as typeof fetch
    window.fetch = global.fetch

    render(<AuthFetchInterceptor />)
    await window.fetch('/api/projects')

    expect(replaceMock).not.toHaveBeenCalled()
  })
})
