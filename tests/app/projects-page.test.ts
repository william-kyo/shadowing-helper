import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

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
        },
      ]),
    },
  },
}))

import ProjectsPage, * as ProjectsPageModule from '@/app/projects/page'

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
})
