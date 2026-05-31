import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const pushMock = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, refresh: vi.fn(), replace: vi.fn() }),
}))

import { SegmentStageWorkspace } from '@/components/segment/segment-stage-workspace'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  pushMock.mockReset()
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
        nextIncompleteHref={null}
      />,
    )

    expect(
      screen.getByRole('heading', { name: /Stage 2 — サイレント・シャドーイング/ }),
    ).toBeInTheDocument()

    fireEvent.click(screen.getByTitle('Stage 4 スクリプト付きシャドーイング'))

    expect(
      screen.getByRole('heading', { name: /Stage 4 — スクリプト付きシャドーイング/ }),
    ).toBeInTheDocument()
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
        nextIncompleteHref={null}
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

  it('autosaves edits and keeps script and notes when switching stages without a page refresh', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ text: 'edited script', notes: 'edited notes' }),
    } as Response)

    render(
      <SegmentStageWorkspace
        segmentId="seg-1"
        initialProgress={[{ stage: 1, status: 'in_progress' }]}
        initialText="old script"
        initialNotes="old notes"
        initialStage={1}
        nextIncompleteHref={null}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '表示' }))
    fireEvent.change(screen.getByDisplayValue('old script'), { target: { value: 'edited script' } })
    fireEvent.change(screen.getByDisplayValue('old notes'), { target: { value: 'edited notes' } })

    // Edits persist via debounced autosave — no manual save button.
    expect(await screen.findByText('✓ 自動保存しました', {}, { timeout: 2500 })).toBeInTheDocument()
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/segments/seg-1',
        expect.objectContaining({ method: 'PATCH' }),
      )
    })

    fireEvent.click(screen.getByTitle('Stage 2 サイレント・シャドーイング'))

    expect(screen.getByDisplayValue('edited script')).toBeInTheDocument()
    expect(screen.getByDisplayValue('edited notes')).toBeInTheDocument()
  })

  it('jumps to the next incomplete segment once the final stage is completed', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({ ok: true } as Response)

    render(
      <SegmentStageWorkspace
        segmentId="seg-1"
        initialProgress={[
          { stage: 1, status: 'completed' },
          { stage: 2, status: 'completed' },
          { stage: 3, status: 'completed' },
          { stage: 4, status: 'completed' },
          { stage: 5, status: 'in_progress' },
        ]}
        initialText="sample text"
        initialNotes={null}
        initialStage={5}
        nextIncompleteHref="/projects/proj-2/segments/seg-9"
      />,
    )

    // Completing the last in-progress stage marks the segment fully done.
    fireEvent.click(screen.getByRole('button', { name: '◐ 進行中' }))

    expect(await screen.findByText('セグメント完了')).toBeInTheDocument()
    await waitFor(
      () => expect(pushMock).toHaveBeenCalledWith('/projects/proj-2/segments/seg-9'),
      { timeout: 2000 },
    )
  })

  it('falls back to home when nothing is left to complete', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({ ok: true } as Response)

    render(
      <SegmentStageWorkspace
        segmentId="seg-1"
        initialProgress={[
          { stage: 1, status: 'completed' },
          { stage: 2, status: 'completed' },
          { stage: 3, status: 'completed' },
          { stage: 4, status: 'completed' },
          { stage: 5, status: 'in_progress' },
        ]}
        initialText="sample text"
        initialNotes={null}
        initialStage={5}
        nextIncompleteHref={null}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '◐ 進行中' }))

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/'), { timeout: 2000 })
  })
})
