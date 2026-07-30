import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { OnboardingTour } from '@/components/onboarding/onboarding-tour'
import { I18nProvider } from '@/lib/i18n/client'
import ja from '@/lib/i18n/dictionaries/ja'
import { writeOnboardingState } from '@/lib/onboarding/storage'

// jsdom reports every element as 0x0; give the anchor a real rect so the
// spotlight has something to measure.
function stubAnchorRect() {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
    top: 200,
    left: 100,
    width: 120,
    height: 40,
    right: 220,
    bottom: 240,
    x: 100,
    y: 200,
    toJSON: () => ({}),
  } as DOMRect)
}

function renderWithAnchor(anchor: string, ui: React.ReactNode) {
  return render(
    <I18nProvider locale="ja">
      <button data-tour={anchor} type="button">
        target
      </button>
      {ui}
    </I18nProvider>,
  )
}

describe('OnboardingTour', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    )
    Element.prototype.scrollIntoView = vi.fn()
    writeOnboardingState({ dismissed: [], skipped: false })
    stubAnchorRect()
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('spotlights the stage control with that stage copy', () => {
    renderWithAnchor(
      'stage-status',
      <OnboardingTour surface="segment" isSampleSegment stage={1} stageCompleted={false} />,
    )

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText(ja.tour.stage1Title)).toBeInTheDocument()
    // The stage-1 hint is the one that teaches the complete button.
    expect(screen.getByText(ja.tour.stage1Body)).toBeInTheDocument()
  })

  it('leaves the highlighted control reachable rather than covering it', () => {
    const onClick = vi.fn()
    render(
      <I18nProvider locale="ja">
        <button data-tour="stage-status" type="button" onClick={onClick}>
          target
        </button>
        <OnboardingTour surface="segment" isSampleSegment stage={1} stageCompleted={false} />
      </I18nProvider>,
    )

    // The dim is four panes around a real hole, so the control underneath still
    // takes the tap — the whole point of not using a full-screen overlay.
    fireEvent.click(screen.getByRole('button', { name: 'target' }))
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('renders nothing at all when the anchor is missing', () => {
    // A dimmed screen highlighting nothing would be worse than no hint.
    render(
      <I18nProvider locale="ja">
        <OnboardingTour surface="segment" isSampleSegment stage={1} stageCompleted={false} />
      </I18nProvider>,
    )

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('acknowledging one hint does not silence the next stage', () => {
    const { unmount } = renderWithAnchor(
      'stage-status',
      <OnboardingTour surface="segment" isSampleSegment stage={1} stageCompleted={false} />,
    )

    fireEvent.click(screen.getByRole('button', { name: ja.tour.gotIt }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    unmount()

    renderWithAnchor(
      'stage-status',
      <OnboardingTour surface="segment" isSampleSegment stage={2} stageCompleted={false} />,
    )
    expect(screen.getByText(ja.tour.stage2Title)).toBeInTheDocument()
  })

  it('skipping silences every later hint', () => {
    const { unmount } = renderWithAnchor(
      'stage-status',
      <OnboardingTour surface="segment" isSampleSegment stage={1} stageCompleted={false} />,
    )

    fireEvent.click(screen.getByRole('button', { name: ja.tour.skipAll }))
    unmount()

    renderWithAnchor(
      'stage-status',
      <OnboardingTour surface="segment" isSampleSegment stage={3} stageCompleted={false} />,
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('closes on Escape', () => {
    renderWithAnchor(
      'stage-status',
      <OnboardingTour surface="segment" isSampleSegment stage={1} stageCompleted={false} />,
    )

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('says nothing on the sample once the learner has their own project', () => {
    renderWithAnchor(
      'project-create',
      <OnboardingTour surface="projects" hasOwnProject />,
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('translates the hint into the active locale', () => {
    render(
      <I18nProvider locale="zh">
        <button data-tour="project-create" type="button">
          target
        </button>
        <OnboardingTour surface="projects" hasOwnProject={false} />
      </I18nProvider>,
    )

    expect(screen.getByText('用自己的音频练习')).toBeInTheDocument()
  })
})
