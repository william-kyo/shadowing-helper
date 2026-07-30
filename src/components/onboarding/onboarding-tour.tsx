'use client'

// Renders whichever onboarding hint the current surface calls for.
//
// Mounted by each surface with the facts that surface knows (which stage, whether
// the learner owns a project). It resolves the hint through `resolveActiveHint`,
// so the decision stays in one tested pure function and this component only deals
// with storage and rendering.

import { useCallback, useSyncExternalStore } from 'react'

import { Spotlight } from '@/components/onboarding/spotlight'
import { useT } from '@/lib/i18n/client'
import type { Dictionary } from '@/lib/i18n/dictionaries'
import {
  getOnboardingServerSnapshot,
  getOnboardingSnapshot,
  subscribeToOnboardingState,
  writeOnboardingState,
  type OnboardingState,
} from '@/lib/onboarding/storage'
import {
  HINT_ANCHORS,
  resolveActiveHint,
  type TourContext,
  type TourHintId,
} from '@/lib/onboarding/tour'

type OnboardingTourProps = Omit<TourContext, 'dismissed' | 'skipped'>

const HINT_COPY: Record<TourHintId, (t: Dictionary) => { title: string; body: string }> = {
  'home-start': (t) => ({ title: t.tour.homeStartTitle, body: t.tour.homeStartBody }),
  'stage-1': (t) => ({ title: t.tour.stage1Title, body: t.tour.stage1Body }),
  'stage-2': (t) => ({ title: t.tour.stage2Title, body: t.tour.stage2Body }),
  'stage-3': (t) => ({ title: t.tour.stage3Title, body: t.tour.stage3Body }),
  'stage-4': (t) => ({ title: t.tour.stage4Title, body: t.tour.stage4Body }),
  'stage-5': (t) => ({ title: t.tour.stage5Title, body: t.tour.stage5Body }),
  'upload-your-own': (t) => ({ title: t.tour.uploadTitle, body: t.tour.uploadBody }),
  'sample-project': (t) => ({ title: t.tour.sampleProjectTitle, body: t.tour.sampleProjectBody }),
}

export function OnboardingTour(props: OnboardingTourProps) {
  const t = useT()
  const state = useSyncExternalStore(
    subscribeToOnboardingState,
    getOnboardingSnapshot,
    getOnboardingServerSnapshot,
  )
  // Nothing is highlighted until the client is running: the server cannot read
  // the dismissal state, and a spotlight rendered on the server would point at a
  // rect it has no way to measure.
  const isClient = useSyncExternalStore(
    subscribeToOnboardingState,
    () => true,
    () => false,
  )

  const persist = useCallback((next: OnboardingState) => {
    writeOnboardingState(next)
  }, [])

  const hint = isClient
    ? resolveActiveHint({ ...props, dismissed: state.dismissed, skipped: state.skipped })
    : null

  const dismiss = useCallback(() => {
    if (!hint) return
    persist({ ...state, dismissed: [...new Set([...state.dismissed, hint])] })
  }, [hint, persist, state])

  const skipAll = useCallback(() => {
    persist({ ...state, skipped: true })
  }, [persist, state])

  if (!hint) return null

  const copy = HINT_COPY[hint](t)

  return (
    <Spotlight
      anchor={HINT_ANCHORS[hint]}
      title={copy.title}
      body={copy.body}
      confirmLabel={t.tour.gotIt}
      skipLabel={t.tour.skipAll}
      onConfirm={dismiss}
      onSkip={skipAll}
    />
  )
}
