'use client'

import { useState } from 'react'

type ManualSegmentFormSubmitResult = {
  success?: boolean
  error?: string
}

type ManualSegmentFormProps = {
  getCurrentTime: () => number
  onSubmit?: (values: { title: string; startSeconds: number; endSeconds: number }) => ManualSegmentFormSubmitResult | Promise<ManualSegmentFormSubmitResult | void> | void
  onCollapse?: () => void
}

function formatSeconds(value: number) {
  return Number(value.toFixed(2))
}

export function ManualSegmentForm({ getCurrentTime, onSubmit, onCollapse }: ManualSegmentFormProps) {
  const [title, setTitle] = useState('')
  const [startSeconds, setStartSeconds] = useState<number | ''>('')
  const [endSeconds, setEndSeconds] = useState<number | ''>('')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const setCurrentTime = (target: 'start' | 'end') => {
    const value = formatSeconds(getCurrentTime())

    if (target === 'start') {
      setStartSeconds(value)
      return
    }

    setEndSeconds(value)
  }

  const handleSave = async () => {
    setErrorMessage(null)

    if (!title.trim()) {
      setErrorMessage('セグメント名を入力してください。')
      return
    }

    if (startSeconds === '' || endSeconds === '') {
      setErrorMessage('開始秒と終了秒を入力してください。')
      return
    }

    if (endSeconds <= startSeconds) {
      setErrorMessage('終了秒は開始秒より後にしてください。')
      return
    }

    try {
      setIsSubmitting(true)

      const result = await onSubmit?.({
        title: title.trim(),
        startSeconds,
        endSeconds,
      })

      if (result?.error) {
        setErrorMessage(result.error)
        return
      }

      setTitle('')
      setStartSeconds('')
      setEndSeconds('')
    } catch {
      setErrorMessage('セグメント保存に失敗しました。')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <section className="grid gap-4 rounded-card border border-ink-line bg-paper p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-semibold tracking-tight text-ink">手動でセグメントを追加</h2>
          <p className="mt-2 text-sm text-ink-muted">
            元音声を再生しながら開始位置と終了位置を決めて、1つずつセグメントを切り出します。
          </p>
        </div>
        {onCollapse ? (
          <button
            type="button"
            onClick={onCollapse}
            className="rounded-chip border border-ink-line bg-paper px-3 py-1.5 text-sm font-medium text-ink-muted transition hover:border-ink hover:text-ink"
          >
            閉じる
          </button>
        ) : null}
      </div>

      <div className="grid gap-2">
        <label className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-muted" htmlFor="segment-title">
          セグメント名
        </label>
        <input
          id="segment-title"
          type="text"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          className="rounded-inset border border-ink-line bg-paper px-4 py-3 text-ink placeholder:text-ink-faint outline-none transition focus:border-ink focus:ring-2 focus:ring-accent/25"
          placeholder="例: Intro / Paragraph 1"
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="grid gap-2">
          <label className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-muted" htmlFor="segment-start-seconds">
            開始秒
          </label>
          <input
            id="segment-start-seconds"
            type="number"
            step="0.01"
            value={startSeconds}
            onChange={(event) => setStartSeconds(Number(event.target.value))}
            className="rounded-inset border border-ink-line bg-paper px-4 py-3 text-ink placeholder:text-ink-faint outline-none transition focus:border-ink focus:ring-2 focus:ring-accent/25"
          />
          <button
            type="button"
            onClick={() => setCurrentTime('start')}
            className="rounded-chip border border-ink-line bg-paper-soft px-4 py-3 text-sm font-medium text-ink transition hover:border-ink"
          >
            現在位置を開始にセット
          </button>
        </div>

        <div className="grid gap-2">
          <label className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-muted" htmlFor="segment-end-seconds">
            終了秒
          </label>
          <input
            id="segment-end-seconds"
            type="number"
            step="0.01"
            value={endSeconds}
            onChange={(event) => setEndSeconds(Number(event.target.value))}
            className="rounded-inset border border-ink-line bg-paper px-4 py-3 text-ink placeholder:text-ink-faint outline-none transition focus:border-ink focus:ring-2 focus:ring-accent/25"
          />
          <button
            type="button"
            onClick={() => setCurrentTime('end')}
            className="rounded-chip border border-ink-line bg-paper-soft px-4 py-3 text-sm font-medium text-ink transition hover:border-ink"
          >
            現在位置を終了にセット
          </button>
        </div>
      </div>

      {errorMessage ? (
        <p className="rounded-inset border border-accent-soft bg-accent-faint px-4 py-3 text-sm text-accent-deep">
          {errorMessage}
        </p>
      ) : null}

      <button
        type="button"
        onClick={() => {
          void handleSave()
        }}
        disabled={isSubmitting}
        className="inline-flex items-center justify-center rounded-chip bg-ink px-5 py-3 text-sm font-semibold text-paper transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isSubmitting ? '保存中…' : 'セグメントを保存'}
      </button>
    </section>
  )
}
