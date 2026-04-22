import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

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
      findFirst: vi.fn().mockResolvedValue({
        id: 'project-1',
        title: 'NHK lesson 1',
        status: 'draft',
        audioPath: 'storage/projects/project-1/audio/source.wav',
        audioOriginalName: 'source.wav',
        sourceImages: [
          {
            id: 'img-1',
            imagePath: 'storage/projects/project-1/images/page-1.webp',
            originalName: 'page-1.webp',
            sortOrder: 0,
          },
        ],
        segments: [],
      }),
    },
  },
}))

import ProjectDetailPage, { dynamic } from '@/app/projects/[projectId]/page'

describe('ProjectDetailPage', () => {
  it('forces dynamic rendering so newly created segments show up immediately', () => {
    expect(dynamic).toBe('force-dynamic')
  })

  it('renders the project title, source audio player, and manual segment section', async () => {
    render(await ProjectDetailPage({ params: Promise.resolve({ projectId: 'project-1' }) }))

    expect(screen.getByRole('heading', { name: 'NHK lesson 1' })).toBeInTheDocument()
    expect(screen.getByText('手動でセグメントを追加')).toBeInTheDocument()
    expect(screen.getByText('source.wav')).toBeInTheDocument()
    expect(screen.getByText('page-1.webp')).toBeInTheDocument()
    expect(screen.getByLabelText('セグメント名')).toBeInTheDocument()
  })
})
