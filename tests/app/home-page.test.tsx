import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
  useRouter: () => ({
    push: vi.fn(),
  }),
}))

vi.mock('@/lib/auth', () => ({
  getCurrentAppUser: vi.fn().mockResolvedValue(null),
}))

import HomePage from '@/app/page'
import { redirect } from 'next/navigation'

describe('HomePage', () => {
  it('redirects anonymous users to login', async () => {
    render(await HomePage())

    expect(redirect).toHaveBeenCalledWith('/login')
  })
})
