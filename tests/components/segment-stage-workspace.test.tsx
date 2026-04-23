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

    expect(screen.getByText('Stage 2 — シャドウ默読')).toBeInTheDocument()

    fireEvent.click(screen.getByTitle('Stage 4: not_started'))

    expect(screen.getByText('Stage 4 — スクリプト付きシャドウ')).toBeInTheDocument()
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
})
