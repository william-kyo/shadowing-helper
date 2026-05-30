'use client'

import { STAGE_META } from '@/lib/stage-meta'

type StageStatus = 'not_started' | 'in_progress' | 'completed'

type StageProgress = {
  stage: number
  status: StageStatus
}

type StageProgressTrackerProps = {
  progress: StageProgress[]
  selectedStage: number
  onStageSelect: (stage: number) => void
}

const STAGES = [1, 2, 3, 4, 5]

function getStatusClasses(status: StageStatus) {
  switch (status) {
    case 'not_started':
      return 'border-2 border-ink-line bg-paper text-ink-faint hover:border-accent hover:text-accent'
    case 'in_progress':
      return 'border-2 border-accent bg-accent-faint text-accent'
    case 'completed':
      return 'border-2 border-ink bg-ink text-paper hover:bg-paper-deep'
  }
}

export function StageProgressTracker({
  progress,
  selectedStage,
  onStageSelect,
}: StageProgressTrackerProps) {
  const getStatus = (stage: number): StageStatus => {
    const found = progress.find((p) => p.stage === stage)
    return found?.status ?? 'not_started'
  }

  return (
    <div className="flex items-center gap-2 sm:gap-3">
      {STAGES.map((stage) => {
        const status = getStatus(stage)
        const isSelected = selectedStage === stage
        return (
          <button
            key={stage}
            type="button"
            onClick={() => onStageSelect(stage)}
            aria-pressed={isSelected}
            className={`relative flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold transition-all cursor-pointer sm:h-9 sm:w-9 ${getStatusClasses(status)} ${isSelected ? 'ring-2 ring-accent/30 ring-offset-2 ring-offset-paper' : ''}`}
            title={`Stage ${stage} ${STAGE_META[stage]?.label ?? ''}`}
          >
            {status === 'completed' ? (
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
              >
                <polyline points="20,6 9,17 4,12" />
              </svg>
            ) : status === 'in_progress' ? (
              <span className="relative flex h-3 w-3">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-60"></span>
                <span className="relative inline-flex h-3 w-3 rounded-full bg-accent"></span>
              </span>
            ) : (
              stage
            )}
          </button>
        )
      })}
    </div>
  )
}
