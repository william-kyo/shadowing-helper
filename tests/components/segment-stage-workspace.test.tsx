import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { SegmentStageWorkspace } from '@/components/segment/segment-stage-workspace'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('SegmentStageWorkspace', () => {
  it('switches the panel when a stage is selected', () => {
    render(
      <SegmentStageWorkspace
        segmentId="seg-1"
        initialProgress={[
          { stage: 1, status: 'completed' },
          { stage: 2, status: 'in_progress' },
        ]}
        initialText="sample text"
        initialNotes="sample notes"
        initialStage={2}
      />,
    )

    expect(screen.getByText(/Stage 2 — サイレント・シャドーイング/)).toBeInTheDocument()

    fireEvent.click(screen.getByTitle('Stage 4 スクリプト付きシャドーイング'))

    expect(screen.getByText(/Stage 4 — スクリプト付きシャドーイング/)).toBeInTheDocument()
  })

  it('updates the selected stage status from the panel header', async () => {
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue({ ok: true } as Response)

    render(
      <SegmentStageWorkspace
        segmentId="seg-1"
        initialProgress={[{ stage: 3, status: 'not_started' }]}
        initialText="sample text"
        initialNotes={null}
        initialStage={3}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '○ 未着手' }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/segments/seg-1/progress', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ stage: 3, status: 'in_progress' }),
      })
    })

    expect(screen.getByRole('button', { name: '◐ 進行中' })).toBeInTheDocument()
  })

  it('keeps saved script and notes when switching stages without a page refresh', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ text: 'saved script', notes: 'saved notes' }),
    } as Response)

    render(
      <SegmentStageWorkspace
        segmentId="seg-1"
        initialProgress={[{ stage: 1, status: 'in_progress' }]}
        initialText="old script"
        initialNotes="old notes"
        initialStage={1}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '表示' }))
    fireEvent.change(screen.getByDisplayValue('old script'), { target: { value: 'saved script' } })
    fireEvent.change(screen.getByDisplayValue('old notes'), { target: { value: 'saved notes' } })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))

    expect(await screen.findByText('保存しました')).toBeInTheDocument()

    fireEvent.click(screen.getByTitle('Stage 2 サイレント・シャドーイング'))

    expect(screen.getByDisplayValue('saved script')).toBeInTheDocument()
    expect(screen.getByDisplayValue('saved notes')).toBeInTheDocument()
  })
})
