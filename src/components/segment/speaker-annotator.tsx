// Stage 1 speaker annotation. Most source recordings are two-person dialogues,
// and stage 5 lets the learner shadow one role at a time — which needs to know
// which timed chunk belongs to whom. An LLM seeds the A/B labels at
// transcription time; this is where the learner corrects them.
//
// Labels are keyed by position in `Segment.whisperSegments`, the same
// granularity the LLM guesses at. Whisper splits on pauses, so its chunks line
// up with conversational turns closely enough to annotate directly.

'use client'

import { useState } from 'react'

import type { Speaker } from '@/lib/sentence-split'

export type SpeakerChunk = {
  text: string
  // Relative to the start of the segment clip — stage 5 turns these into
  // playback-time cues.
  startMs: number
  endMs: number
  speaker: Speaker | null
}

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

const SPEAKER_CHOICES: { value: Speaker | null; label: string; hint: string }[] = [
  { value: 'A', label: 'A', hint: '話者A' },
  { value: 'B', label: 'B', hint: '話者B' },
  { value: null, label: '—', hint: '未設定' },
]

function getChoiceClasses(isActive: boolean, value: Speaker | null) {
  if (!isActive) {
    return 'border-ink-line bg-paper text-ink-faint hover:border-accent hover:text-accent'
  }
  switch (value) {
    case 'A':
      return 'border-accent bg-accent text-paper'
    case 'B':
      return 'border-ink bg-ink text-paper'
    default:
      return 'border-ink-line bg-paper-deep text-paper'
  }
}

type SpeakerAnnotatorProps = {
  segmentId: string
  chunks: SpeakerChunk[]
  onLabelsChange?: (labels: (Speaker | null)[]) => void
}

export function SpeakerAnnotator({ segmentId, chunks, onLabelsChange }: SpeakerAnnotatorProps) {
  const [labels, setLabels] = useState<(Speaker | null)[]>(() =>
    chunks.map((chunk) => chunk.speaker ?? null),
  )
  const [isVisible, setIsVisible] = useState(false)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')

  const labeledCount = labels.filter((label) => label !== null).length

  // Optimistically apply `next`, persisting only the entries named in
  // `changed`; a failed request rolls the whole list back.
  const save = async (next: (Speaker | null)[], changed: number[]) => {
    const previous = labels
    setLabels(next)
    onLabelsChange?.(next)
    setSaveStatus('saving')
    try {
      const res = await fetch(`/api/segments/${segmentId}/speakers`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          labels: changed.map((index) => ({ index, speaker: next[index] ?? null })),
        }),
      })
      if (!res.ok) throw new Error('failed to save speaker labels')
      setSaveStatus('saved')
    } catch {
      setLabels(previous)
      onLabelsChange?.(previous)
      setSaveStatus('error')
    }
  }

  const handleSelect = (index: number, value: Speaker | null) => {
    const next = [...labels]
    next[index] = value
    void save(next, [index])
  }

  // Label every remaining chunk by alternating from the last known speaker —
  // a plain two-person conversation usually just alternates, so this turns the
  // common case into one click plus a few corrections.
  const handleAlternateFill = () => {
    const next = [...labels]
    const changed: number[] = []
    let previousSpeaker: Speaker = 'B'
    next.forEach((label, index) => {
      if (label) {
        previousSpeaker = label
        return
      }
      previousSpeaker = previousSpeaker === 'A' ? 'B' : 'A'
      next[index] = previousSpeaker
      changed.push(index)
    })
    if (changed.length === 0) return
    void save(next, changed)
  }

  if (chunks.length === 0) {
    return null
  }

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <label className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-muted">
          話者ラベル（A / B）
        </label>
        <div className="flex items-center gap-3">
          <span className="font-mono text-[10px] text-ink-faint">
            {labeledCount}/{chunks.length}
          </span>
          <button
            type="button"
            onClick={() => setIsVisible(!isVisible)}
            aria-label={isVisible ? '話者ラベルを非表示' : '話者ラベルを表示'}
            className="text-sm font-medium text-accent underline underline-offset-2 transition hover:text-accent-deep"
          >
            {isVisible ? '非表示' : '表示'}
          </button>
        </div>
      </div>

      {isVisible && (
        <div className="grid gap-2">
          <p className="text-xs leading-relaxed text-ink-muted">
            ステージ5で片方の役だけをシャドーイングするために使います。自動推定を確認して、違うところを直してください。
          </p>

          <div className="grid gap-1.5">
            {chunks.map((chunk, index) => (
              <div
                key={index}
                className="flex items-start gap-2 rounded-inset border border-ink-line bg-paper px-2.5 py-2"
              >
                <div className="flex shrink-0 gap-1">
                  {SPEAKER_CHOICES.map((choice) => {
                    const isActive = labels[index] === choice.value
                    return (
                      <button
                        key={choice.label}
                        type="button"
                        onClick={() => handleSelect(index, choice.value)}
                        aria-label={`${index + 1}行目を${choice.hint}にする`}
                        aria-pressed={isActive}
                        className={`h-7 w-7 rounded-chip border font-mono text-xs font-semibold transition ${getChoiceClasses(isActive, choice.value)}`}
                      >
                        {choice.label}
                      </button>
                    )
                  })}
                </div>
                <p className="min-w-0 flex-1 pt-1 text-sm leading-relaxed text-ink">{chunk.text}</p>
              </div>
            ))}
          </div>

          <div className="flex min-h-[1.5rem] flex-wrap items-center gap-3 text-sm">
            <button
              type="button"
              onClick={handleAlternateFill}
              className="rounded-chip border border-ink-line bg-paper px-3 py-1 text-xs font-medium text-ink-muted transition hover:border-accent hover:text-accent"
            >
              未設定を交互に埋める
            </button>
            {saveStatus === 'saving' && (
              <span className="flex items-center gap-1.5 text-ink-muted">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-ink-faint" />
                保存中…
              </span>
            )}
            {saveStatus === 'saved' && (
              <span className="font-medium text-accent-deep">✓ 保存しました</span>
            )}
            {saveStatus === 'error' && (
              <span className="font-medium text-accent-deep">保存に失敗しました</span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
