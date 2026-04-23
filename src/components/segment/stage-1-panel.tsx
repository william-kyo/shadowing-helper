'use client'

import { useState, useTransition } from 'react'

type Stage1Props = {
  segmentId: string
  initialText: string
  initialNotes: string | null
  stageStatus: 'not_started' | 'in_progress' | 'completed'
  /** 1〜5の現在アクティブなステージに応じてスクリプト表示のデフォルト値が変わる */
  activeStage: number
}

// ステージに応じたスクリプトデフォルト表示: 2,4 は表示(true)、それ以外は非表示(false)
function getDefaultScriptVisible(activeStage: number): boolean {
  return activeStage === 2 || activeStage === 4
}

// ステージ名（日本語）
const STAGE_LABELS: Record<number, string> = {
  1: 'スクリプト確認（聴写）',
  2: 'シャドウ默読',
  3: 'シャドウ跟読',
  4: 'スクリプト付きシャドウ',
  5: '脱稿シャドウ',
}

export function Stage1Panel({
  segmentId,
  initialText,
  initialNotes,
  stageStatus,
  activeStage,
}: Stage1Props) {
  const [text, setText] = useState(initialText)
  const [notes, setNotes] = useState(initialNotes ?? '')
  const [isScriptVisible, setIsScriptVisible] = useState(getDefaultScriptVisible(activeStage))
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
    <div className="rounded-2xl border border-indigo-200 bg-indigo-50/50 p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-indigo-700">Stage {activeStage} — {STAGE_LABELS[activeStage]}</h3>
        <span className="text-xs text-zinc-400">
          {stageStatus === 'completed' ? '✔ 完了' : stageStatus === 'in_progress' ? '◐ 進行中' : '○ 未着手'}
        </span>
      </div>

      <div className="grid gap-3">
        {/* script area */}
        <div>
          <div className="mb-1 flex items-center justify-between">
            <label className="text-sm font-medium text-zinc-700">スクリプト</label>
            <button
              onClick={() => setIsScriptVisible(!isScriptVisible)}
              className="text-sm text-indigo-600 underline underline-offset-2 hover:text-indigo-800"
            >
              {isScriptVisible ? '非表示' : '表示'}
            </button>
          </div>
          {transcribeMsg && (
            <p className="mb-2 text-xs text-indigo-600">{transcribeMsg}</p>
          )}
          {isScriptVisible && (
            <>
              {!initialText && (
                <div className="mb-2">
                  <button
                    onClick={handleTranscribe}
                    disabled={isTranscribing}
                    className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {isTranscribing ? '文字起こし中…' : '自動生成'}
                  </button>
                </div>
              )}
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={6}
                placeholder="スクリプトがここに表示されます。編集して上書き保存できます。"
                className="w-full resize-y rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-800 placeholder:text-zinc-400 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
              />
            </>
          )}
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
    </div>
  )
}
