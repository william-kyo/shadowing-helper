'use client'

import { useRef } from 'react'

import { ManualSegmentForm } from '@/components/project/manual-segment-form'

type ProjectAudioWorkspaceProps = {
  audioSrc: string
  audioMimeType: string
  audioOriginalName: string
}

export function ProjectAudioWorkspace({
  audioSrc,
  audioMimeType,
  audioOriginalName,
}: ProjectAudioWorkspaceProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null)

  return (
    <section className="grid gap-4 rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
      <div>
        <h2 className="text-xl font-semibold text-zinc-950">元音声</h2>
        <p className="mt-1 text-sm text-zinc-500">{audioOriginalName}</p>
      </div>

      <audio ref={audioRef} controls preload="metadata" aria-label="元音声プレイヤー" className="w-full">
        <source src={audioSrc} type={audioMimeType} />
      </audio>

      <ManualSegmentForm getCurrentTime={() => audioRef.current?.currentTime ?? 0} />
    </section>
  )
}
