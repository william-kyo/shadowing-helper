import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockRefresh = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    refresh: mockRefresh,
  }),
}))

import { ProjectSegmentWorkspace } from '@/components/project/project-segment-workspace'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

beforeEach(() => {
  mockRefresh.mockReset()
})

describe('ProjectSegmentWorkspace', () => {
  it('shows existing segments first and hides the manual form behind a bottom button', () => {
    render(
      <ProjectSegmentWorkspace
        projectId="project-1"
        audioSrc="/api/projects/project-1/audio"
        audioMimeType="audio/wav"
        audioOriginalName="lesson.wav"
        initialSegments={[
          {
            id: 'seg-1',
            index: 0,
            title: '01',
            startMs: 0,
            endMs: 16000,
            progressCount: 5,
          },
        ]}
      />,
    )

    expect(screen.getByText('1. 01')).toBeInTheDocument()
    expect(screen.queryByLabelText('セグメント名')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'セグメントを追加' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'セグメントを追加' }))

    expect(screen.getByLabelText('セグメント名')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '閉じる' }))

    expect(screen.queryByLabelText('セグメント名')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'セグメントを追加' })).toBeInTheDocument()
  })

  it('appends a newly created segment to the visible list without a full reload', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        segment: {
          id: 'seg-1',
          index: 0,
          title: '01',
          startMs: 0,
          endMs: 16000,
          progressCount: 5,
        },
      }),
    } as Response)

    render(
      <ProjectSegmentWorkspace
        projectId="project-1"
        audioSrc="/api/projects/project-1/audio"
        audioMimeType="audio/wav"
        audioOriginalName="lesson.wav"
        initialSegments={[]}
      />,
    )

    fireEvent.change(screen.getByLabelText('セグメント名'), { target: { value: '01' } })
    fireEvent.change(screen.getByLabelText('開始秒'), { target: { value: '0' } })
    fireEvent.change(screen.getByLabelText('終了秒'), { target: { value: '16' } })
    fireEvent.click(screen.getByRole('button', { name: 'セグメントを保存' }))

    expect(await screen.findByText('1. 01')).toBeInTheDocument()
    await waitFor(() => {
      expect(mockRefresh).toHaveBeenCalled()
    })
  })
})
