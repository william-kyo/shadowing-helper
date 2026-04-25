export type StageStatus = 'not_started' | 'in_progress' | 'completed'

export type StageProgress = {
  stage: number
  status: StageStatus
}

export const TOTAL_STAGES = 5

export function computeCurrentStage(progress: StageProgress[]): {
  currentStage: number
  allCompleted: boolean
} {
  const completedStages = new Set(
    progress.filter((p) => p.status === 'completed').map((p) => p.stage),
  )
  const allCompleted = [1, 2, 3, 4, 5].every((s) => completedStages.has(s))
  if (allCompleted) {
    return { currentStage: TOTAL_STAGES, allCompleted: true }
  }

  const inProgress = progress
    .filter((p) => p.status === 'in_progress')
    .sort((a, b) => a.stage - b.stage)[0]
  if (inProgress) {
    return { currentStage: inProgress.stage, allCompleted: false }
  }

  for (let s = 1; s <= TOTAL_STAGES; s++) {
    if (!completedStages.has(s)) {
      return { currentStage: s, allCompleted: false }
    }
  }

  return { currentStage: TOTAL_STAGES, allCompleted: true }
}
