'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { STAGE_META } from '@/lib/stage-meta'

type StageStatus = 'not_started' | 'in_progress' | 'completed'
type SaveStatus = 'idle' | 'unsaved' | 'saving' | 'saved' | 'error'

const AUTOSAVE_DELAY_MS = 1200

type Stage1Props = {
  segmentId: string
  initialText: string
  initialNotes: string | null
  stageStatus: StageStatus
  /** The active stage controls whether the script is shown by default. */
  activeStage: number
  isStatusUpdating: boolean
  onStageStatusChange: (status: StageStatus) => void
  onContentSaved: (content: { text: string; notes: string | null }) => void
}

// Stages 2 and 4 start with the script visible; other stages start hidden.
function getDefaultScriptVisible(activeStage: number): boolean {
  return activeStage === 2 || activeStage === 4
}

const nextStatus: Record<StageStatus, StageStatus> = {
  not_started: 'in_progress',
  in_progress: 'completed',
  completed: 'not_started',
}

function getStatusLabel(status: StageStatus) {
  return status === 'completed'
    ? '✔ 完了'
    : status === 'in_progress'
      ? '◐ 進行中'
      : '○ 未着手'
}

function getStatusChipClasses(status: StageStatus) {
  switch (status) {
    case 'completed':
      return 'border-ink bg-ink text-paper hover:bg-paper-deep'
    case 'in_progress':
      return 'border-accent bg-accent-faint text-accent hover:border-accent-deep'
    default:
      return 'border-ink-line bg-paper text-ink-muted hover:border-accent hover:text-accent'
  }
}

