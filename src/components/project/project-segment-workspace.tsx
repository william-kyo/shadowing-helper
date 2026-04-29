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
  audioSrc: string
  audioMimeType: string
  audioOriginalName: string
  initialSegments: SegmentListItem[]
}

export function ProjectSegmentWorkspace({
  projectId,
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
      body: JSON.stringify({ minDurationSeconds: 3, maxSegments: 20 }),
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
          body: JSON.stringify(values),
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
        className="inline-flex items-center justify-center rounded-2xl bg-zinc-950 px-6 py-3 text-sm font-medium text-white transition hover:bg-zinc-800"
      >
        セグメントを追加
      </button>
    </div>
  )

  const segmentListSection = (
    <section className="grid gap-4 rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
      <div>
        <h2 className="text-xl font-semibold text-zinc-950">セグメント一覧</h2>
        <p className="mt-2 text-sm text-zinc-600">切り出した学習単位をここに並べます。</p>
      </div>

      {segments.length === 0 ? (
        <p className="text-sm text-zinc-500">まだセグメントはありません。上のフォームから追加してください。</p>
      ) : (
        <ul className="grid gap-3">
          {segments.map((segment) => {
            const { currentStage, allCompleted } = computeCurrentStage(segment.progress)
            return (
            <li key={segment.id} className="flex items-center gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 transition hover:border-indigo-300 hover:bg-indigo-50">
              <Link
                href={`/projects/${projectId}/segments/${segment.id}`}
                className="flex-1"
              >
                <div className="flex items-center gap-2 font-medium text-zinc-950">
                  <span>
                    {segment.index + 1}. {segment.title ?? 'Untitled segment'}
                  </span>
                  {allCompleted ? (
                    <span className="inline-flex items-center gap-1 rounded-full border border-green-200 bg-green-50 px-2 py-0.5 text-xs font-semibold text-green-700">
                      <span aria-hidden>✅</span>
                      完了
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700">
                      Stage {currentStage} 進行中
                    </span>
                  )}
                </div>
                <div className="mt-1 text-sm text-zinc-600">
                  {Math.round((segment.startMs ?? 0) / 1000)}s – {Math.round((segment.endMs ?? 0) / 1000)}s
                </div>
              </Link>
              <button
                onClick={() => handleDeleteSegment(segment.id)}
                className="shrink-0 rounded-xl border border-red-200 bg-white px-3 py-1.5 text-sm font-medium text-red-600 transition hover:border-red-400 hover:bg-red-50"
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
      <section className="grid gap-4 rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
        <div>
          <h2 className="text-xl font-semibold text-zinc-950">元音声</h2>
          <p className="mt-1 text-sm text-zinc-500">{audioOriginalName}</p>
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

      <div className="flex justify-center pt-2">
        <button
          type="button"
          onClick={handleAutoSegment}
          disabled={isAutoSegmenting}
          className="inline-flex items-center justify-center rounded-2xl border border-indigo-200 bg-indigo-50 px-6 py-3 text-sm font-medium text-indigo-700 transition hover:border-indigo-400 hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isAutoSegmenting ? (
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
