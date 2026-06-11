'use client'

import { useCallback, useEffect, useRef, useState, useTransition, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'

import { Stage1Panel } from '@/components/segment/stage-1-panel'
import { Stage4Panel } from '@/components/segment/stage-4-panel'
import { StageProgressTracker } from '@/components/segment/stage-progress-tracker'
import { computeCurrentStage } from '@/lib/stage-progress'
import type { Stage4Metadata } from '@/lib/stage-4-completion'
import type { Stage4Sentence } from '@/lib/stage-4-server'

type StageStatus = 'not_started' | 'in_progress' | 'completed'

type StageProgress = {
  stage: number
  status: StageStatus
}

// Status cycles forward on each toggle: untouched → active → done → untouched.
const nextStatus: Record<StageStatus, StageStatus> = {
  not_started: 'in_progress',
  in_progress: 'completed',
  completed: 'not_started',
}

// Pure: return progress with `stage` set to `status` (inserting a row if absent).
function applyStatus(
  progress: StageProgress[],
  stage: number,
  status: StageStatus,
): StageProgress[] {
  if (progress.some((item) => item.stage === stage)) {
    return progress.map((item) => (item.stage === stage ? { ...item, status } : item))
  }
  return [...progress, { stage, status }].sort((a, b) => a.stage - b.stage)
}

type SegmentStageWorkspaceProps = {
  segmentId: string
  initialProgress: StageProgress[]
  initialText: string
  initialNotes: string | null
  initialStage: number
  // Where to go once all five stages are completed: the next segment needing
  // work (or the next project's first such segment). Null when nothing is left.
  nextIncompleteHref: string | null
  // Stage 4 inputs — empty array when the segment hasn't been transcribed yet
  // and there's no persisted fallback to show.
  stage4Sentences?: Stage4Sentence[]
  stage4InitialMetadata?: Stage4Metadata | null
  // Fixed bottom audio dock, rendered here so it can be unmounted while Stage 4
  // is active (Stage 4 owns the Space shortcut; the player's would collide).
  bottomDock?: ReactNode
}

export function SegmentStageWorkspace({
  segmentId,
  initialProgress,
  initialText,
  initialNotes,
  initialStage,
  nextIncompleteHref,
  stage4Sentences = [],
  stage4InitialMetadata = null,
  bottomDock,
}: SegmentStageWorkspaceProps) {
  const router = useRouter()
  const [progress, setProgress] = useState<StageProgress[]>(initialProgress)
  // Mirror the latest progress in a ref so async/memoized callbacks (e.g. the
  // stage-4 panel's onComplete) read fresh state instead of a stale closure
  // snapshot, which would otherwise clobber in-session stage completions.
  const progressRef = useRef(progress)
  useEffect(() => {
    progressRef.current = progress
  }, [progress])
  const [selectedStage, setSelectedStage] = useState(initialStage)
  const [segmentText, setSegmentText] = useState(initialText)
  const [segmentNotes, setSegmentNotes] = useState(initialNotes ?? '')
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false)
  const [isCompleting, setIsCompleting] = useState(false)
  const completeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [, startTransition] = useTransition()

  const getStatus = (stage: number): StageStatus => {
    const found = progress.find((item) => item.stage === stage)
    return found?.status ?? 'not_started'
  }

  // All five stages done — acknowledge briefly, then jump to the next target.
  const handleSegmentComplete = () => {
    setIsCompleting(true)
    completeTimer.current = setTimeout(() => {
      router.push(nextIncompleteHref ?? '/')
    }, 900)
  }

  const updateStageStatus = async (stage: number, status: StageStatus) => {
    if (isCompleting) return

    const current = progressRef.current
    const existedBefore = current.some((item) => item.stage === stage)
    const previousStatus = current.find((item) => item.stage === stage)?.status ?? 'not_started'
    const updated = applyStatus(current, stage, status)

    progressRef.current = updated
    startTransition(() => {
      setProgress(updated)
    })

    setIsUpdatingStatus(true)

    try {
      const res = await fetch(`/api/segments/${segmentId}/progress`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ stage, status }),
      })

      if (!res.ok) {
        throw new Error('Failed to update stage status')
      }

      if (status === 'completed') {
        // Completing the last remaining stage finishes the segment — navigate on.
        if (computeCurrentStage(updated).allCompleted) {
          handleSegmentComplete()
          return
        }
        // Otherwise auto-advance to the next stage (unless already on stage 5).
        if (stage < 5) {
          setSelectedStage(stage + 1)
        }
      }
    } catch {
      const reverted = !existedBefore
        ? updated.filter((item) => item.stage !== stage)
        : updated.map((item) =>
            item.stage === stage ? { ...item, status: previousStatus } : item,
          )
      progressRef.current = reverted
      startTransition(() => {
        setProgress(reverted)
      })
    } finally {
      setIsUpdatingStatus(false)
    }
  }

  // Stage 4 owns its own completion flow — when the last sentence passes
  // the panel calls onComplete, which reuses the same status-merge +
  // handleSegmentComplete path as the manual `s` shortcut. Kept identity-stable
  // (empty deps) so the panel's onComplete reference doesn't churn; freshness of
  // progress is guaranteed by progressRef inside updateStageStatus, not by the
  // closure captured here.
  const handleStage4Complete = useCallback(() => {
    void updateStageStatus(4, 'completed')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Press "s" to cycle the selected stage's status — mirrors the audio player's
  // Space / j / k shortcuts and skips while typing in a field. Stage 4 owns
  // its own state machine, so the shortcut is a no-op there.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      const tag = target.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === 's' || e.key === 'S') {
        e.preventDefault()
        if (isUpdatingStatus || isCompleting) return
        if (selectedStage === 4) return
        void updateStageStatus(selectedStage, nextStatus[getStatus(selectedStage)])
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStage, progress, isUpdatingStatus, isCompleting])

  useEffect(() => () => {
    if (completeTimer.current) clearTimeout(completeTimer.current)
  }, [])

  return (
    <>
    <div className="grid gap-6">
      {isCompleting ? (
        <div
          role="status"
          aria-live="polite"
          className="fixed inset-x-0 top-6 z-50 flex justify-center px-4"
        >
          <div className="flex items-center gap-3 rounded-chip border border-accent-soft bg-paper px-5 py-3 shadow-[0_8px_24px_rgba(29,27,24,0.12)] animate-streak-in">
            <span className="flex h-7 w-7 items-center justify-center rounded-chip bg-accent text-sm text-paper">
              ✓
            </span>
            <div className="grid">
              <span className="font-display text-sm font-semibold tracking-tight text-ink">
                セグメント完了
              </span>
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-muted">
                {nextIncompleteHref ? '次のセグメントへ →' : 'すべて完了 →'}
              </span>
            </div>
          </div>
        </div>
      ) : null}

      <section className="overflow-hidden rounded-card border border-ink-line bg-paper px-3 py-4 sm:px-4">
        <div className="flex items-center justify-between gap-2 sm:gap-3">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-muted">ステージ 1–5</h2>
          <StageProgressTracker
            progress={progress}
            selectedStage={selectedStage}
            onStageSelect={setSelectedStage}
          />
        </div>
      </section>

      {selectedStage === 4 ? (
        <Stage4Panel
          segmentId={segmentId}
          sentences={stage4Sentences}
          initialMetadata={stage4InitialMetadata}
          isStatusUpdating={isUpdatingStatus}
          onComplete={handleStage4Complete}
        />
      ) : (
        <Stage1Panel
          segmentId={segmentId}
          initialText={segmentText}
          initialNotes={segmentNotes}
          activeStage={selectedStage}
          stageStatus={getStatus(selectedStage)}
          isStatusUpdating={isUpdatingStatus}
          onStageStatusChange={(status) => updateStageStatus(selectedStage, status)}
          onContentSaved={({ text, notes }) => {
            setSegmentText(text)
            setSegmentNotes(notes ?? '')
          }}
        />
      )}
    </div>

      {/* fixed bottom audio player — always visible for quick mobile playback
          control, but unmounted on Stage 4 so the script-following panel can
          claim Space / Enter without the player toggling playback underneath.
          The nav row below the slider doubles as a buffer against the iOS bottom
          gesture area so the progress bar thumb stays comfortably draggable. */}
      {bottomDock && selectedStage !== 4 ? (
        <div className="glass-player fixed inset-x-0 bottom-0 z-30 border-t border-ink-line/60 shadow-[0_-4px_24px_rgba(29,27,24,0.06)]">
          <div
            className="mx-auto max-w-2xl px-4 pt-3 sm:px-6 sm:pt-4"
            style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 0.5rem)' }}
          >
            {bottomDock}
          </div>
        </div>
      ) : null}
    </>
  )
}
