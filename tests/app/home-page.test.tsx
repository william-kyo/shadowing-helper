import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({
  redirect: vi.fn((path: string) => {
    const err = new Error(`NEXT_REDIRECT:${path}`)
    ;(err as Error & { digest?: string }).digest = `NEXT_REDIRECT;replace;${path};307;`
    throw err
  }),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
}))

const getCurrentAppUserMock = vi.fn()
vi.mock('@/lib/auth', () => ({
  getCurrentAppUser: (...args: unknown[]) => getCurrentAppUserMock(...args),
}))

const stageProgressFindMany = vi.fn()
const segmentFindMany = vi.fn()
const projectFindFirst = vi.fn()
vi.mock('@/lib/db', () => ({
  db: {
    stageProgress: { findMany: (...args: unknown[]) => stageProgressFindMany(...args) },
    segment: { findMany: (...args: unknown[]) => segmentFindMany(...args) },
    project: { findFirst: (...args: unknown[]) => projectFindFirst(...args) },
  },
}))

import HomePage from '@/app/page'
import { redirect } from 'next/navigation'

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  cleanup()
})

describe('HomePage – anonymous', () => {
  it('redirects anonymous users to login', async () => {
    getCurrentAppUserMock.mockResolvedValue(null)
    await expect(HomePage()).rejects.toThrow(/NEXT_REDIRECT/)
    expect(redirect).toHaveBeenCalledWith('/login')
  })
})

describe('HomePage – authenticated', () => {
  beforeEach(() => {
    getCurrentAppUserMock.mockResolvedValue({
      id: 'user-1',
      email: 'tester@example.com',
    })
  })

  it('renders streak hero, today CTA, and recent practice list with deep links', async () => {
    const today = new Date()
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000)

    stageProgressFindMany.mockResolvedValue([
      { updatedAt: today, segmentId: 'seg-1' },
      { updatedAt: yesterday, segmentId: 'seg-2' },
    ])
    segmentFindMany.mockResolvedValue([
      {
        id: 'seg-1',
        title: 'Intro greeting',
        index: 0,
        progress: [
          { stage: 1, status: 'completed' },
          { stage: 2, status: 'completed' },
          { stage: 3, status: 'in_progress' },
        ],
        project: { id: 'proj-1', title: 'NHK lesson 1' },
      },
      {
        id: 'seg-2',
        title: 'Self introduction',
        index: 1,
        progress: [{ stage: 1, status: 'completed' }],
        project: { id: 'proj-1', title: 'NHK lesson 1' },
      },
    ])

    render(await HomePage())

    expect(screen.getByText('21日チャレンジ')).toBeInTheDocument()
    expect(screen.getByText('tester@example.com')).toBeInTheDocument()

    const todaySection = screen.getByLabelText('今日のおすすめ')
    expect(within(todaySection).getByText('Intro greeting')).toBeInTheDocument()
    expect(within(todaySection).getByText('NHK lesson 1')).toBeInTheDocument()
    const cta = within(todaySection).getByRole('link', {
      name: /Intro greeting の練習を始める/,
    })
    expect(cta).toHaveAttribute('href', '/projects/proj-1/segments/seg-1')

    const recentSection = screen.getByLabelText('最近の練習')
    const recentLinks = within(recentSection).getAllByRole('link')
    expect(recentLinks.length).toBeGreaterThanOrEqual(2)
    expect(recentLinks[1]).toHaveAttribute('href', '/projects/proj-1/segments/seg-1')

    expect(screen.getByText(/今週の記録/)).toBeInTheDocument()
  })

  it('falls back to a project segment when no in-progress activity exists', async () => {
    stageProgressFindMany.mockResolvedValue([])
    segmentFindMany.mockResolvedValue([])
    projectFindFirst.mockResolvedValue({
      id: 'proj-9',
      title: 'TED talk',
      segments: [
        {
          id: 'seg-9',
          title: 'Opening',
          index: 0,
          progress: [],
          project: { id: 'proj-9', title: 'TED talk' },
        },
      ],
    })

    render(await HomePage())

    const cta = screen.getByRole('link', { name: /Opening の練習を始める/ })
    expect(cta).toHaveAttribute('href', '/projects/proj-9/segments/seg-9')
  })

  it('shows the empty state CTA when the user has no projects yet', async () => {
    stageProgressFindMany.mockResolvedValue([])
    segmentFindMany.mockResolvedValue([])
    projectFindFirst.mockResolvedValue(null)

    render(await HomePage())

    expect(screen.getByText('今日の課題はまだありません')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /プロジェクトを追加/ })).toHaveAttribute(
      'href',
      '/projects',
    )
  })
})
