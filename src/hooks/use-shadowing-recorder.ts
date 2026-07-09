'use client'

// Encapsulates the mic-permission + MediaRecorder dance for stage 4
// shadowing. The component owns the visual state machine; this hook just
// returns a small imperative API plus the bits of state the UI needs to
// render: supportedness, current phase, error, elapsed recording time.
//
// iOS Safari notes (all driven by a single user gesture in the panel):
//   - getUserMedia + AudioContext resume must be triggered by a tap
//   - MediaRecorder mime order: webm/opus → mp4 (Safari) → '' (let browser pick)
//   - Streams are always released on unmount and on stopRecording

import { useCallback, useEffect, useRef, useState } from 'react'

const MAX_RECORDING_MS = 30_000
const TICK_INTERVAL_MS = 100

export type RecorderPhase = 'idle' | 'ready' | 'recording'

export type RecorderError = {
  code: 'unsupported' | 'permission_denied' | 'no_microphone' | 'recorder_failed' | 'unknown'
  message: string
}

type InternalState = {
  phase: RecorderPhase
  error: RecorderError | null
  elapsedMs: number
}

function pickRecorderMime(): string {
  if (typeof MediaRecorder === 'undefined') return ''
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', '']
  for (const candidate of candidates) {
    if (candidate === '' || MediaRecorder.isTypeSupported(candidate)) {
      return candidate
    }
  }
  return ''
}

function describeMediaError(err: unknown): RecorderError {
  if (err && typeof err === 'object' && 'name' in err) {
    const name = (err as { name?: string }).name
    if (name === 'NotAllowedError' || name === 'SecurityError') {
      return {
        code: 'permission_denied',
        message: 'マイクの使用が許可されていません。ブラウザの設定を確認してください。',
      }
    }
    if (name === 'NotFoundError' || name === 'OverconstrainedError') {
      return {
        code: 'no_microphone',
        message: 'マイクが見つかりません。',
      }
    }
  }
  return {
    code: 'unknown',
    message: err instanceof Error ? err.message : '録音の開始に失敗しました。',
  }
}

export function useShadowingRecorder() {
  const [state, setState] = useState<InternalState>({
    phase: 'idle',
    error: null,
    elapsedMs: 0,
  })

  const streamRef = useRef<MediaStream | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const startTimeRef = useRef<number>(0)
  const resolveStopRef = useRef<((value: RecordingResult) => void) | null>(null)
  const tickHandleRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const maxTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearTimers = useCallback(() => {
    if (tickHandleRef.current) {
      clearInterval(tickHandleRef.current)
      tickHandleRef.current = null
    }
    if (maxTimeoutRef.current) {
      clearTimeout(maxTimeoutRef.current)
      maxTimeoutRef.current = null
    }
  }, [])

  const releaseStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
  }, [])

  const finalize = useCallback(() => {
    clearTimers()
    const recorder = recorderRef.current
    const resolve = resolveStopRef.current
    if (!recorder || !resolve) return

    if (recorder.state !== 'inactive') {
      try {
        recorder.stop()
      } catch {
        // Already stopping; the onstop handler will still fire.
      }
    }
  }, [clearTimers])

  // Request mic permission and prepare the recorder. Resolves true once a
  // stream is live so the caller can immediately chain into recording. Safe to
  // call once per "session" — repeated calls return the existing stream.
  const requestPermission = useCallback(async (): Promise<boolean> => {
    if (state.phase !== 'idle' || streamRef.current) {
      return streamRef.current !== null
    }
    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === 'undefined'
    ) {
      setState({
        phase: 'idle',
        error: { code: 'unsupported', message: 'このブラウザは録音に対応していません。' },
        elapsedMs: 0,
      })
      return false
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      setState({ phase: 'ready', error: null, elapsedMs: 0 })
      return true
    } catch (err) {
      setState({ phase: 'idle', error: describeMediaError(err), elapsedMs: 0 })
      return false
    }
  }, [state.phase])

  // Start recording. Resolves when stopRecording finishes, returning the blob
  // + duration. Caller is expected to await start() before triggering any UI
  // that depends on `phase === 'recording'`. Guards on refs (stream live, not
  // already recording) rather than state, so it can be chained right after
  // `await requestPermission()` from a closure created before that state
  // update landed.
  const startRecording = useCallback(async () => {
    if (!streamRef.current || recorderRef.current) {
      setState((current) => ({
        ...current,
        error: {
          code: 'recorder_failed',
          message: 'マイクの準備ができていません。',
        },
      }))
      return
    }
    const mimeType = pickRecorderMime()
    let recorder: MediaRecorder
    try {
      recorder = mimeType ? new MediaRecorder(streamRef.current, { mimeType }) : new MediaRecorder(streamRef.current)
    } catch (err) {
      setState({ phase: 'ready', error: describeMediaError(err), elapsedMs: 0 })
      return
    }

    chunksRef.current = []
    recorderRef.current = recorder
    startTimeRef.current = Date.now()
    setState({ phase: 'recording', error: null, elapsedMs: 0 })

    recorder.addEventListener('dataavailable', (event) => {
      if (event.data && event.data.size > 0) {
        chunksRef.current.push(event.data)
      }
    })

    const stopPromise = new Promise<RecordingResult>((resolve) => {
      resolveStopRef.current = resolve
    })

    recorder.addEventListener('stop', () => {
      const durationMs = Date.now() - startTimeRef.current
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' })
      clearTimers()
      const resolve = resolveStopRef.current
      resolveStopRef.current = null
      recorderRef.current = null
      setState({ phase: 'ready', error: null, elapsedMs: 0 })
      resolve?.({ blob, durationMs, mimeType: blob.type })
    })

    recorder.addEventListener('error', (event) => {
      const message = (event as { error?: Error }).error?.message ?? '録音中にエラーが発生しました。'
      setState({ phase: 'ready', error: { code: 'recorder_failed', message }, elapsedMs: 0 })
    })

    try {
      recorder.start()
    } catch (err) {
      setState({ phase: 'ready', error: describeMediaError(err), elapsedMs: 0 })
      return
    }

    tickHandleRef.current = setInterval(() => {
      setState((current) =>
        current.phase === 'recording'
          ? { ...current, elapsedMs: Date.now() - startTimeRef.current }
          : current,
      )
    }, TICK_INTERVAL_MS)

    maxTimeoutRef.current = setTimeout(() => {
      finalize()
    }, MAX_RECORDING_MS)

    return stopPromise
  }, [clearTimers, finalize])

  const stopRecording = useCallback(() => {
    finalize()
  }, [finalize])

  const reset = useCallback(() => {
    setState({ phase: streamRef.current ? 'ready' : 'idle', error: null, elapsedMs: 0 })
  }, [])

  // Free the mic on unmount. Stream tracks are stopped so the browser
  // permission indicator goes away when the user navigates away.
  useEffect(() => {
    return () => {
      clearTimers()
      if (recorderRef.current && recorderRef.current.state !== 'inactive') {
        try {
          recorderRef.current.stop()
        } catch {
          // ignore
        }
      }
      releaseStream()
      resolveStopRef.current = null
    }
  }, [clearTimers, releaseStream])

  const supported =
    typeof navigator !== 'undefined' &&
    Boolean(navigator.mediaDevices?.getUserMedia) &&
    typeof MediaRecorder !== 'undefined'

  return {
    phase: state.phase,
    error: state.error,
    elapsedMs: state.elapsedMs,
    supported,
    requestPermission,
    startRecording,
    stopRecording,
    reset,
  }
}

export type RecordingResult = {
  blob: Blob
  durationMs: number
  mimeType: string
}
