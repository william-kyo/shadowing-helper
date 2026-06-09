'use client'

// Stage 4 panel: script-following shadowing with per-sentence listen-then-
// read flow. State machine walks `idle → ready → playingRef → recording →
// uploading → result → (next | completed)`. On `result` with stageComplete,
// the parent workspace's stage 4 status flips to "completed" via onComplete
// and the auto-advance kicks in (segment-stage-workspace.tsx:102-112).
//
// The "listen-then-speak" model: tapping the primary CTA grants mic access
// (single user gesture requirement on iOS), then plays the reference clip
// for the current sentence, then auto-starts the recorder when the clip
// ends. The user taps "停止" to finalize their take (or the 30s cap fires).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type React from 'react'

import { useShadowingRecorder, type RecordingResult } from '@/hooks/use-shadowing-recorder'
import { STAGE_META } from '@/lib/stage-meta'
import type { Stage4Metadata, SentenceScore } from '@/lib/stage-4-completion'

type Sentence = {
  index: number
  text: string
  startMs: number
  endMs: number
  refAudioUrl: string
}

type Phase =
  | 'idle'
  | 'ready'
  | 'playingRef'
  | 'recording'
  | 'uploading'
  | 'result'
  | 'completed'

type ResultPayload = {
  score: number
  pass: boolean
  transcript: string
  expected: string
  stageComplete: boolean
  passingSentences: number
  totalSentences: number
  threshold: number
}

type Stage4PanelProps = {
  segmentId: string
  sentences: Sentence[]
  initialMetadata: Stage4Metadata | null
  onComplete: () => void
  isStatusUpdating: boolean
}

const NEXT_SENTENCE_DELAY_MS = 900