export function Stage1Panel({
  segmentId,
  initialText,
  initialNotes,
  stageStatus,
  activeStage,
  isStatusUpdating,
  onStageStatusChange,
  onContentSaved,
}: Stage1Props) {
  const [text, setText] = useState(initialText)
  const [notes, setNotes] = useState(initialNotes ?? '')
  const [isScriptVisible, setIsScriptVisible] = useState(getDefaultScriptVisible(activeStage))
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [transcribeMsg, setTranscribeMsg] = useState<string | null>(null)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const scriptTextareaRef = useRef<HTMLTextAreaElement | null>(null)
  const [trackedStage, setTrackedStage] = useState(activeStage)

  // Latest values the server is known to hold — guards autosave against firing
  // on mount and against redundant re-saves.
  const lastSavedRef = useRef({ text: initialText, notes: initialNotes ?? '' })
  // Keep the save callback fresh without destabilizing `persist`'s identity.
  const onContentSavedRef = useRef(onContentSaved)
  useEffect(() => {
    onContentSavedRef.current = onContentSaved
  }, [onContentSaved])

  // When switching stages we no longer remount the panel (which used to wipe
  // unsaved script/notes edits). Instead, adjust only the stage-dependent UI
  // during render — the React-recommended alternative to a setState-in-effect:
  // script visibility follows the new stage's default and the transcribe hint clears,
  // while the user's unsaved script/notes (segment-level data) persist.
  if (activeStage !== trackedStage) {
    setTrackedStage(activeStage)
    setIsScriptVisible(getDefaultScriptVisible(activeStage))
    setTranscribeMsg(null)
  }

  const persist = useCallback(
    async (nextText: string, nextNotes: string) => {
      setSaveStatus('saving')
      try {
        const res = await fetch(`/api/segments/${segmentId}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ text: nextText, notes: nextNotes }),
        })
        const data = await res.json()
        if (res.ok) {
          lastSavedRef.current = { text: nextText, notes: nextNotes }
          onContentSavedRef.current({ text: data.text ?? nextText, notes: data.notes ?? null })
          setSaveStatus('saved')
        } else {
          setSaveStatus('error')
        }
      } catch {
        setSaveStatus('error')
      }
    },
    [segmentId],
  )

  // Debounced autosave: persist script/notes a short beat after the last edit.
  useEffect(() => {
    if (text === lastSavedRef.current.text && notes === lastSavedRef.current.notes) {
      return
    }
    const handle = setTimeout(() => {
      void persist(text, notes)
    }, AUTOSAVE_DELAY_MS)
    return () => clearTimeout(handle)
  }, [text, notes, persist])

  useEffect(() => {
    const textarea = scriptTextareaRef.current
    if (!textarea) {
      return
    }

    textarea.style.height = '0px'
    textarea.style.height = `${textarea.scrollHeight}px`
  }, [text, isScriptVisible])

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

  return (
    <div className="rounded-card border border-ink-line bg-paper p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="group relative">
          <h3 className="cursor-default font-display text-base font-semibold tracking-tight text-ink">
            <span className="text-accent">ステージ{activeStage}</span> — {STAGE_META[activeStage]?.label}
          </h3>
          <div className="pointer-events-none absolute left-0 top-full z-10 mt-1.5 hidden w-72 rounded-inset border border-ink-line bg-paper-deep px-3 py-2.5 text-xs leading-relaxed text-paper/85 shadow-lg group-hover:block">
            {STAGE_META[activeStage]?.description}
          </div>
        </div>
        <button
          type="button"
          onClick={() => onStageStatusChange(nextStatus[stageStatus])}
          disabled={isStatusUpdating}
          title="ステータスを更新 (s)"
          className={`rounded-chip border px-3 py-1 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${getStatusChipClasses(stageStatus)}`}
        >
          {isStatusUpdating ? '更新中…' : getStatusLabel(stageStatus)}
        </button>
      </div>

      <div className="grid gap-3">
        {/* script area */}
        <div>
          <div className="mb-1 flex items-center justify-between">
            <label className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-muted">スクリプト</label>
            <button
              onClick={() => setIsScriptVisible(!isScriptVisible)}
              className="text-sm font-medium text-accent underline underline-offset-2 transition hover:text-accent-deep"
            >
              {isScriptVisible ? '非表示' : '表示'}
            </button>
          </div>
          {transcribeMsg && (
            <p className="mb-2 text-xs text-ink-muted">{transcribeMsg}</p>
          )}
          {isScriptVisible && (
            <>
              {!text.trim() && (
                <div className="mb-2">
                  <button
                    type="button"
                    onClick={handleTranscribe}
                    disabled={isTranscribing}
                    className="rounded-chip bg-accent px-3 py-1.5 text-xs font-semibold text-paper transition hover:bg-accent-deep disabled:opacity-50"
                  >
                    {isTranscribing ? '文字起こし中…' : '自動生成'}
                  </button>
                </div>
              )}
              <textarea
                ref={scriptTextareaRef}
                value={text}
                onChange={(e) => { setText(e.target.value); setSaveStatus('unsaved') }}
                rows={6}
                placeholder="スクリプトがここに表示されます。編集して上書き保存できます。"
                className="w-full overflow-hidden rounded-inset border border-ink-line bg-paper px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-ink focus:outline-none focus:ring-2 focus:ring-accent/25"
              />
            </>
          )}
        </div>

        {/* notes area */}
        <div>
          <label className="mb-1 block font-mono text-[10px] uppercase tracking-[0.16em] text-ink-muted">
            ノート（自分用メモ）
          </label>
          <textarea
            value={notes}
            onChange={(e) => { setNotes(e.target.value); setSaveStatus('unsaved') }}
            rows={3}
            placeholder="発音メモ、意味調べ、わからなかった箇所など..."
            className="w-full resize-y rounded-inset border border-ink-line bg-paper px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-ink focus:outline-none focus:ring-2 focus:ring-accent/25"
          />
        </div>

        {/* autosave status */}
        <div className="flex min-h-[1.5rem] items-center gap-2 text-sm">
          {saveStatus === 'saving' && (
            <span className="flex items-center gap-1.5 text-ink-muted">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-ink-faint" />
              保存中…
            </span>
          )}
          {saveStatus === 'saved' && (
            <span className="font-medium text-accent-deep">✓ 自動保存しました</span>
          )}
          {saveStatus === 'unsaved' && (
            <span className="flex items-center gap-1.5 text-ink-faint">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" />
              未保存の変更
            </span>
          )}
          {saveStatus === 'error' && (
            <button
              type="button"
              onClick={() => void persist(text, notes)}
              className="rounded-chip border border-accent-soft bg-accent-faint px-3 py-1 text-xs font-medium text-accent-deep transition hover:border-accent hover:bg-accent-soft"
            >
              保存に失敗 · 再試行
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
