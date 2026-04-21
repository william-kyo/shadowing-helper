'use client'

type StageIconProps = {
  stage: number
  status: 'not_started' | 'in_progress' | 'completed'
  onClick?: () => void
}

function StageIcon({ stage, status, onClick }: StageIconProps) {
  const baseClasses =
    'flex h-12 w-12 items-center justify-center rounded-full text-lg font-semibold transition-all cursor-pointer'

  const statusClasses = {
    not_started:
      'border-2 border-zinc-300 bg-white text-zinc-400 hover:border-indigo-400 hover:text-indigo-600',
    in_progress:
      'border-2 border-indigo-400 bg-indigo-50 text-indigo-600 hover:border-indigo-600',
    completed:
      'border-2 border-green-500 bg-green-500 text-white hover:bg-green-600',
  }

  return (
    <button
      onClick={onClick}
      className={`${baseClasses} ${statusClasses[status]}`}
      title={`Stage ${stage}`}
    >
      {status === 'completed' ? (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
          <polyline points="20,6 9,17 4,12" />
        </svg>
      ) : (
        stage
      )}
    </button>
  )
}

type StageProgress = {
  stage: number
  status: 'not_started' | 'in_progress' | 'completed'
}

type StageIconsProps = {
  progress: StageProgress[]
  onStageClick?: (stage: number) => void
}

export function StageIcons({ progress, onStageClick }: StageIconsProps) {
  const sorted = [...progress].sort((a, b) => a.stage - b.stage)

  return (
    <div className="flex items-center gap-3">
      {sorted.map((p) => (
        <StageIcon
          key={p.stage}
          stage={p.stage}
          status={p.status}
          onClick={() => onStageClick?.(p.stage)}
        />
      ))}
    </div>
  )
}
