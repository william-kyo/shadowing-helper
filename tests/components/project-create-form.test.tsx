import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockPush = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}))

import { ProjectCreateForm } from '@/components/project/project-create-form'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

beforeEach(() => {
  mockPush.mockReset()
})

describe('ProjectCreateForm', () => {
  it('uses a non-submit button so the page does not fall back to native GET submission before hydration', () => {
    render(<ProjectCreateForm />)

    expect(screen.getByRole('button', { name: /プロジェクトを作成/i })).toHaveAttribute(
      'type',
      'button',
    )
  })

  it('allows submission without a title (title is optional)', async () => {
    render(<ProjectCreateForm />)

    expect(screen.queryByText('プロジェクト名を入力してください。')).not.toBeInTheDocument()
  })

  it('shows a validation message for missing audio while title and images are optional', async () => {
    render(<ProjectCreateForm />)

    fireEvent.click(screen.getByRole('button', { name: /プロジェクトを作成/i }))

    expect(
      await screen.findByText('音声ファイルを選択してください。'),
    ).toBeInTheDocument()
    expect(
      screen.queryByText('台本画像を1枚以上選択してください。'),
    ).not.toBeInTheDocument()
    expect(await screen.findByText('入力内容を確認してください。')).toBeInTheDocument()
  })
})
