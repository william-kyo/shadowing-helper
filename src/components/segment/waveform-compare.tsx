'use client'

// Stacked waveform comparison for stage 4 self-review. Decodes the reference
// clip and the learner's recording with the Web Audio API, then draws both as
// bar waveforms on a SHARED time axis (same x = same moment) so rhythm, pauses,
// and overall length line up visually. A playhead tracks whichever clip the
// learner is playing; clicking a waveform seeks that clip and plays it.
//
// Why decode instead of trusting <audio>.duration: MediaRecorder webm blobs
// frequently report `duration === Infinity` on the element, which would break
// both the shared time axis and playhead math. decodeAudioData gives the true
// length for every source.

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import type React from 'react'

// Horizontal resolution of the waveform. Bars are time-aligned across the two
// tracks, so a fixed bars-per-second keeps the same x pointing at the same
// timestamp in both rows.
const BARS_PER_SECOND = 28
const MIN_BAR_SCALE = 0.06

type Track = 'reference' | 'self'

type Decoded = {
  peaks: number[]
  durationSec: number
}

type WaveformCompareProps = {
  referenceUrl: string
  recordingUrl: string
  referenceAudioRef: RefObject<HTMLAudioElement | null>
  selfAudioRef: RefObject<HTMLAudioElement | null>
}

// Lazily-created, reused across decodes. AudioContext is capped per page on
// some browsers, so we never spin up one per clip.
let sharedAudioContext: AudioContext | null = null
function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) return null
  if (!sharedAudioContext) sharedAudioContext = new Ctor()
  return sharedAudioContext
}

// Downsample one channel to `barCount` peaks in [0, 1] using per-bucket max
// amplitude (peaks read more clearly than RMS at this size).
function computePeaks(channel: Float32Array, barCount: number): number[] {
  if (barCount <= 0) return []
  const bucketSize = Math.max(1, Math.floor(channel.length / barCount))
  const peaks: number[] = new Array(barCount)
  for (let i = 0; i < barCount; i++) {
    const start = i * bucketSize
    const end = Math.min(channel.length, start + bucketSize)
    let max = 0
    for (let j = start; j < end; j++) {
      const v = Math.abs(channel[j] ?? 0)
      if (v > max) max = v
    }
    peaks[i] = max
  }
  return peaks
}

async function decodeAudio(url: string, signal: AbortSignal): Promise<Decoded | null> {
  const ctx = getAudioContext()
  if (!ctx) return null
  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error(`failed to load audio: ${res.status}`)
  const arrayBuffer = await res.arrayBuffer()
  // decodeAudioData detaches the buffer; clone-safe since we don't reuse it.
  const audioBuffer = await ctx.decodeAudioData(arrayBuffer)
  const durationSec = audioBuffer.duration
  const barCount = Math.max(1, Math.round(durationSec * BARS_PER_SECOND))
  const peaks = computePeaks(audioBuffer.getChannelData(0), barCount)
  return { peaks, durationSec }
}

type DecodeState = { url: string; data: Decoded | null; error: boolean }

function useDecodedAudio(url: string): { data: Decoded | null; error: boolean } {
  // The result is tagged with the url it belongs to. While a newer url is
  // decoding, `state.url !== url` so we report "loading" without having to
  // reset state synchronously inside the effect (which cascades renders).
  const [state, setState] = useState<DecodeState | null>(null)

  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()
    decodeAudio(url, controller.signal)
      .then((decoded) => {
        if (!cancelled) setState({ url, data: decoded, error: false })
      })
      .catch((err) => {
        if (cancelled || (err as Error)?.name === 'AbortError') return
        setState({ url, data: null, error: true })
      })
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [url])

  if (!state || state.url !== url) return { data: null, error: false }
  return { data: state.data, error: state.error }
}

function formatSeconds(sec: number): string {
  return `${sec.toFixed(1)}秒`
}

// One waveform row. `widthFraction` is the track's length relative to the
// longest of the two clips, so a slower take visibly extends further right.
// `globalPeak` normalises both rows to the same vertical scale.
function WaveformRow({
  label,
  color,
  peaks,
  widthFraction,
  globalPeak,
  durationSec,
  playheadFraction,
  isPlaying,
  onSeek,
}: {
  label: string
  color: 'reference' | 'self'
  peaks: number[]
  widthFraction: number
  globalPeak: number
  durationSec: number
  playheadFraction: number | null
  isPlaying: boolean
  onSeek: (fraction: number) => void
}) {
  const barColor = color === 'reference' ? 'bg-accent' : 'bg-spark'
  const headColor = color === 'reference' ? 'bg-accent-deep' : 'bg-spark-deep'

  const handlePointer = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const rect = e.currentTarget.getBoundingClientRect()
      if (rect.width === 0) return
      const fraction = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
      onSeek(fraction)
    },
    [onSeek],
  )

  return (
    <div className="flex items-center gap-2">
      <span
        className={[
          'w-16 shrink-0 font-mono text-[10px] uppercase tracking-[0.12em]',
          color === 'reference' ? 'text-accent-deep' : 'text-spark-deep',
        ].join(' ')}
      >
        {label}
      </span>
      {/* full-width track = longest clip; inner fill = this clip's share */}
      <div className="relative h-9 flex-1">
        <div
          role="button"
          tabIndex={0}
          aria-label={`${label}を再生`}
          onClick={handlePointer}
          className="absolute inset-y-0 left-0 flex cursor-pointer items-center gap-[1px] overflow-hidden rounded-sm"
          style={{ width: `${Math.max(2, widthFraction * 100)}%` }}
        >
          {peaks.map((p, i) => {
            const scale = globalPeak > 0 ? p / globalPeak : 0
            const height = Math.max(MIN_BAR_SCALE, scale)
            return (
              <span
                key={i}
                className={`${barColor} flex-1 rounded-full opacity-80`}
                style={{ height: `${height * 100}%` }}
              />
            )
          })}
          {playheadFraction != null && (
            <span
              className={`${headColor} pointer-events-none absolute inset-y-0 w-0.5 ${
                isPlaying ? '' : 'opacity-50'
              }`}
              style={{ left: `${Math.min(100, playheadFraction * 100)}%` }}
            />
          )}
        </div>
        <span className="absolute -bottom-0.5 right-0 font-mono text-[9px] text-ink-faint">
          {formatSeconds(durationSec)}
        </span>
      </div>
    </div>
  )
}

