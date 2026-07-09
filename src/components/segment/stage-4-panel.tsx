'use client'

// Stage 4 panel: script-following shadowing with per-sentence practice.
// State machine walks `ready → recording → uploading → result → (next |
// completed)`. Advancing between sentences is MANUAL: a scored sentence stays
// on its `result` so the learner can review the take (score + waveform
// compare) and only moves on when they tap "次の文へ" — there is no
// per-sentence auto-advance timer. When the last sentence passes the server
// returns stageComplete, the panel flips to 'completed' and calls onComplete,
// which is the parent workspace's handleStage4Complete; the parent then
// handles segment/stage-level navigation (segment-stage-workspace.tsx), not
// this panel.
//
// Listening and recording are fully decoupled: the reference clip plays via
// 「お手本」 (button, compare bar, or card tap) and never chains into
// recording; each take is started explicitly with 「録音開始」, which grants
// mic access on first use (single user gesture requirement on iOS). The user
// taps "停止" to finalize a take (or the 30s cap fires). Tapping "次の文へ"
// (handleNext → advanceToNext) sets autoStartNextRef so the next sentence
// auto-plays its reference once; manual navigation (chevrons / swipe / arrow
// keys) advances silently without that auto-play.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type React from 'react'

import { useShadowingRecorder, type RecordingResult } from '@/hooks/use-shadowing-recorder'
import { WaveformCompare } from '@/components/segment/waveform-compare'
import { STAGE_META } from '@/lib/stage-meta'
import type { Stage4Metadata, SentenceScore } from '@/lib/stage-4-completion'

type Sentence = {
  index: number
  text: string
  startMs: number
  endMs: number
  refAudioUrl: string
  // The learner's latest recording for this sentence (from a prior session),
  // or null if they haven't recorded it yet.
  userRecordingUrl: string | null
}

type Phase =
  | 'ready'
  | 'recording'
  | 'uploading'
  | 'result'
  | 'completed'

