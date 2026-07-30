import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { replaceMock, refreshMock, signOutMock } = vi.hoisted(() => ({
  replaceMock: vi.fn(),
  refreshMock: vi.fn(),
  signOutMock: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: replaceMock, refresh: refreshMock }),
}))
vi.mock('@/lib/supabase/client', () => ({
  createSupabaseBrowserClient: () => ({ auth: { signOut: signOutMock } }),
}))

import { DeleteAccountCard } from '@/components/account/delete-account-card'
import { I18nProvider } from '@/lib/i18n/client'
import ja from '@/lib/i18n/dictionaries/ja'

function renderCard(email = 'owner@example.com') {
  render(
    <I18nProvider locale="ja">
      <DeleteAccountCard email={email} />
    </I18nProvider>,
  )
}

function openConfirmation() {
  fireEvent.click(screen.getByRole('button', { name: ja.account.deleteButton }))
}

describe('DeleteAccountCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    signOutMock.mockResolvedValue(undefined)
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    } as Response)
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('keeps deletion behind a confirmation step', () => {
    renderCard()

    // Nothing destructive is reachable in one tap.
    expect(
      screen.queryByRole('button', { name: ja.account.confirmDelete }),
    ).not.toBeInTheDocument()

    openConfirmation()
    expect(screen.getByRole('button', { name: ja.account.confirmDelete })).toBeDisabled()
  })

  it('stays disabled until the account own email is typed', () => {
    renderCard('owner@example.com')
    openConfirmation()

    const input = screen.getByPlaceholderText(ja.account.confirmPlaceholder)
    fireEvent.change(input, { target: { value: 'someone@else.com' } })

    expect(screen.getByRole('button', { name: ja.account.confirmDelete })).toBeDisabled()
    expect(screen.getByText(ja.account.confirmMismatch)).toBeInTheDocument()
  })

  it('accepts the email regardless of case or padding', () => {
    renderCard('Owner@Example.com')
    openConfirmation()

    fireEvent.change(screen.getByPlaceholderText(ja.account.confirmPlaceholder), {
      target: { value: '  owner@example.com  ' },
    })

    expect(screen.getByRole('button', { name: ja.account.confirmDelete })).toBeEnabled()
  })

  it('deletes, signs out, then leaves for the login screen', async () => {
    renderCard()
    openConfirmation()
    fireEvent.change(screen.getByPlaceholderText(ja.account.confirmPlaceholder), {
      target: { value: 'owner@example.com' },
    })
    fireEvent.click(screen.getByRole('button', { name: ja.account.confirmDelete }))

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith('/api/account', { method: 'DELETE' }),
    )
    // The Supabase identity outlives deletion, so a lingering session would keep
    // bouncing them off every page.
    await waitFor(() => expect(signOutMock).toHaveBeenCalledOnce())
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/login'))
  })

  it('reports a failure and stays put instead of signing out', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'boom' }),
    } as Response)

    renderCard()
    openConfirmation()
    fireEvent.change(screen.getByPlaceholderText(ja.account.confirmPlaceholder), {
      target: { value: 'owner@example.com' },
    })
    fireEvent.click(screen.getByRole('button', { name: ja.account.confirmDelete }))

    expect(await screen.findByRole('alert')).toHaveTextContent('boom')
    expect(signOutMock).not.toHaveBeenCalled()
    expect(replaceMock).not.toHaveBeenCalled()
  })

  it('cancelling clears what was typed', () => {
    renderCard()
    openConfirmation()
    fireEvent.change(screen.getByPlaceholderText(ja.account.confirmPlaceholder), {
      target: { value: 'owner@example.com' },
    })
    fireEvent.click(screen.getByRole('button', { name: ja.account.cancel }))

    openConfirmation()
    expect(screen.getByPlaceholderText(ja.account.confirmPlaceholder)).toHaveValue('')
  })
})
