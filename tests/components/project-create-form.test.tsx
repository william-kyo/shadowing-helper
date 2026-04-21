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

  it('shows a validation message when the title is missing on submit', async () => {
    render(<ProjectCreateForm />)

    fireEvent.click(screen.getByRole('button', { name: /プロジェクトを作成/i }))

    expect(
      await screen.findByText('プロジェクト名を入力してください。'),
    ).toBeInTheDocument()
  })

  it('shows validation messages for missing audio and images on submit', async () => {
    render(<ProjectCreateForm />)

    fireEvent.change(screen.getByLabelText('プロジェクト名'), {
      target: { value: 'lesson 1' },
    })

    fireEvent.click(screen.getByRole('button', { name: /プロジェクトを作成/i }))

    expect(
      await screen.findByText('音声ファイルを選択してください。'),
    ).toBeInTheDocument()
    expect(
      await screen.findByText('台本画像を1枚以上選択してください。'),
    ).toBeInTheDocument()
    expect(await screen.findByText('入力内容を確認してください。')).toBeInTheDocument()
  })
})