type ResultPayload = {
  recordingId: string
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
  // Separate element for playing back the learner's own recording, so it never
  // clobbers the reference clip (and its onEnded never triggers recording).
  const selfAudioRef = useRef<HTMLAudioElement | null>(null)
  const stopRecordingPromiseRef = useRef<Promise<RecordingResult | undefined> | null>(null)
  // Touch-start position for horizontal swipe detection on the sentence card.
  const touchStartRef = useRef<{ x: number; y: number } | null>(null)
  // Set when advanceToNext moves the learner forward in the practice loop, so
  // the next sentence auto-plays its reference clip once. Recording is never
  // auto-started; the learner taps 録音開始 when ready.
  const autoStartNextRef = useRef(false)

  const [phase, setPhase] = useState<Phase>('ready')
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
  // Per-sentence self-playback URLs. Seeded from sentences persisted in prior
  // sessions, then updated in-session as each new take is scored.
  const [recordingUrlByIndex, setRecordingUrlByIndex] = useState<Record<number, string>>(
    () => {
      const seed: Record<number, string> = {}
      sentences.forEach((s) => {
        if (s.userRecordingUrl) seed[s.index] = s.userRecordingUrl
      })
      return seed
    },
  )

  const currentSentence = sentences[sentenceIndex] ?? null
  const totalSentences = sentences.length
  // Self-playback URL for the current sentence (this session or a prior one).
  const currentRecordingUrl = recordingUrlByIndex[sentenceIndex] ?? null
  const sentenceSummary = useMemo(() => {
    const map = new Map<number, ReturnType<typeof describeState>>()
    metadata.sentences.forEach((s) => map.set(s.index, describeState(s)))
    return map
  }, [metadata])

  // Start the recorder. Pauses anything still playing so the take isn't
  // polluted by the speakers.
  const beginRecording = useCallback(() => {
    const audio = refAudioRef.current
    if (audio && !audio.paused) { audio.pause(); audio.currentTime = 0 }
    const self = selfAudioRef.current
    if (self && !self.paused) { self.pause(); self.currentTime = 0 }
    setPhase('recording')
    const stopPromise = recorder.startRecording()
    stopRecordingPromiseRef.current = stopPromise ?? null
  }, [recorder])

  // 録音開始: start a take. getUserMedia must be initiated inside the tap's
  // user activation (iOS), so permission is requested right here on first
  // use; startRecording guards on the hook's stream ref rather than its
  // state, so chaining after the await is safe even though this closure
  // predates the state update.
  const handleRecordDirect = useCallback(async () => {
    if (phase !== 'ready') return
    setError(null)
    setResult(null)
    if (recorder.phase !== 'ready') {
      const granted = await recorder.requestPermission()
      // Denied / unsupported — the hook's error renders at the bottom.
      if (!granted) return
    }
    beginRecording()
  }, [phase, recorder, beginRecording])

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

      // Make the just-recorded take playable for comparison. `?v=<recordingId>`
      // busts any cached prior take for this sentence.
      if (data.recordingId) {
        setRecordingUrlByIndex((prev) => ({
          ...prev,
          [sentenceIndex]: `/api/segments/${segmentId}/stage4/recordings/${sentenceIndex}/audio?v=${data.recordingId}`,
        }))
      }

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
    // Flag the upcoming sentence to auto-play its reference and resume the
    // listen → speak loop without another tap.
    autoStartNextRef.current = true
    setSentenceIndex((i) => i + 1)
    setResult(null)
    setPhase('ready')
  }, [sentenceIndex, totalSentences, onComplete])

  const handleRetry = useCallback(() => {
    setResult(null)
    setPhase('ready')
  }, [])

  const handleNext = useCallback(() => {
    advanceToNext()
  }, [advanceToNext])

  const handleSkip = useCallback(async () => {
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
  }, [segmentId, onComplete])

  // Navigate to the previous sentence (ready / result phases only).
  const handlePrev = useCallback(() => {
    if (phase !== 'ready' && phase !== 'result') return
    if (sentenceIndex <= 0) return
    const audio = refAudioRef.current
    if (audio && !audio.paused) { audio.pause(); audio.currentTime = 0 }
    const self = selfAudioRef.current
    if (self && !self.paused) { self.pause(); self.currentTime = 0 }
    setSentenceIndex((i) => i - 1)
    setResult(null)
    setError(null)
    setPhase('ready')
  }, [phase, sentenceIndex])

  // Navigate to the next sentence without completing the stage (arrows / swipe).
  const handleNavNext = useCallback(() => {
    if (phase !== 'ready' && phase !== 'result') return
    if (sentenceIndex + 1 >= totalSentences) return
    const audio = refAudioRef.current
    if (audio && !audio.paused) { audio.pause(); audio.currentTime = 0 }
    const self = selfAudioRef.current
    if (self && !self.paused) { self.pause(); self.currentTime = 0 }
    setSentenceIndex((i) => i + 1)
    setResult(null)
    setError(null)
    setPhase('ready')
  }, [phase, sentenceIndex, totalSentences])

  // Replay the reference clip without changing phase or triggering recording.
  const handlePlayRefOnly = useCallback(() => {
    const self = selfAudioRef.current
    if (self && !self.paused) self.pause()
    const audio = refAudioRef.current
    if (!audio) return
    audio.currentTime = 0
    void audio.play().catch(() => {})
  }, [])

  // Play back the learner's own recording for the current sentence so they can
  // compare it against the reference. Pauses the reference first to avoid an
  // overlap, and never affects the recording state machine.
  const handlePlaySelf = useCallback(() => {
    const ref = refAudioRef.current
    if (ref && !ref.paused) { ref.pause(); ref.currentTime = 0 }
    const self = selfAudioRef.current
    if (!self) return
    self.currentTime = 0
    void self.play().catch(() => {})
  }, [])

  // Stop and reload the reference element whenever we switch sentences so old
  // playback doesn't bleed into the newly displayed sentence. The self element
  // is paused here; its (re)load is driven by the currentRecordingUrl effect
  // below so a fresh take recorded for the *same* sentence also loads.
  useEffect(() => {
    const audio = refAudioRef.current
    if (audio) {
      audio.pause()
      audio.load()
    }
    const self = selfAudioRef.current
    if (self && !self.paused) {
      self.pause()
      self.currentTime = 0
    }
  }, [sentenceIndex])

  // Load the self element whenever its source changes — on sentence switch AND
  // when a new take is recorded for the current sentence (retry or first take).
  // Without this, React updates the <audio src> but `preload="none"` leaves the
  // element unloaded and play() can fail silently on Safari/iOS.
  useEffect(() => {
    const self = selfAudioRef.current
    if (self && currentRecordingUrl) self.load()
  }, [currentRecordingUrl])

  // After advancing within the practice loop, auto-play the new sentence's
  // reference clip so the learner hears the model right away. Runs after the
  // reload effect above so play() acts on the freshly-loaded source; the
  // element was unlocked by the learner's earlier tap, so no further gesture
  // is needed. Recording stays manual (録音開始). Manual navigation
  // (arrows / swipe) never sets the flag, so it stays silent.
  useEffect(() => {
    if (!autoStartNextRef.current) return
    autoStartNextRef.current = false
    handlePlayRefOnly()
  }, [sentenceIndex, handlePlayRefOnly])

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
  // Arrow keys navigate between sentences. 1 / 2 drive the compare bar (1 =
  // お手本 reference, 2 = 自分の声 your take) whenever it's visible. The bottom
  // audio player is unmounted while Stage 4 is active, so there's no contention
  // for Space.
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
      const isCompareRef = e.key === '1'
      const isCompareSelf = e.key === '2'
      if (
        !isPrimary &&
        !isSecondary &&
        !isArrowPrev &&
        !isArrowNext &&
        !isCompareRef &&
        !isCompareSelf
      )
        return

      const canNav = phase === 'ready' || phase === 'result'
      // Mirrors `showCompareBar`: the 1/2 shortcuts are live exactly when the
      // compare bar (and its KeyHint badges) is on screen.
      const canCompare =
        Boolean(currentRecordingUrl) &&
        phase !== 'recording' &&
        phase !== 'uploading'
      let action: (() => void) | null = null

      if (isPrimary) {
        if (phase === 'ready') action = handleRecordDirect
        else if (phase === 'recording') action = handleStop
        else if (phase === 'result') action = handleNext
      } else if (isSecondary) {
        // R: re-listen to the reference (ready) or retry the take (result).
        if (phase === 'ready') action = handlePlayRefOnly
        else if (phase === 'result') action = handleRetry
      } else if (isArrowPrev && canNav) {
        action = handlePrev
      } else if (isArrowNext && canNav) {
        action = handleNavNext
      } else if (isCompareRef && canCompare) {
        action = handlePlayRefOnly
      } else if (isCompareSelf && canCompare) {
        action = handlePlaySelf
      }

      if (!action) return
      e.preventDefault()
      action()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [
    phase,
    handleRecordDirect,
    handleStop,
    handleNext,
    handleRetry,
    handlePrev,
    handleNavNext,
    handlePlayRefOnly,
    handlePlaySelf,
    currentRecordingUrl,
  ])

  if (totalSentences === 0) {
    return (
      <div className="rounded-card border border-ink-line bg-paper p-4 sm:p-5">
        <h3 className="font-display text-base font-semibold tracking-tight text-ink">
          <span className="text-accent">ステージ4</span> — {STAGE_META[4]?.label}
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
  const canNavigate = phase === 'ready' || phase === 'result'
  // Card is tappable in ready/result to replay the reference clip; recording
  // never starts from a card tap.
  const isCardInteractive = phase === 'ready' || phase === 'result'
  // The compare bar is offered whenever a recording exists and we're not mid
  // record/score (which own the audio + state machine).
  const showCompareBar =
    Boolean(currentRecordingUrl) &&
    phase !== 'recording' &&
    phase !== 'uploading'

  return (
    <div className="rounded-card border border-ink-line bg-paper p-4 sm:p-5">
      {/* hidden ref audio element — driven by handlePlayRefOnly */}
      <audio
        ref={refAudioRef}
        src={currentSentence.refAudioUrl}
        preload="auto"
      />
      {/* hidden self-recording element — driven by handlePlaySelf */}
      <audio
        ref={selfAudioRef}
        src={currentRecordingUrl ?? undefined}
        preload="none"
      />

      {/* header — sentence counter with prev/next chevrons */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-display text-base font-semibold tracking-tight text-ink">
          <span className="text-accent">ステージ4</span> — {STAGE_META[4]?.label}
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

      {/* compare bar — play the reference vs. your own take side by side.
          Shown whenever a recording exists for this sentence and we're not mid
          listen/record/score. */}
      {showCompareBar && (
        <div className="mt-4 rounded-inset border border-ink-line bg-paper-soft px-3 py-2">
          <p className="mb-2 text-center font-mono text-[10px] uppercase tracking-[0.16em] text-ink-muted">
            聴き比べ
          </p>
          {/* Stacked waveforms on a shared time axis — tap a row to play it and
              watch the playhead. Lets the learner see rhythm / length gaps the
              score alone can't show. */}
          {currentRecordingUrl && (
            <div className="mb-3">
              <WaveformCompare
                referenceUrl={currentSentence.refAudioUrl}
                recordingUrl={currentRecordingUrl}
                referenceAudioRef={refAudioRef}
                selfAudioRef={selfAudioRef}
              />
            </div>
          )}
          <div className="flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={handlePlayRefOnly}
              className="rounded-chip border border-ink-line bg-paper px-3.5 py-1.5 text-xs font-medium text-ink transition hover:border-accent hover:text-accent"
            >
              🔊 お手本
              <KeyHint label="1" tone="dark" />
            </button>
            <button
              type="button"
              onClick={handlePlaySelf}
              className="rounded-chip border border-ink-line bg-paper px-3.5 py-1.5 text-xs font-medium text-ink transition hover:border-accent hover:text-accent"
            >
              🎙 自分の声
              <KeyHint label="2" tone="dark" />
            </button>
          </div>
        </div>
      )}

      {/* controls */}
      <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
        {/* Listening and recording are decoupled: お手本 replays the reference
            as often as needed (via the compare bar when a take exists),
            録音開始 records only when tapped. */}
        {phase === 'ready' && (
          <>
            {!currentRecordingUrl && (
              <button
                type="button"
                onClick={handlePlayRefOnly}
                className="rounded-chip border border-ink-line bg-paper px-4 py-2 text-sm font-medium text-ink transition hover:border-accent hover:text-accent"
              >
                🔊 お手本
                <KeyHint label="R" tone="dark" />
              </button>
            )}
            <button
              type="button"
              onClick={handleRecordDirect}
              disabled={isStatusUpdating}
              className="rounded-chip bg-accent px-5 py-2.5 text-sm font-semibold text-paper transition hover:bg-accent-deep disabled:opacity-50"
            >
              🎤 録音開始
              <KeyHint label="Space" />
            </button>
          </>
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
            {/* On a fail, retry is the primary recovery action, so give it the
                accent emphasis "次の文へ →" carries on a pass. On a pass it stays
                the outlined secondary next to the accent "次の文へ →". */}
            <button
              type="button"
              onClick={handleRetry}
              className={
                result.pass
                  ? 'rounded-chip border border-ink-line bg-paper px-4 py-2 text-sm font-medium text-ink transition hover:border-accent hover:text-accent'
                  : 'rounded-chip bg-accent px-5 py-2.5 text-sm font-semibold text-paper transition hover:bg-accent-deep'
              }
            >
              🔁 もう一度
              <KeyHint label="R" tone={result.pass ? 'dark' : 'light'} />
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
