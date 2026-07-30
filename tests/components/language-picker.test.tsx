import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const refreshMock = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: refreshMock }),
}))

import { LanguagePicker } from '@/components/i18n/language-picker'
import { I18nProvider } from '@/lib/i18n/client'
import { LOCALE_COOKIE, type Locale } from '@/lib/i18n/config'

function renderPicker(locale: Locale = 'ja') {
  render(
    <I18nProvider locale={locale}>
      <LanguagePicker />
    </I18nProvider>,
  )
}

describe('LanguagePicker', () => {
  beforeEach(() => {
    refreshMock.mockReset()
    document.cookie = `${LOCALE_COOKIE}=; max-age=0; path=/`
  })

  afterEach(cleanup)

  it('shows the active locale and labels each option in its own language', () => {
    renderPicker('ja')

    expect(screen.getByRole('button', { name: '表示言語を選ぶ' })).toHaveTextContent('JA')

    fireEvent.click(screen.getByRole('button', { name: '表示言語を選ぶ' }))

    expect(screen.getByRole('menuitemradio', { name: '日本語' })).toBeInTheDocument()
    expect(screen.getByRole('menuitemradio', { name: 'English' })).toBeInTheDocument()
    expect(screen.getByRole('menuitemradio', { name: '中文' })).toBeInTheDocument()
  })

  it('marks only the active locale as checked', () => {
    renderPicker('en')
    fireEvent.click(screen.getByRole('button', { name: 'Choose display language' }))

    expect(screen.getByRole('menuitemradio', { name: 'English' })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    expect(screen.getByRole('menuitemradio', { name: '日本語' })).toHaveAttribute(
      'aria-checked',
      'false',
    )
  })

  it('persists the choice and re-renders the server tree', () => {
    renderPicker('ja')
    fireEvent.click(screen.getByRole('button', { name: '表示言語を選ぶ' }))
    fireEvent.click(screen.getByRole('menuitemradio', { name: '中文' }))

    expect(document.cookie).toContain(`${LOCALE_COOKIE}=zh`)
    expect(refreshMock).toHaveBeenCalledOnce()
  })

  it('does nothing when the active locale is picked again', () => {
    renderPicker('ja')
    fireEvent.click(screen.getByRole('button', { name: '表示言語を選ぶ' }))
    fireEvent.click(screen.getByRole('menuitemradio', { name: '日本語' }))

    expect(refreshMock).not.toHaveBeenCalled()
  })

  it('translates its own chrome into the active locale', () => {
    renderPicker('zh')
    expect(screen.getByRole('button', { name: '选择显示语言' })).toHaveTextContent('ZH')
  })

  it('closes the menu on Escape', () => {
    renderPicker('ja')
    fireEvent.click(screen.getByRole('button', { name: '表示言語を選ぶ' }))
    expect(screen.getByRole('menu')).toBeInTheDocument()

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })
})
