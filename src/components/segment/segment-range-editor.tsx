'use client'

// Collapsible (default-closed) panel for nudging a segment's audio window.
// AI segmentation occasionally clips a sentence at the boundary; this lets the
// learner widen/shift the start–end and have the server re-cut the audio and
// regenerate the script + stage 4 sentences from the new range.

import { useState } from 'react'
import { useRouter } from 'next/navigation'

type SegmentRangeEditorProps = {
  segmentId: string
  startMs: number | null
  endMs: number | null
  // Total project audio length; caps the end input when known.
  audioDurationMs: number | null
}

const MIN_DURATION_SECONDS = 0.5

function toSecondsInput(ms: number | null): string {
  return ((ms ?? 0) / 1000).toFixed(1)
}

function formatSeconds(value: number): string {
  return `${value.toFixed(1)}s`
}

export function SegmentRangeEditor({
  segmentId,
  startMs,
  endMs,
  audioDurationMs,
}: SegmentRangeEditorProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [start, setStart] = useState(() => toSecondsInput(startMs))
  const [end, setEnd] = useState(() => toSecondsInput(endMs))
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const startNum = Number.parseFloat(start)
  const endNum = Number.parseFloat(end)
  const durationSeconds = audioDurationMs != null ? audioDurationMs / 1000 : null

  const valid =
    Number.isFinite(startNum) &&
    Number.isFinite(endNum) &&
    startNum >= 0 &&
    endNum - startNum >= MIN_DURATION_SECONDS &&
    (durationSeconds == null || endNum <= durationSeconds + 0.001)

  const handleSubmit = async () => {
    if (!valid || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(`/api/segments/${segmentId}/resplit`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          startMs: Math.round(startNum * 1000),
          endMs: Math.round(endNum * 1000),
        }),
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(data.error ?? '再分割に失敗しました。')
      }
      // Server replaced the audio + script; pull the fresh server render.
      router.refresh()
      setOpen(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : '再分割に失敗しました。')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="overflow-hidden rounded-card border border-ink-line bg-paper">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left transition hover:bg-paper-soft"
      >
        <span className="flex items-center gap-2">
          <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-muted">
            音声範囲を調整
          </span>
          <span className="font-mono text-[10px] text-ink-faint">
            {formatSeconds((startMs ?? 0) / 1000)} – {formatSeconds((endMs ?? 0) / 1000)}
          </span>
        </span>
        <span className={`text-ink-faint transition-transform ${open ? 'rotate-180' : ''}`}>⌄</span>
      </button>

      {open ? (
        <div className="grid gap-4 border-t border-ink-line/70 px-4 py-4">
          <p className="text-xs text-ink-muted">
            開始・終了を秒で指定して音声を切り直します。スクリプトは新しい範囲から再生成され、
            <span className="text-ink">ステージ4の採点はリセット</span>されます。
          </p>

          <div className="flex flex-wrap items-end gap-3">
            <label className="grid gap-1">
              <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-muted">
                開始 (秒)
              </span>
              <input
                type="number"
                inputMode="decimal"
                step="0.1"
                min={0}
                value={start}
                onChange={(e) => setStart(e.target.value)}
                className="w-28 rounded-chip border border-ink-line bg-paper px-3 py-2 text-sm text-ink outline-none transition focus:border-accent"
              />
            </label>
            <span className="pb-2 text-ink-faint">–</span>
            <label className="grid gap-1">
              <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-muted">
                終了 (秒)
              </span>
              <input
                type="number"
                inputMode="decimal"
                step="0.1"
                min={0}
                value={end}
                onChange={(e) => setEnd(e.target.value)}
                className="w-28 rounded-chip border border-ink-line bg-paper px-3 py-2 text-sm text-ink outline-none transition focus:border-accent"
              />
            </label>
            {Number.isFinite(startNum) && Number.isFinite(endNum) && endNum > startNum ? (
              <span className="pb-2 font-mono text-[10px] text-ink-faint">
                長さ {formatSeconds(endNum - startNum)}
              </span>
            ) : null}
          </div>

          {durationSeconds != null ? (
            <p className="font-mono text-[10px] text-ink-faint">
              元音声の長さ: {formatSeconds(durationSeconds)}
            </p>
          ) : null}

          {error ? (
            <div className="rounded-inset border border-accent-soft bg-accent-faint px-3 py-2 text-sm text-accent-deep">
              {error}
            </div>
          ) : null}

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!valid || submitting}
              className="rounded-chip bg-accent px-4 py-2 text-sm font-semibold text-paper transition hover:bg-accent-deep disabled:opacity-50"
            >
              {submitting ? '再分割中…' : '再分割して再生成'}
            </button>
            {submitting ? (
              <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-faint">
                音声切り出し + 文字起こし中
              </span>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  )
}
