import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ManualSegmentForm } from '@/components/project/manual-segment-form'

afterEach(() => {
  cleanup()
})

describe('ManualSegmentForm', () => {
  it('copies the player current time into the start and end fields', () => {
    const getCurrentTime = vi.fn().mockReturnValue(12.34)

    render(<ManualSegmentForm getCurrentTime={getCurrentTime} />)

    fireEvent.click(screen.getByRole('button', { name: '現在位置を開始にセット' }))
    fireEvent.click(screen.getByRole('button', { name: '現在位置を終了にセット' }))

    expect(screen.getByLabelText('開始秒')).toHaveValue(12.34)
    expect(screen.getByLabelText('終了秒')).toHaveValue(12.34)
  })

  it('requires a title before allowing a save attempt', async () => {
    const onSubmit = vi.fn()

    render(<ManualSegmentForm getCurrentTime={() => 1.23} onSubmit={onSubmit} />)

    fireEvent.change(screen.getByLabelText('開始秒'), { target: { value: '1.23' } })
    fireEvent.change(screen.getByLabelText('終了秒'), { target: { value: '2.34' } })
    fireEvent.click(screen.getByRole('button', { name: 'セグメントを保存' }))

    expect(await screen.findByText('セグメント名を入力してください。')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })
})
