'use client'

import { useState, useTransition } from 'react'

type StageStatus = 'not_started' | 'in_progress' | 'completed'

type StageProgress = {
  stage: number
  status: StageStatus
}

type StageProgressTrackerProps = {
  segmentId: string
  initialProgress: StageProgress[]
}

const STAGES = [1, 2, 3, 4, 5]

const nextStatus: Record<StageStatus, StageStatus> = {
  not_started: 'in_progress',
  in_progress: 'completed',
  completed: 'not_started',
}

function getStatusClasses(status: StageStatus) {
  switch (status) {
    case 'not_started':
      return 'border-2 border-zinc-300 bg-white text-zinc-400 hover:border-indigo-400 hover:text-indigo-600'
    case 'in_progress':
      return 'border-2 border-indigo-400 bg-indigo-50 text-indigo-600 animate-pulse'
    case 'completed':
      return 'border-2 border-green-500 bg-green-500 text-white hover:bg-green-600'
  }
}

export function StageProgressTracker({
  segmentId,
  initialProgress,
}: StageProgressTrackerProps) {
  const [progress, setProgress] = useState<StageProgress[]>(initialProgress)
  const [, startTransition] = useTransition()

  const getStatus = (stage: number): StageStatus => {
    const found = progress.find((p) => p.stage === stage)
    return found?.status ?? 'not_started'
  }

  const handleStageClick = async (stage: number) => {
    const currentStatus = getStatus(stage)
    const newStatus = nextStatus[currentStatus]

    startTransition(() => {
      setProgress((prev) => {
        const exists = prev.find((p) => p.stage === stage)
        if (exists) {
          return prev.map((p) =>
            p.stage === stage ? { ...p, status: newStatus } : p
          )
        }
        return [...prev, { stage, status: newStatus }]
      })
    })

    try {
      const res = await fetch(`/api/segments/${segmentId}/progress`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ stage, status: newStatus }),
      })
      if (!res.ok) {
        startTransition(() => {
          setProgress((prev) => {
            const exists = prev.find((p) => p.stage === stage)
            if (exists) {
              return prev.map((p) =>
                p.stage === stage ? { ...p, status: currentStatus } : p
              )
            }
            return prev.filter((p) => p.stage !== stage)
          })
        })
      }
    } catch {
      startTransition(() => {
        setProgress((prev) => {
          const exists = prev.find((p) => p.stage === stage)
          if (exists) {
            return prev.map((p) =>
              p.stage === stage ? { ...p, status: currentStatus } : p
            )
          }
          return prev.filter((p) => p.stage !== stage)
        })
      })
    }
  }

  return (
    <div className="flex items-center gap-3">
      {STAGES.map((stage) => {
        const status = getStatus(stage)
        return (
          <button
            key={stage}
            onClick={() => handleStageClick(stage)}
            className={`relative flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold transition-all cursor-pointer ${getStatusClasses(status)}`}
            title={`Stage ${stage}: ${status}`}
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
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-indigo-400 opacity-75"></span>
                <span className="relative inline-flex h-3 w-3 rounded-full bg-indigo-500"></span>
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
