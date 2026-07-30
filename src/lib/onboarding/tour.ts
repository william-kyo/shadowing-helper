// Which onboarding hint to show, derived from where the learner is and what they
// have already done — deliberately not a step counter.
//
// A step pointer desyncs the moment someone refreshes, navigates back, or gets
// auto-advanced, and this app does the last one on every stage completion. Each
// hint instead declares a condition over the current surface plus data we already
// have, so the answer is always recomputed and can never drift. It also makes the
// whole thing a pure function, so it is tested directly rather than through the UI.

export const TOUR_HINTS = [
  'home-start',
  'stage-1',
  'stage-2',
  'stage-3',
  'stage-4',
  'stage-5',
  'upload-your-own',
  'sample-project',
] as const

export type TourHintId = (typeof TOUR_HINTS)[number]

export type TourSurface = 'home' | 'projects' | 'project-detail' | 'segment'

export type TourContext = {
  surface: TourSurface
  // Hints the learner has already acknowledged, plus a global opt-out.
  dismissed: readonly string[]
  skipped: boolean

  // `segment` surface.
  stage?: number
  stageCompleted?: boolean
  // The practice walk-through only runs on the seeded sample, so it never nags
  // over the learner's own material.
  isSampleSegment?: boolean

  // `projects` / `project-detail` surfaces.
  hasOwnProject?: boolean
  isSampleProject?: boolean
}

// `data-tour` value of the element each hint points at. One source of truth, so a
// renamed anchor is a type error rather than a silently dark screen.
export const HINT_ANCHORS: Record<TourHintId, string> = {
  'home-start': 'today-cta',
  'stage-1': 'stage-status',
  'stage-2': 'stage-status',
  'stage-3': 'stage-status',
  // Stage 4 scores itself, so there is no status chip to press — point at the
  // control that actually drives it.
  'stage-4': 'stage4-record',
  'stage-5': 'stage-role-picker',
  'upload-your-own': 'project-create',
  'sample-project': 'sample-project-banner',
}

function isStageHint(stage: number): TourHintId | null {
  switch (stage) {
    case 1:
      return 'stage-1'
    case 2:
      return 'stage-2'
    case 3:
      return 'stage-3'
    case 4:
      return 'stage-4'
    case 5:
      return 'stage-5'
    default:
      return null
  }
}

export function resolveActiveHint(context: TourContext): TourHintId | null {
  if (context.skipped) return null

  const seen = (hint: TourHintId) => context.dismissed.includes(hint)

  switch (context.surface) {
    case 'home':
      return seen('home-start') ? null : 'home-start'

    case 'segment': {
      if (!context.isSampleSegment) return null
      // Once the stage is done the hint has served its purpose; showing it again
      // would be pointing at a control the learner has already used.
      if (context.stageCompleted) return null
      const hint = isStageHint(context.stage ?? 0)
      return hint && !seen(hint) ? hint : null
    }

    case 'projects':
      if (context.hasOwnProject) return null
      return seen('upload-your-own') ? null : 'upload-your-own'

    case 'project-detail':
      if (context.hasOwnProject || !context.isSampleProject) return null
      return seen('sample-project') ? null : 'sample-project'

    default:
      return null
  }
}