export function WaveformCompare({
  referenceUrl,
  recordingUrl,
  referenceAudioRef,
  selfAudioRef,
}: WaveformCompareProps) {
  const reference = useDecodedAudio(referenceUrl)
  const self = useDecodedAudio(recordingUrl)

  // Live playhead state, driven by a rAF loop while either clip plays.
  const [playing, setPlaying] = useState<Track | null>(null)
  const [refTime, setRefTime] = useState(0)
  const [selfTime, setSelfTime] = useState(0)
  const rafRef = useRef<number | null>(null)

  // Drive the playhead from the actual audio elements. We can't trust
  // element.duration (webm → Infinity), but element.currentTime is always
  // accurate, and we divide by the decoded duration for the fraction.
  useEffect(() => {
    const refEl = referenceAudioRef.current
    const selfEl = selfAudioRef.current

    const tick = () => {
      if (refEl) setRefTime(refEl.currentTime)
      if (selfEl) setSelfTime(selfEl.currentTime)
      rafRef.current = requestAnimationFrame(tick)
    }
    const startLoop = (track: Track) => {
      setPlaying(track)
      if (rafRef.current == null) rafRef.current = requestAnimationFrame(tick)
    }
    const stopLoop = () => {
      setPlaying(null)
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
      // Snap to final position so the head doesn't freeze mid-bar.
      if (refEl) setRefTime(refEl.currentTime)
      if (selfEl) setSelfTime(selfEl.currentTime)
    }

    const onRefPlay = () => startLoop('reference')
    const onSelfPlay = () => startLoop('self')
    const onRefStop = () => stopLoop()
    const onSelfStop = () => stopLoop()

    refEl?.addEventListener('play', onRefPlay)
    refEl?.addEventListener('pause', onRefStop)
    refEl?.addEventListener('ended', onRefStop)
    selfEl?.addEventListener('play', onSelfPlay)
    selfEl?.addEventListener('pause', onSelfStop)
    selfEl?.addEventListener('ended', onSelfStop)

    return () => {
      refEl?.removeEventListener('play', onRefPlay)
      refEl?.removeEventListener('pause', onRefStop)
      refEl?.removeEventListener('ended', onRefStop)
      selfEl?.removeEventListener('play', onSelfPlay)
      selfEl?.removeEventListener('pause', onSelfStop)
      selfEl?.removeEventListener('ended', onSelfStop)
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
  }, [referenceAudioRef, selfAudioRef])

  const seek = useCallback(
    (track: Track, fraction: number) => {
      const el = track === 'reference' ? referenceAudioRef.current : selfAudioRef.current
      const other = track === 'reference' ? selfAudioRef.current : referenceAudioRef.current
      const decoded = track === 'reference' ? reference.data : self.data
      if (!el) return
      if (other && !other.paused) {
        other.pause()
        other.currentTime = 0
      }
      if (decoded && decoded.durationSec > 0) {
        const target = fraction * decoded.durationSec
        // Guard against the seek throwing on not-yet-seekable webm blobs.
        try {
          el.currentTime = target
        } catch {
          /* fall back to playing from the current position */
        }
      }
      void el.play().catch(() => {})
    },
    [referenceAudioRef, selfAudioRef, reference.data, self.data],
  )

  if (reference.error || self.error) {
    return (
      <p className="text-center text-[11px] text-ink-faint">
        波形を読み込めませんでした。
      </p>
    )
  }

  if (!reference.data || !self.data) {
    return (
      <div className="flex items-center justify-center gap-2 py-3 text-[11px] text-ink-faint">
        <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-ink-faint" />
        波形を生成中…
      </div>
    )
  }

  const maxDuration = Math.max(reference.data.durationSec, self.data.durationSec, 0.001)
  const globalPeak = Math.max(
    ...reference.data.peaks,
    ...self.data.peaks,
    0.0001,
  )

  return (
    <div className="space-y-2">
      <WaveformRow
        label="お手本"
        color="reference"
        peaks={reference.data.peaks}
        widthFraction={reference.data.durationSec / maxDuration}
        globalPeak={globalPeak}
        durationSec={reference.data.durationSec}
        playheadFraction={
          reference.data.durationSec > 0 ? refTime / reference.data.durationSec : null
        }
        isPlaying={playing === 'reference'}
        onSeek={(f) => seek('reference', f)}
      />
      <WaveformRow
        label="自分の声"
        color="self"
        peaks={self.data.peaks}
        widthFraction={self.data.durationSec / maxDuration}
        globalPeak={globalPeak}
        durationSec={self.data.durationSec}
        playheadFraction={self.data.durationSec > 0 ? selfTime / self.data.durationSec : null}
        isPlaying={playing === 'self'}
        onSeek={(f) => seek('self', f)}
      />
    </div>
  )
}
