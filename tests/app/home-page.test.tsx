import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
}))

import HomePage from '@/app/page'

describe('HomePage', () => {
  it('renders the Shadowing Helper heading', () => {
    render(<HomePage />)

    expect(
      screen.getByRole('heading', { level: 1, name: /shadowing helper/i }),
    ).toBeInTheDocument()
  })
})
