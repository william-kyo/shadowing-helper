'use client'

import { useState, useTransition } from 'react'

type Stage1Props = {
  segmentId: string
  initialText: string
  initialNotes: string | null
  stageStatus: 'not_started' | 'in_progress' | 'completed'
}

export function Stage1Panel({
  segmentId,
  initialText,
  initialNotes,
  stageStatus,
}: Stage1Props) {
  const [isOpen, setIsOpen] = useState(false)
  const [text, setText] = useState(initialText)
  const [notes, setNotes] = useState(initialNotes ?? '')
  const [isSaving, setIsSaving] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [transcribeMsg, setTranscribeMsg] = useState<string | null>(null)
  const [saveMsg, setSaveMsg] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  const handleTranscribe = async () => {
    setIsTranscribing(true)
    setTranscribeMsg(null)
    try {
      const res = await fetch(`/api/segments/${segmentId}/transcribe`, {
        method: 'POST',
      })
      const data = await res.json()
      if (res.ok) {
        setTranscribeMsg(data.message ?? '文字起こしを開始しました。ページを更新して結果を確認してください。')
      } else {
        setTranscribeMsg(data.error ?? '文字起こしに失敗しました。')
      }
    } finally {
      setIsTranscribing(false)
    }
  }

  const handleSave = async () => {
    setIsSaving(true)
    setSaveMsg(null)
    try {
      const res = await fetch(`/api/segments/${segmentId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text, notes }),
      })
      const data = await res.json()
      if (res.ok) {
        setSaveMsg('保存しました')
      } else {
        setSaveMsg(data.error ?? '保存に失敗しました')
      }
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="rounded-2xl border border-indigo-200 bg-indigo-50/50 p-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-semibold text-indigo-700">Stage 1 — スクリプト確認</h3>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="text-sm text-indigo-600 underline underline-offset-2 hover:text-indigo-800"
        >
          {isOpen ? '非表示' : '表示'}
        </button>
      </div>

      {isOpen && (
        <div className="grid gap-4">
          {/* script area */}
          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="text-sm font-medium text-zinc-700">スクリプト</label>
              {!initialText && (
                <button
                  onClick={handleTranscribe}
                  disabled={isTranscribing}
                  className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-indigo-700 disabled:opacity-50"
                >
                  {isTranscribing ? '文字起こし中…' : '自動生成'}
                </button>
              )}
            </div>
            {transcribeMsg && (
              <p className="mb-2 text-xs text-indigo-600">{transcribeMsg}</p>
            )}
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={6}
              placeholder="スクリプトがここに表示されます。編集して上書き保存できます。"
              className="w-full resize-y rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-800 placeholder:text-zinc-400 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
            />
          </div>

          {/* notes area */}
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700">
              ノート（自分用メモ）
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="発音メモ、意味調べ、わからなかった箇所など..."
              className="w-full resize-y rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-800 placeholder:text-zinc-400 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
            />
          </div>

          {/* save button */}
          <div className="flex items-center gap-3">
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-50"
            >
              {isSaving ? '保存中…' : '保存'}
            </button>
            {saveMsg && (
              <span className="text-sm text-green-600">{saveMsg}</span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
