'use client'

import { useState, useTransition } from 'react'

import { Stage1Panel } from '@/components/segment/stage-1-panel'
import { StageProgressTracker } from '@/components/segment/stage-progress-tracker'

type StageStatus = 'not_started' | 'in_progress' | 'completed'

type StageProgress = {
  stage: number
  status: StageStatus
}

type SegmentStageWorkspaceProps = {
  segmentId: string
  initialProgress: StageProgress[]
  initialText: string
  initialNotes: string | null
  initialStage: number
}

export function SegmentStageWorkspace({
  segmentId,
  initialProgress,
  initialText,
  initialNotes,
  initialStage,
}: SegmentStageWorkspaceProps) {
  const [progress, setProgress] = useState<StageProgress[]>(initialProgress)
  const [selectedStage, setSelectedStage] = useState(initialStage)
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false)
  const [, startTransition] = useTransition()

  const getStatus = (stage: number): StageStatus => {
    const found = progress.find((item) => item.stage === stage)
    return found?.status ?? 'not_started'
  }

  const updateStageStatus = async (stage: number, nextStatus: StageStatus) => {
    const previousStatus = getStatus(stage)

    startTransition(() => {
      setProgress((prev) => {
        const exists = prev.find((item) => item.stage === stage)
        if (exists) {
          return prev.map((item) =>
            item.stage === stage ? { ...item, status: nextStatus } : item,
          )
        }

        return [...prev, { stage, status: nextStatus }].sort((a, b) => a.stage - b.stage)
      })
    })

    setIsUpdatingStatus(true)

    try {
      const res = await fetch(`/api/segments/${segmentId}/progress`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ stage, status: nextStatus }),
      })

      if (!res.ok) {
        throw new Error('Failed to update stage status')
      }
    } catch {
      startTransition(() => {
        setProgress((prev) => {
          const exists = prev.find((item) => item.stage === stage)
          if (exists) {
            return prev.map((item) =>
              item.stage === stage ? { ...item, status: previousStatus } : item,
            )
          }

          return prev.filter((item) => item.stage !== stage)
        })
      })
    } finally {
      setIsUpdatingStatus(false)
    }
  }

  return (
    <div className="grid gap-6">
      <section className="rounded-3xl border border-black/10 bg-white px-4 py-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-zinc-500">Stage 1–5</h2>
          <StageProgressTracker
            progress={progress}
            selectedStage={selectedStage}
            onStageSelect={setSelectedStage}
          />
        </div>
      </section>

      <Stage1Panel
        key={selectedStage}
        segmentId={segmentId}
        initialText={initialText}
        initialNotes={initialNotes}
        activeStage={selectedStage}
        stageStatus={getStatus(selectedStage)}
        isStatusUpdating={isUpdatingStatus}
        onStageStatusChange={(nextStatus) => updateStageStatus(selectedStage, nextStatus)}
      />
    </div>
  )
}