function formatMs(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

// Tiny keycap badge appended to a control to advertise its keyboard shortcut.
// `tone` matches the host button: "light" for solid accent buttons (pale text),
// "dark" for outlined paper buttons.
function KeyHint({ label, tone = 'light' }: { label: string; tone?: 'light' | 'dark' }) {
  return (
    <kbd
      aria-hidden
      className={[
        'ml-2 inline-block rounded border px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase leading-none tracking-wide',
        tone === 'light' ? 'border-paper/40 text-paper/80' : 'border-ink-line text-ink-faint',
      ].join(' ')}
    >
      {label}
    </kbd>
  )
}

function describeState(score: SentenceScore) {
  return {
    bestScore: score.score,
    attempts: score.attempts,
    passedAt: score.passedAt,
  }
}

export function Stage4Panel({
  segmentId,
  sentences,
  initialMetadata,
  onComplete,
  isStatusUpdating,
}: Stage4PanelProps) {
  const recorder = useShadowingRecorder()
  const refAudioRef = useRef<HTMLAudioElement | null>(null)
  const stopRecordingPromiseRef = useRef<Promise<RecordingResult | undefined> | null>(null)
  const advanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Touch-start position for horizontal swipe detection on the sentence card.
  const touchStartRef = useRef<{ x: number; y: number } | null>(null)

  const [phase, setPhase] = useState<Phase>('idle')
  const [sentenceIndex, setSentenceIndex] = useState(() => {
    if (!initialMetadata) return 0
    // Resume on the first sentence that hasn't passed yet.
    const passedIndices = new Set(
      initialMetadata.sentences.filter((s) => s.score >= 0.8).map((s) => s.index),
    )
    for (let i = 0; i < sentences.length; i++) {
      if (!passedIndices.has(i)) return i
    }
    return Math.max(0, sentences.length - 1)
  })
  const [metadata, setMetadata] = useState<Stage4Metadata>(
    initialMetadata ?? { sentences: [] },
  )
  const [result, setResult] = useState<ResultPayload | null>(null)
  const [error, setError] = useState<string | null>(null)

  const currentSentence = sentences[sentenceIndex] ?? null
  const totalSentences = sentences.length
  const sentenceSummary = useMemo(() => {
    const map = new Map<number, ReturnType<typeof describeState>>()
    metadata.sentences.forEach((s) => map.set(s.index, describeState(s)))
    return map
  }, [metadata])

  const clearAdvanceTimer = useCallback(() => {
    if (advanceTimerRef.current) {
      clearTimeout(advanceTimerRef.current)
      advanceTimerRef.current = null
    }
  }, [])

  useEffect(() => () => clearAdvanceTimer(), [clearAdvanceTimer])

  const handleStartPractice = useCallback(async () => {
    if (!currentSentence) return
    setError(null)
    setResult(null)
    clearAdvanceTimer()

    const audio = refAudioRef.current
    if (!audio) {
      setError('お手本を読み込めませんでした。')
      setPhase('ready')
      return
    }

    // iOS Safari only honours getUserMedia and HTMLMediaElement.play() while
    // the tap's transient user-activation is live — and that activation is
    // gone the instant we `await` anything. So both native calls must be
    // *initiated* synchronously here, before yielding: start playback first,
    // then the mic permission, and only await afterwards. Awaiting permission
    // before play() (the previous order) is exactly what made iOS reject the
    // reference clip, so onEnded never fired and recording never auto-started.
    // The clip runs for a few seconds, covering the permission round-trip; the
    // recorder itself is started later from the audio's onEnded handler.
    setPhase('playingRef')
    audio.currentTime = 0
    const playPromise = audio.play()
    const permissionPromise =
      recorder.phase === 'ready' ? Promise.resolve() : recorder.requestPermission()

    try {
      await playPromise
    } catch {
      // Autoplay refused even inside the gesture (rare) — surface it instead of
      // silently stalling, and drop back to ready so the learner can retry or
      // record manually.
      setError('お手本を再生できませんでした。「もう一度聴く」を押してください。')
      setPhase('ready')
    }

    // Ensure the mic stream is live before onEnded fires the recorder.
    await permissionPromise
  }, [currentSentence, recorder, clearAdvanceTimer])

  const handleStartRecording = useCallback(() => {
    // Allowed from `ready` (manual "復唱する" click) and `playingRef`
    // (auto-fired from the ref audio's `ended` event). Anything else is a
    // stray click and we ignore it.
    if (phase !== 'ready' && phase !== 'playingRef') return
    setPhase('recording')
    const stopPromise = recorder.startRecording()
    stopRecordingPromiseRef.current = stopPromise ?? null
  }, [phase, recorder])

  const handleRefAudioEnded = useCallback(() => {
    // Only auto-start recording when the clip was initiated by handleStartPractice
    // (which sets phase to 'playingRef'). Plain card-tap replays leave phase as
    // 'ready' or 'result', so we do nothing there.
    if (phase !== 'playingRef') return
    handleStartRecording()
  }, [phase, handleStartRecording])

  const submitRecording = useCallback(
    async (result: RecordingResult) => {
      const { blob } = result
      stopRecordingPromiseRef.current = null
      const payload = new FormData()
      payload.set('sentenceIndex', String(sentenceIndex))
      const extension = blob.type.includes('mp4') ? 'mp4' : 'webm'
      payload.set('audio', new File([blob], `recording.${extension}`, { type: blob.type }))

      const res = await fetch(`/api/segments/${segmentId}/stage4/recordings`, {
        method: 'POST',
        body: payload,
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(data.error ?? '採点に失敗しました。')
      }
      const data = (await res.json()) as ResultPayload
      setResult(data)

      setMetadata((prev) => {
        const existing = prev.sentences.find((s) => s.index === sentenceIndex)
        const attempts = (existing?.attempts ?? 0) + 1
        const score = existing ? Math.max(existing.score, data.score) : data.score
        const transcript = existing && existing.score >= data.score ? existing.transcript : data.transcript
        const passedAt =
          existing?.passedAt ?? (data.score >= data.threshold ? new Date().toISOString() : null)
        const next: SentenceScore = { index: sentenceIndex, score, transcript, attempts, passedAt }
        const others = prev.sentences.filter((s) => s.index !== sentenceIndex)
        return { sentences: [...others, next].sort((a, b) => a.index - b.index) }
      })

      if (data.stageComplete) {
        setPhase('completed')
        onComplete()
      } else {
        setPhase('result')
      }
    },
    [sentenceIndex, segmentId, onComplete],
  )

  const handleStop = useCallback(async () => {
    if (phase !== 'recording') return
    recorder.stopRecording()
    const stopPromise = stopRecordingPromiseRef.current
    if (!stopPromise) {
      setError('録音を停止できませんでした。')
      return
    }
    setPhase('uploading')
    try {
      const result = await stopPromise
      if (!result) {
        setError('録音を保存できませんでした。')
        setPhase('ready')
        return
      }
      await submitRecording(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : '採点に失敗しました。')
      setPhase('ready')
    }
  }, [phase, recorder, submitRecording])

  const advanceToNext = useCallback(() => {
    if (sentenceIndex + 1 >= totalSentences) {
      // Last sentence + pass should already have flipped to 'completed' via
      // stageComplete from the server. Defensive fallback in case the server
      // disagrees.
      setPhase('completed')
      onComplete()
      return
    }
    setSentenceIndex((i) => i + 1)
    setResult(null)
    setPhase('ready')
  }, [sentenceIndex, totalSentences, onComplete])

  const handleRetry = useCallback(() => {
    clearAdvanceTimer()
    setResult(null)
    setPhase('ready')
  }, [clearAdvanceTimer])

  const handleNext = useCallback(() => {
    clearAdvanceTimer()
    advanceToNext()
  }, [clearAdvanceTimer, advanceToNext])

  // Auto-advance after a successful pass: show the score briefly, then move on.
  useEffect(() => {
    if (phase !== 'result' || !result?.pass) return
    clearAdvanceTimer()
    advanceTimerRef.current = setTimeout(() => {
      advanceToNext()
    }, NEXT_SENTENCE_DELAY_MS)
    return () => clearAdvanceTimer()
  }, [phase, result, advanceToNext, clearAdvanceTimer])

  const handleSkip = useCallback(async () => {
    clearAdvanceTimer()
    try {
      const res = await fetch(`/api/segments/${segmentId}/stage4/complete`, { method: 'POST' })
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(data.error ?? 'スキップに失敗しました。')
      }
      setPhase('completed')
      onComplete()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'スキップに失敗しました。')
    }
  }, [segmentId, onComplete, clearAdvanceTimer])

  // Navigate to the previous sentence (idle / ready / result phases only).
  const handlePrev = useCallback(() => {
    if (phase !== 'idle' && phase !== 'ready' && phase !== 'result') return
    if (sentenceIndex <= 0) return
    const audio = refAudioRef.current
    if (audio && !audio.paused) { audio.pause(); audio.currentTime = 0 }
    clearAdvanceTimer()
    setSentenceIndex((i) => i - 1)
    setResult(null)
    setError(null)
    setPhase(phase === 'idle' ? 'idle' : 'ready')
  }, [phase, sentenceIndex, clearAdvanceTimer])

  // Navigate to the next sentence without completing the stage (arrows / swipe).
  const handleNavNext = useCallback(() => {
    if (phase !== 'idle' && phase !== 'ready' && phase !== 'result') return
    if (sentenceIndex + 1 >= totalSentences) return
    const audio = refAudioRef.current
    if (audio && !audio.paused) { audio.pause(); audio.currentTime = 0 }
    clearAdvanceTimer()
    setSentenceIndex((i) => i + 1)
    setResult(null)
    setError(null)
    setPhase(phase === 'idle' ? 'idle' : 'ready')
  }, [phase, sentenceIndex, totalSentences, clearAdvanceTimer])

  // Replay the reference clip without changing phase or triggering recording.
  // handleRefAudioEnded guards against auto-recording unless phase is 'playingRef'.
  const handlePlayRefOnly = useCallback(() => {
    const audio = refAudioRef.current
    if (!audio) return
    audio.currentTime = 0
    void audio.play().catch(() => {})
  }, [])

  // Stop and reload the audio element whenever we switch sentences so old
  // playback doesn't bleed into the newly displayed sentence.
  useEffect(() => {
    const audio = refAudioRef.current
    if (!audio) return
    audio.pause()
    audio.load()
  }, [sentenceIndex])

  // Swipe-left / swipe-right on the sentence card to navigate between sentences.
  const handleCardTouchStart = useCallback((e: React.TouchEvent) => {
    const t = e.touches[0]
    if (!t) return
    touchStartRef.current = { x: t.clientX, y: t.clientY }
  }, [])

  const handleCardTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!touchStartRef.current) return
    const t = e.changedTouches[0]
    if (!t) return
    const dx = t.clientX - touchStartRef.current.x
    const dy = Math.abs(t.clientY - touchStartRef.current.y)
    touchStartRef.current = null
    // Ignore taps (< 50 px) or primarily vertical movements (scroll).
    if (Math.abs(dx) < 50 || dy > 80) return
    // Horizontal swipe confirmed — prevent the synthetic click from also firing.
    e.preventDefault()
    if (dx < 0) handleNavNext()  // swipe left → next sentence
    else handlePrev()             // swipe right → prev sentence
  }, [handleNavNext, handlePrev])

  // Keyboard shortcuts mirror the on-screen controls so the learner can run the
  // whole listen → repeat → score loop hands-free. Space (or Enter) fires the
  // phase's primary CTA; R handles the secondary "re-listen / retry" action.
  // Arrow keys navigate between sentences. The bottom audio player is unmounted
  // while Stage 4 is active, so there's no contention for Space.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      const tag = target.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable) return
      if (e.metaKey || e.ctrlKey || e.altKey) return

      const isPrimary = e.code === 'Space' || e.key === 'Enter'
      const isSecondary = e.key === 'r' || e.key === 'R'
      const isArrowPrev = e.key === 'ArrowLeft'
      const isArrowNext = e.key === 'ArrowRight'
      if (!isPrimary && !isSecondary && !isArrowPrev && !isArrowNext) return

      const canNav = phase === 'idle' || phase === 'ready' || phase === 'result'
      let action: (() => void) | null = null

      if (isPrimary) {
        if (phase === 'idle') action = handleStartPractice
        else if (phase === 'ready') action = handleStartRecording
        else if (phase === 'recording') action = handleStop
        else if (phase === 'result') action = handleNext
      } else if (isSecondary) {
        // R: re-listen to the reference (ready) or retry the take (result).
        if (phase === 'ready') action = handleStartPractice
        else if (phase === 'result') action = handleRetry
      } else if (isArrowPrev && canNav) {
        action = handlePrev
      } else if (isArrowNext && canNav) {
        action = handleNavNext
      }

      if (!action) return
      e.preventDefault()
      action()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [
    phase,
    handleStartPractice,
    handleStartRecording,
    handleStop,
    handleNext,
    handleRetry,
    handlePrev,
    handleNavNext,
  ])

  if (totalSentences === 0) {
    return (
      <div className="rounded-card border border-ink-line bg-paper p-4 sm:p-5">
        <h3 className="font-display text-base font-semibold tracking-tight text-ink">
          <span className="text-accent">Stage 4</span> — {STAGE_META[4]?.label}
        </h3>
        <p className="mt-3 text-sm text-ink-muted">
          このセグメントには文が見つかりませんでした。文字起こしを実行してから再度お試しください。
        </p>
      </div>
    )
  }

  if (!currentSentence) {
    return null
  }

  // Derived rendering helpers — not memoised, computed fresh each render.
  const canNavigate = phase === 'idle' || phase === 'ready' || phase === 'result'
  // Card is tappable in ready/result to replay the reference clip without
  // triggering the full practice flow (no recording auto-start).
  const isCardInteractive = phase === 'ready' || phase === 'result'

  return (
    <div className="rounded-card border border-ink-line bg-paper p-4 sm:p-5">
      {/* hidden ref audio element — driven by handleStartPractice */}
      <audio
        ref={refAudioRef}
        src={currentSentence.refAudioUrl}
        preload="auto"
        onEnded={handleRefAudioEnded}
      />

      {/* header — sentence counter with prev/next chevrons */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-display text-base font-semibold tracking-tight text-ink">
          <span className="text-accent">Stage 4</span> — {STAGE_META[4]?.label}
        </h3>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={handlePrev}
            disabled={sentenceIndex === 0 || !canNavigate}
            aria-label="前の文へ"
            className="rounded p-1.5 text-ink-faint transition hover:text-ink disabled:cursor-not-allowed disabled:opacity-25"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
              <path d="M9 11.5L4.5 7 9 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          <span className="min-w-[4.5rem] text-center font-mono text-[10px] uppercase tracking-[0.18em] text-ink-muted">
            文 {sentenceIndex + 1} / {totalSentences}
          </span>
          <button
            type="button"
            onClick={handleNavNext}
            disabled={sentenceIndex + 1 >= totalSentences || !canNavigate}
            aria-label="次の文へ"
            className="rounded p-1.5 text-ink-faint transition hover:text-ink disabled:cursor-not-allowed disabled:opacity-25"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
              <path d="M5 2.5L9.5 7 5 11.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
      </div>

      {/* sentence display
          - tap to replay the reference clip (ready / result phases)
          - swipe left/right to navigate to next/prev sentence */}
      <div
        className={[
          'relative rounded-inset border border-ink-line bg-paper-soft px-4 py-5 select-none',
          isCardInteractive
            ? 'cursor-pointer transition-colors hover:border-accent/40 active:bg-ink-line/10'
            : '',
        ].join(' ')}
        onClick={isCardInteractive ? handlePlayRefOnly : undefined}
        onTouchStart={handleCardTouchStart}
        onTouchEnd={handleCardTouchEnd}
        role={isCardInteractive ? 'button' : undefined}
        aria-label={isCardInteractive ? 'タップしてお手本を再生' : undefined}
        tabIndex={isCardInteractive ? 0 : undefined}
      >
        {isCardInteractive && (
          <span className="absolute right-3 top-3 text-sm text-ink-faint/50" aria-hidden>
            🔊
          </span>
        )}
        <p className="text-center font-display text-xl font-medium leading-relaxed text-ink sm:text-2xl">
          {currentSentence.text}
        </p>
        {sentenceSummary.get(currentSentence.index) ? (
          <p className="mt-2 text-center text-xs text-ink-muted">
            最高スコア {Math.round((sentenceSummary.get(currentSentence.index)?.bestScore ?? 0) * 100)}%
            {sentenceSummary.get(currentSentence.index)?.passedAt ? ' · ✓ 合格済み' : ''}
          </p>
        ) : null}
      </div>

      {/* progress dots */}
      <div className="mt-3 flex items-center justify-center gap-1.5" aria-hidden>
        {sentences.map((s) => {
          const summary = sentenceSummary.get(s.index)
          const passed = Boolean(summary?.passedAt)
          const attempted = Boolean(summary)
          const isCurrent = s.index === sentenceIndex
          return (
            <span
              key={s.index}
              className={[
                'h-1.5 w-6 rounded-full transition-colors',
                passed
                  ? 'bg-accent'
                  : attempted
                    ? 'bg-accent-soft'
                    : isCurrent
                      ? 'bg-ink'
                      : 'bg-ink-line',
              ].join(' ')}
            />
          )
        })}
      </div>

      {/* controls */}
      <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
        {phase === 'idle' && (
          <button
            type="button"
            onClick={handleStartPractice}
            disabled={isStatusUpdating}
            className="rounded-chip bg-accent px-5 py-2.5 text-sm font-semibold text-paper transition hover:bg-accent-deep disabled:opacity-50"
          >
            🎤 開始する
            <KeyHint label="Space" />
          </button>
        )}

        {phase === 'ready' && (
          <>
            <button
              type="button"
              onClick={handleStartPractice}
              className="rounded-chip border border-ink-line bg-paper px-4 py-2 text-sm font-medium text-ink transition hover:border-accent hover:text-accent"
            >
              🔊 もう一度聴く
              <KeyHint label="R" tone="dark" />
            </button>
            <button
              type="button"
              onClick={handleStartRecording}
              className="rounded-chip bg-accent px-5 py-2.5 text-sm font-semibold text-paper transition hover:bg-accent-deep"
            >
              🎤 復唱する
              <KeyHint label="Space" />
            </button>
          </>
        )}

        {phase === 'playingRef' && (
          <div className="flex items-center gap-2 text-sm text-ink-muted">
            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-accent" />
            お手本を再生中…
          </div>
        )}

        {phase === 'recording' && (
          <button
            type="button"
            onClick={handleStop}
            className="rounded-chip bg-accent px-5 py-2.5 text-sm font-semibold text-paper transition hover:bg-accent-deep"
          >
            ⏹ 停止 ({formatMs(recorder.elapsedMs)})
            <KeyHint label="Space" />
          </button>
        )}

        {phase === 'uploading' && (
          <div className="flex items-center gap-2 text-sm text-ink-muted">
            <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-ink-faint" />
            採点中…
          </div>
        )}

        {phase === 'result' && result && (
          <>
            <button
              type="button"
              onClick={handleRetry}
              className="rounded-chip border border-ink-line bg-paper px-4 py-2 text-sm font-medium text-ink transition hover:border-accent hover:text-accent"
            >
              🔁 もう一度
              <KeyHint label="R" tone="dark" />
            </button>
            {result.pass ? (
              <button
                type="button"
                onClick={handleNext}
                className="rounded-chip bg-accent px-5 py-2.5 text-sm font-semibold text-paper transition hover:bg-accent-deep"
              >
                {sentenceIndex + 1 >= totalSentences ? '✓ 完了' : '次の文へ →'}
                <KeyHint label="Space" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleNext}
                className="rounded-chip border border-ink-line bg-paper px-4 py-2 text-sm font-medium text-ink-muted transition hover:border-accent hover:text-accent"
              >
                スキップ →
                <KeyHint label="Space" tone="dark" />
              </button>
            )}
          </>
        )}

        {phase === 'completed' && (
          <div className="flex items-center gap-2 text-sm font-semibold text-accent-deep">
            ✓ ステージ4完了 — 次のセグメントへ
          </div>
        )}
      </div>

      {/* result panel */}
      {phase === 'result' && result && (
        <div className="mt-4 rounded-inset border border-ink-line bg-paper-soft p-3 text-sm">
          <div className="flex items-center justify-between">
            <span
              className={[
                'rounded-chip px-2.5 py-0.5 text-xs font-semibold',
                result.pass
                  ? 'bg-accent text-paper'
                  : 'border border-accent-soft bg-accent-faint text-accent-deep',
              ].join(' ')}
            >
              {result.pass ? '✓ 合格' : 'もう一度'} {Math.round(result.score * 100)}%
            </span>
            <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-muted">
              合格基準 {Math.round(result.threshold * 100)}%
            </span>
          </div>
          {result.transcript ? (
            <div className="mt-2 grid gap-1.5 text-xs">
              <p>
                <span className="font-semibold text-ink-muted">あなた: </span>
                <span className="text-ink">{result.transcript}</span>
              </p>
              <p>
                <span className="font-semibold text-ink-muted">正解: </span>
                <span className="text-ink">{result.expected}</span>
              </p>
            </div>
          ) : null}
          <p className="mt-2 text-xs text-ink-muted">
            合格 {result.passingSentences} / {result.totalSentences} 文
          </p>
        </div>
      )}

      {/* error — local playback/scoring errors take precedence, then surface
          mic/recorder failures from the hook (permission denied, no device). */}
      {error || recorder.error ? (
        <div className="mt-3 rounded-inset border border-accent-soft bg-accent-faint px-3 py-2 text-sm text-accent-deep">
          {error ?? recorder.error?.message}
        </div>
      ) : null}

      {/* manual skip */}
      {phase !== 'completed' ? (
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            onClick={handleSkip}
            className="text-xs text-ink-faint underline underline-offset-2 transition hover:text-accent"
            title="採点をスキップしてステージ4を完了します"
          >
            このステージをスキップ
          </button>
        </div>
      ) : null}
    </div>
  )
}
