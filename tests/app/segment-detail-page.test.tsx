import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { loadStage4Setup } = vi.hoisted(() => ({ loadStage4Setup: vi.fn() }))

vi.mock('@/lib/stage-4-server', () => ({ loadStage4Setup }))

vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => { throw new Error('NEXT_NOT_FOUND') }),
  useRouter: () => ({ refresh: vi.fn() }),
}))

vi.mock('@/lib/auth', () => ({
  requireAppUser: vi.fn().mockResolvedValue({
    id: 'user-1',
    email: 'owner@example.com',
  }),
}))

const projectFindFirst = vi.fn()
const projectFindMany = vi.fn()
const segmentFindFirst = vi.fn()
const segmentFindMany = vi.fn()

vi.mock('@/lib/db', () => ({
  db: {
    project: {
      findFirst: (...args: unknown[]) => projectFindFirst(...args),
      findMany: (...args: unknown[]) => projectFindMany(...args),
    },
    segment: {
      findFirst: (...args: unknown[]) => segmentFindFirst(...args),
      findMany: (...args: unknown[]) => segmentFindMany(...args),
    },
  },
}))

import SegmentDetailPage, { dynamic } from '@/app/projects/[projectId]/segments/[segmentId]/page'

const BASE_SEGMENT = {
  id: 'seg-1',
  title: 'Intro greeting',
  index: 0,
  startMs: 0,
  endMs: 5000,
  text: 'Hello there.',
  notes: null,
  updatedAt: new Date('2024-01-02'),
  progress: [{ stage: 1, status: 'completed' }],
}

const BASE_PROJECT = { id: 'proj-1', title: 'NHK lesson 1', createdAt: new Date('2024-01-01') }

function setupDefaultMocks() {
  projectFindFirst.mockResolvedValue(BASE_PROJECT)
  // First call: segment detail; subsequent calls: adjacent segments (prev=null, next=null), adjacent projects (null, null)
  segmentFindFirst
    .mockResolvedValueOnce(BASE_SEGMENT)   // main segment
    .mockResolvedValueOnce(null)            // prevSegment (none)
    .mockResolvedValueOnce(null)            // nextSegment (none)
  segmentFindMany.mockResolvedValue([BASE_SEGMENT])
  // adjacent project queries (when no prev/next segment)
  projectFindFirst
    .mockResolvedValueOnce(BASE_PROJECT)    // main project
    .mockResolvedValueOnce(null)            // prevProject
    .mockResolvedValueOnce(null)            // nextProject
  // findNextIncompleteSegment: no later projects to scan
  projectFindMany.mockResolvedValue([])
}

// Stage 4 data is orthogonal to most of these assertions; a segment with no
// prefetched setup is the quiet default. Individual tests override it.
function stubStage4Setup(overrides: Record<string, unknown> = {}) {
  loadStage4Setup.mockResolvedValue({
    sentences: [],
    initialMetadata: null,
    audioMimeType: 'audio/mpeg',
    didBackfill: false,
    speakerChunks: [],
    audioAvailable: true,
    ...overrides,
  })
}

beforeEach(() => {
  loadStage4Setup.mockReset()
  loadStage4Setup.mockResolvedValue(null)
})

afterEach(() => {
  cleanup()
})

describe('SegmentDetailPage', () => {
  it('forces dynamic rendering', () => {
    expect(dynamic).toBe('force-dynamic')
  })

  it('shows a home link pointing to / in the header', async () => {
    setupDefaultMocks()
    render(
      await SegmentDetailPage({
        params: Promise.resolve({ projectId: 'proj-1', segmentId: 'seg-1' }),
      }),
    )

    const homeLink = screen.getByRole('link', { name: 'ホーム' })
    expect(homeLink).toBeInTheDocument()
    expect(homeLink).toHaveAttribute('href', '/')
  })

  it('shows a back-to-project link pointing to /projects/[projectId]', async () => {
    setupDefaultMocks()
    render(
      await SegmentDetailPage({
        params: Promise.resolve({ projectId: 'proj-1', segmentId: 'seg-1' }),
      }),
    )

    const backLink = screen.getByRole('link', { name: /プロジェクトに戻る/ })
    expect(backLink).toBeInTheDocument()
    expect(backLink).toHaveAttribute('href', '/projects/proj-1')
  })

  it('renders the segment title and project breadcrumb', async () => {
    setupDefaultMocks()
    render(
      await SegmentDetailPage({
        params: Promise.resolve({ projectId: 'proj-1', segmentId: 'seg-1' }),
      }),
    )

    expect(screen.getByRole('heading', { name: 'Intro greeting' })).toBeInTheDocument()
    expect(screen.getByText(/NHK lesson 1/)).toBeInTheDocument()
  })

  // A segment row can point at an audio object that isn't in storage (an upload
  // that never ran, or the shared onboarding sample deployed before
  // `npm run example:upload`). The page must degrade, not 500.
  it('explains the missing audio and withholds the player when the object is gone', async () => {
    setupDefaultMocks()
    stubStage4Setup({ audioAvailable: false })

    render(
      await SegmentDetailPage({
        params: Promise.resolve({ projectId: 'proj-1', segmentId: 'seg-1' }),
      }),
    )

    expect(screen.getByText('音声ファイルが見つかりません。')).toBeInTheDocument()
    // The player's scrubber is its only labelled control — absent means the
    // whole dock was withheld rather than offering audio that can't load.
    expect(
      screen.queryByRole('slider', { name: /の再生位置$/ }),
    ).not.toBeInTheDocument()
    // The script and the stage list still render.
    expect(screen.getByRole('heading', { name: 'Intro greeting' })).toBeInTheDocument()
    expect(screen.getByText('ステージ 1–5')).toBeInTheDocument()
  })

  it('renders the player and no warning when the audio is present', async () => {
    setupDefaultMocks()
    stubStage4Setup({ audioAvailable: true })

    render(
      await SegmentDetailPage({
        params: Promise.resolve({ projectId: 'proj-1', segmentId: 'seg-1' }),
      }),
    )

    expect(screen.queryByText('音声ファイルが見つかりません。')).not.toBeInTheDocument()
    expect(screen.getByRole('slider', { name: /の再生位置$/ })).toBeInTheDocument()
  })
})
