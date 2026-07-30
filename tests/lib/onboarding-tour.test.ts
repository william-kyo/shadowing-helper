// @vitest-environment node
import { describe, expect, it } from 'vitest'

import {
  HINT_ANCHORS,
  TOUR_HINTS,
  resolveActiveHint,
  type TourContext,
} from '@/lib/onboarding/tour'
import {
  EMPTY_ONBOARDING_STATE,
  parseOnboardingState,
} from '@/lib/onboarding/storage'

const base: TourContext = { surface: 'home', dismissed: [], skipped: false }

describe('resolveActiveHint', () => {
  it('offers the sample card to a learner who has seen nothing', () => {
    expect(resolveActiveHint(base)).toBe('home-start')
  })

  it('stays silent once a hint has been acknowledged', () => {
    expect(resolveActiveHint({ ...base, dismissed: ['home-start'] })).toBeNull()
  })

  it('stays silent everywhere once the guide is skipped', () => {
    for (const surface of ['home', 'projects', 'project-detail', 'segment'] as const) {
      expect(
        resolveActiveHint({
          ...base,
          surface,
          skipped: true,
          stage: 1,
          isSampleSegment: true,
          isSampleProject: true,
        }),
      ).toBeNull()
    }
  })

  describe('practice walk-through', () => {
    const segment: TourContext = {
      ...base,
      surface: 'segment',
      isSampleSegment: true,
      stage: 1,
      stageCompleted: false,
    }

    it('points at the current stage, following the auto-advance', () => {
      expect(resolveActiveHint({ ...segment, stage: 1 })).toBe('stage-1')
      expect(resolveActiveHint({ ...segment, stage: 2 })).toBe('stage-2')
      expect(resolveActiveHint({ ...segment, stage: 5 })).toBe('stage-5')
    })

    it('drops the hint once that stage is complete', () => {
      // The learner has just used the control the hint was pointing at, so
      // repeating it would be noise.
      expect(resolveActiveHint({ ...segment, stage: 1, stageCompleted: true })).toBeNull()
    })

    it('never runs over the learner own material', () => {
      expect(resolveActiveHint({ ...segment, isSampleSegment: false })).toBeNull()
    })

    it('shows each stage independently of the others', () => {
      const seenStage1 = { ...segment, dismissed: ['stage-1'] }
      expect(resolveActiveHint({ ...seenStage1, stage: 1 })).toBeNull()
      expect(resolveActiveHint({ ...seenStage1, stage: 2 })).toBe('stage-2')
    })

    it('ignores a stage number outside 1-5', () => {
      expect(resolveActiveHint({ ...segment, stage: 0 })).toBeNull()
      expect(resolveActiveHint({ ...segment, stage: 9 })).toBeNull()
    })
  })

  describe('upload guidance', () => {
    it('nudges on the projects list until the learner owns something', () => {
      expect(resolveActiveHint({ ...base, surface: 'projects', hasOwnProject: false })).toBe(
        'upload-your-own',
      )
      expect(
        resolveActiveHint({ ...base, surface: 'projects', hasOwnProject: true }),
      ).toBeNull()
    })

    it('explains the sample on its own detail page', () => {
      const detail: TourContext = {
        ...base,
        surface: 'project-detail',
        isSampleProject: true,
        hasOwnProject: false,
      }
      expect(resolveActiveHint(detail)).toBe('sample-project')
      // Someone else's project, or a learner who already uploaded, needs nothing.
      expect(resolveActiveHint({ ...detail, isSampleProject: false })).toBeNull()
      expect(resolveActiveHint({ ...detail, hasOwnProject: true })).toBeNull()
    })
  })

  it('has an anchor for every hint it can return', () => {
    for (const hint of TOUR_HINTS) {
      expect(HINT_ANCHORS[hint], hint).toBeTruthy()
    }
  })
})

describe('parseOnboardingState', () => {
  it('reads a stored value back', () => {
    expect(parseOnboardingState('{"dismissed":["stage-1"],"skipped":true}')).toEqual({
      dismissed: ['stage-1'],
      skipped: true,
    })
  })

  it('treats absent, malformed and wrong-shaped values as a fresh start', () => {
    // A corrupt preference must never take the app down.
    for (const raw of [null, '', 'not json', '[]', '{"dismissed":"nope"}', 'null']) {
      expect(parseOnboardingState(raw)).toEqual(EMPTY_ONBOARDING_STATE)
    }
  })

  it('drops non-string entries rather than trusting the array', () => {
    expect(parseOnboardingState('{"dismissed":["ok",1,null],"skipped":"yes"}')).toEqual({
      dismissed: ['ok'],
      skipped: false,
    })
  })
})
