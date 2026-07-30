'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useRef, useState } from 'react'

import { ManualSegmentForm } from '@/components/project/manual-segment-form'
import { useT } from '@/lib/i18n/client'
import { format } from '@/lib/i18n/format'
import { computeCurrentStage, type StageProgress } from '@/lib/stage-progress'

type SegmentListItem = {
  id: string
  index: number
  title: string | null
  startMs: number | null
  endMs: number | null
  progressCount: number
  progress: StageProgress[]
}

type ProjectSegmentWorkspaceProps = {
  projectId: string
  projectStatus: string
  audioSrc: string
  audioMimeType: string
  audioOriginalName: string
  initialSegments: SegmentListItem[]
}

export function ProjectSegmentWorkspace({
  projectId,
  projectStatus,
  audioSrc,
  audioMimeType,
  audioOriginalName,
  initialSegments,
}: ProjectSegmentWorkspaceProps) {
  const router = useRouter()
  const t = useT()
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [segments, setSegments] = useState(initialSegments)
  const [isCreateFormOpen, setIsCreateFormOpen] = useState(initialSegments.length === 0)
  const [isAutoSegmenting, setIsAutoSegmenting] = useState(false)
  // A/B dialogue labeling is the default; the checkbox is an explicit opt-out.
  const [dialogueMode, setDialogueMode] = useState(true)

  function handleDeleteSegment(segmentId: string) {
    const position = segments.findIndex((s) => s.id === segmentId)
    const seg = segments[position]
    if (
      !seg ||
      !confirm(format(t.segments.deleteConfirm, { title: seg.title ?? position + 1 }))
    ) {
      return
    }
    fetch(`/api/segments/${segmentId}`, { method: 'DELETE' })
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          alert(data.error)
        } else {
          setSegments((prev) => prev.filter((s) => s.id !== segmentId))
          router.refresh()
        }
      })
      .catch(() => alert(t.segments.deleteFailed))
  }

  function handleAutoSegment() {
    if (!confirm(t.segments.autoSplitConfirm)) {
      return
    }
    setIsAutoSegmenting(true)
    fetch(`/api/projects/${projectId}/auto-segment`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ minDurationSeconds: 3, maxSegments: 20, dialogue: dialogueMode }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          alert(data.error)
        } else {
          alert(
            data.message ??
              format(t.segments.autoSplitCreated, { count: data.segments?.length ?? 0 }),
          )
          setSegments(data.segments)
          router.refresh()
        }
      })
      .catch(() => alert(t.segments.autoSplitFailed))
      .finally(() => setIsAutoSegmenting(false))
  }

  const createSegmentForm = isCreateFormOpen ? (
    <ManualSegmentForm
      getCurrentTime={() => {
        return audioRef.current?.currentTime ?? 0
      }}
      onCollapse={() => setIsCreateFormOpen(false)}
      onSubmit={async (values) => {
        const response = await fetch(`/api/projects/${projectId}/segments`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ ...values, dialogue: dialogueMode }),
        })

        const result = (await response.json()) as {
          error?: string
          segment?: SegmentListItem
        }

        if (!response.ok || !result.segment) {
          return { error: result.error ?? t.segments.saveFailed }
        }

        const createdSegment = result.segment

        setSegments((current) => [...current, createdSegment].sort((a, b) => a.index - b.index))
        router.refresh()
        return { success: true }
      }}
    />
  ) : (
    <div className="flex justify-center pt-2">
      <button
        type="button"
        onClick={() => setIsCreateFormOpen(true)}
        className="inline-flex items-center justify-center rounded-chip bg-ink px-6 py-3 text-sm font-semibold text-paper transition hover:bg-accent"
      >
        {t.segments.addButton}
      </button>
    </div>
  )

  const segmentListSection = (
    <section className="grid gap-4 rounded-card border border-ink-line bg-paper p-6">
      <div>
        <h2 className="font-display text-2xl font-semibold tracking-tight text-ink">{t.segments.listTitle}</h2>
        <p className="mt-2 text-sm text-ink-muted">{t.segments.listBody}</p>
      </div>

      {segments.length === 0 ? (
        <p className="text-sm text-ink-faint">{t.segments.listEmpty}</p>
      ) : (
        <ul className="grid gap-3">
          {segments.map((segment, position) => {
            const { currentStage, allCompleted } = computeCurrentStage(segment.progress)
            return (
            <li key={segment.id} className="flex items-center gap-3 rounded-inset border border-ink-line bg-paper-soft px-4 py-3 transition hover:border-accent hover:bg-accent-faint">
              <Link
                href={`/projects/${projectId}/segments/${segment.id}`}
                className="flex-1"
              >
                <div className="flex items-center gap-2 font-medium text-ink">
                  <span>
                    {position + 1}. {segment.title ?? t.segments.untitled}
                  </span>
                  {allCompleted ? (
                    <span className="inline-flex items-center gap-1 rounded-chip border border-ink bg-ink px-2 py-0.5 text-xs font-semibold text-paper">
                      <span aria-hidden>✓</span>
                      {t.segments.completed}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-chip border border-accent-soft bg-accent-faint px-2 py-0.5 text-xs font-semibold text-accent-deep">
                      {format(t.segments.stageInProgress, { stage: currentStage })}
                    </span>
                  )}
                </div>
                <div className="mt-1 font-mono text-xs tabular-nums text-ink-muted">
                  {Math.round((segment.startMs ?? 0) / 1000)}s – {Math.round((segment.endMs ?? 0) / 1000)}s
                </div>
              </Link>
              <button
                onClick={() => handleDeleteSegment(segment.id)}
                className="shrink-0 rounded-chip border border-accent-soft bg-paper px-3 py-1.5 text-sm font-medium text-accent transition hover:border-accent hover:bg-accent-faint"
              >
                {t.common.delete}
              </button>
            </li>
            )
          })}
        </ul>
      )}
    </section>
  )

  return (
    <section className="grid gap-6">
      <section className="grid gap-4 rounded-card border border-ink-line bg-paper p-6">
        <div>
          <h2 className="font-display text-2xl font-semibold tracking-tight text-ink">{t.segments.sourceAudioTitle}</h2>
          <p className="mt-1 text-sm text-ink-faint">{audioOriginalName}</p>
        </div>

        <audio
          ref={audioRef}
          controls
          preload="metadata"
          aria-label={t.segments.sourceAudioAria}
          className="w-full"
        >
          <source src={audioSrc} type={audioMimeType} />
        </audio>
      </section>

      {segments.length === 0 ? createSegmentForm : segmentListSection}
      {segments.length === 0 ? segmentListSection : createSegmentForm}

      <div className="flex flex-col items-center gap-3 pt-2">
        <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-muted">
          <input
            type="checkbox"
            checked={dialogueMode}
            onChange={(event) => setDialogueMode(event.target.checked)}
            className="h-4 w-4 accent-accent"
          />
          {t.segments.dialogueMode}
        </label>
        <button
          type="button"
          onClick={handleAutoSegment}
          disabled={isAutoSegmenting || projectStatus === 'segmenting'}
          className="inline-flex items-center justify-center rounded-chip border border-accent-soft bg-accent-faint px-6 py-3 text-sm font-medium text-accent-deep transition hover:border-accent hover:bg-accent-soft disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isAutoSegmenting || projectStatus === 'segmenting' ? (
            <>
              <span className="mr-2 inline-block animate-spin">⟳</span>
              {t.segments.autoSplitRunning}
            </>
          ) : (
            t.segments.autoSplitButton
          )}
        </button>
      </div>
    </section>
  )
}
