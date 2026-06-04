'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useRef, useState } from 'react'

import { ManualSegmentForm } from '@/components/project/manual-segment-form'
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
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [segments, setSegments] = useState(initialSegments)
  const [isCreateFormOpen, setIsCreateFormOpen] = useState(initialSegments.length === 0)
  const [isAutoSegmenting, setIsAutoSegmenting] = useState(false)
  const [dialogueMode, setDialogueMode] = useState(false)

  function handleDeleteSegment(segmentId: string) {
    const seg = segments.find((s) => s.id === segmentId)
    if (!seg || !confirm(`セグメント「${seg.title ?? seg.index + 1}」を削除しますか？`)) {
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
      .catch(() => alert('削除に失敗しました。'))
  }

  function handleAutoSegment() {
    if (!confirm('AI が音声を自動分割します。既存のセグメントは削除されません。続行しますか？')) {
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
          alert(data.message ?? `${data.segments?.length ?? 0}件のセグメントを作成しました`)
          setSegments(data.segments)
          router.refresh()
        }
      })
      .catch(() => alert('自動分割に失敗しました。'))
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
          return { error: result.error ?? 'セグメント保存に失敗しました。' }
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
        セグメントを追加
      </button>
    </div>
  )

  const segmentListSection = (
    <section className="grid gap-4 rounded-card border border-ink-line bg-paper p-6">
      <div>
        <h2 className="font-display text-2xl font-semibold tracking-tight text-ink">セグメント一覧</h2>
        <p className="mt-2 text-sm text-ink-muted">切り出した学習単位をここに並べます。</p>
      </div>

      {segments.length === 0 ? (
        <p className="text-sm text-ink-faint">まだセグメントはありません。上のフォームから追加してください。</p>
      ) : (
        <ul className="grid gap-3">
          {segments.map((segment) => {
            const { currentStage, allCompleted } = computeCurrentStage(segment.progress)
            return (
            <li key={segment.id} className="flex items-center gap-3 rounded-inset border border-ink-line bg-paper-soft px-4 py-3 transition hover:border-accent hover:bg-accent-faint">
              <Link
                href={`/projects/${projectId}/segments/${segment.id}`}
                className="flex-1"
              >
                <div className="flex items-center gap-2 font-medium text-ink">
                  <span>
                    {segment.index + 1}. {segment.title ?? 'Untitled segment'}
                  </span>
                  {allCompleted ? (
                    <span className="inline-flex items-center gap-1 rounded-chip border border-ink bg-ink px-2 py-0.5 text-xs font-semibold text-paper">
                      <span aria-hidden>✓</span>
                      完了
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-chip border border-accent-soft bg-accent-faint px-2 py-0.5 text-xs font-semibold text-accent-deep">
                      Stage {currentStage} 進行中
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
                削除
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
          <h2 className="font-display text-2xl font-semibold tracking-tight text-ink">元音声</h2>
          <p className="mt-1 text-sm text-ink-faint">{audioOriginalName}</p>
        </div>

        <audio
          ref={audioRef}
          controls
          preload="metadata"
          aria-label="元音声プレイヤー"
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
          対話モード（話者ごとに A: / B: で改行）
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
              分割中...
            </>
          ) : (
            'AI で自動分割'
          )}
        </button>
      </div>
    </section>
  )
}
