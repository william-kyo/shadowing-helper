import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    refresh: vi.fn(),
  }),
}))

vi.mock('@/lib/auth', () => ({
  requireAppUser: vi.fn().mockResolvedValue({
    id: 'user-1',
    email: 'owner@example.com',
  }),
}))

vi.mock('@/lib/db', () => ({
  db: {
    project: {
      findMany: vi.fn().mockResolvedValue([
        {
          id: 'project-1',
          title: 'NHK lesson 1',
          audioOriginalName: 'source.wav',
          status: 'draft',
          rawExtractedText: null,
          createdAt: new Date('2026-04-21T13:00:00.000Z'),
          sourceImages: [{ id: 'img-1' }],
          segments: [],
        },
      ]),
    },
  },
}))

import ProjectsPage, * as ProjectsPageModule from '@/app/projects/page'

afterEach(() => {
  cleanup()
})

describe('ProjectsPage module', () => {
  it('forces dynamic rendering so newly created projects appear in production without rebuilding', () => {
    expect(ProjectsPageModule.dynamic).toBe('force-dynamic')
  })

  it('links each project card to its detail page', async () => {
    render(await ProjectsPage())

    expect(screen.getByRole('link', { name: /NHK lesson 1/ })).toHaveAttribute(
      'href',
      '/projects/project-1',
    )
  })

  it('hides the create panel behind a bottom button when projects already exist', async () => {
    render(await ProjectsPage())

    expect(screen.queryByText('新しいプロジェクトを作成')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'プロジェクトを作成' }))

    expect(screen.getByText('新しいプロジェクトを作成')).toBeInTheDocument()
    expect(screen.getByLabelText('プロジェクト名')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '閉じる' }))

    expect(screen.queryByText('新しいプロジェクトを作成')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'プロジェクトを作成' })).toBeInTheDocument()
  })
})
