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
    <section className="grid gap-4 rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-zinc-950">手動でセグメントを追加</h2>
          <p className="mt-2 text-sm text-zinc-600">
            元音声を再生しながら開始位置と終了位置を決めて、1 つずつ segment を切り出します。
          </p>
        </div>
        {onCollapse ? (
          <button
            type="button"
            onClick={onCollapse}
            className="rounded-2xl border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 transition hover:border-zinc-900 hover:text-zinc-900"
          >
            閉じる
          </button>
        ) : null}
      </div>

      <div className="grid gap-2">
        <label className="text-sm font-medium text-zinc-900" htmlFor="segment-title">
          セグメント名
        </label>
        <input
          id="segment-title"
          type="text"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          className="rounded-2xl border border-zinc-300 px-4 py-3 outline-none transition focus:border-zinc-900"
          placeholder="例: Intro / Paragraph 1"
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="grid gap-2">
          <label className="text-sm font-medium text-zinc-900" htmlFor="segment-start-seconds">
            開始秒
          </label>
          <input
            id="segment-start-seconds"
            type="number"
            step="0.01"
            value={startSeconds}
            onChange={(event) => setStartSeconds(Number(event.target.value))}
            className="rounded-2xl border border-zinc-300 px-4 py-3 outline-none transition focus:border-zinc-900"
          />
          <button
            type="button"
            onClick={() => setCurrentTime('start')}
            className="rounded-2xl border border-zinc-300 bg-zinc-50 px-4 py-3 text-sm font-medium text-zinc-900 transition hover:border-zinc-900"
          >
            現在位置を開始にセット
          </button>
        </div>

        <div className="grid gap-2">
          <label className="text-sm font-medium text-zinc-900" htmlFor="segment-end-seconds">
            終了秒
          </label>
          <input
            id="segment-end-seconds"
            type="number"
            step="0.01"
            value={endSeconds}
            onChange={(event) => setEndSeconds(Number(event.target.value))}
            className="rounded-2xl border border-zinc-300 px-4 py-3 outline-none transition focus:border-zinc-900"
          />
          <button
            type="button"
            onClick={() => setCurrentTime('end')}
            className="rounded-2xl border border-zinc-300 bg-zinc-50 px-4 py-3 text-sm font-medium text-zinc-900 transition hover:border-zinc-900"
          >
            現在位置を終了にセット
          </button>
        </div>
      </div>

      {errorMessage ? (
        <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </p>
      ) : null}

      <button
        type="button"
        onClick={() => {
          void handleSave()
        }}
        disabled={isSubmitting}
        className="inline-flex items-center justify-center rounded-2xl bg-zinc-950 px-5 py-3 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-500"
      >
        {isSubmitting ? '保存中…' : 'セグメントを保存'}
      </button>
    </section>
  )
}
