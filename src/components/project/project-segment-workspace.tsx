'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { ManualSegmentForm } from '@/components/project/manual-segment-form'

type SegmentListItem = {
  id: string
  index: number
  title: string | null
  startMs: number | null
  endMs: number | null
  progressCount: number
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
  const [segments, setSegments] = useState(initialSegments)

  return (
    <section className="grid gap-6">
      <section className="grid gap-4 rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
        <div>
          <h2 className="text-xl font-semibold text-zinc-950">元音声</h2>
          <p className="mt-1 text-sm text-zinc-500">{audioOriginalName}</p>
        </div>

        <audio controls preload="metadata" aria-label="元音声プレイヤー" className="w-full">
          <source src={audioSrc} type={audioMimeType} />
        </audio>

        <ManualSegmentForm
          getCurrentTime={() => {
            const audio = document.querySelector('audio[aria-label="元音声プレイヤー"]') as HTMLAudioElement | null
            return audio?.currentTime ?? 0
          }}
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
      </section>

      <section className="grid gap-4 rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
        <div>
          <h2 className="text-xl font-semibold text-zinc-950">セグメント一覧</h2>
          <p className="mt-2 text-sm text-zinc-600">切り出した学習単位をここに並べます。</p>
        </div>

        {segments.length === 0 ? (
          <p className="text-sm text-zinc-500">まだセグメントはありません。上のフォームから追加してください。</p>
        ) : (
          <ul className="grid gap-3">
            {segments.map((segment) => (
              <li key={segment.id}>
                <Link
                  href={`/projects/${projectId}/segments/${segment.id}`}
                  className="flex flex-col rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 transition hover:border-indigo-300 hover:bg-indigo-50"
                >
                  <div className="font-medium text-zinc-950">
                    {segment.index + 1}. {segment.title ?? 'Untitled segment'}
                  </div>
                  <div className="mt-1 text-sm text-zinc-600">
                    {segment.startMs ?? 0}ms - {segment.endMs ?? 0}ms / stage 初期化: {segment.progressCount}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  )
}
