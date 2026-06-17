'use client'

import type { ChangeEvent } from 'react'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'

type SegmentAudioPlayerProps = {
  src: string
  title: string
  projectId: string
  segmentId: string
  segments: { id: string; title: string | null; index: number }[]
}

const BAR_COUNT = 48

function formatTime(ms: number): string {
  const totalSeconds = Math.round(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

// Synthetic fallback shape, used only if the real audio can't be decoded.
function generateWaveformHeights(count: number): number[] {
  const heights: number[] = []
  for (let i = 0; i < count; i++) {
    const x = i / count
    const envelope = Math.sin(x * Math.PI) * 0.6 + 0.4
    const noise = Math.sin(i * 7.3) * 0.2 + Math.sin(i * 13.1) * 0.15 + Math.sin(i * 3.7) * 0.1
    heights.push(Math.max(0.15, Math.min(1, envelope + noise)))
  }
  return heights
}

// Downsample decoded PCM into `count` normalized RMS peaks (0.15–1) so each bar
// reflects the actual loudness at that point in the clip.
function computeWaveformPeaks(audioBuffer: AudioBuffer, count: number): number[] {
  const channel = audioBuffer.getChannelData(0)
  const blockSize = Math.max(1, Math.floor(channel.length / count))
  const peaks: number[] = []
  let max = 0
  for (let i = 0; i < count; i++) {
    const start = i * blockSize
    let sumSquares = 0
    for (let j = 0; j < blockSize; j++) {
      const sample = channel[start + j] ?? 0
      sumSquares += sample * sample
    }
    const rms = Math.sqrt(sumSquares / blockSize)
    peaks.push(rms)
    if (rms > max) max = rms
  }
  return peaks.map((peak) => Math.max(0.15, max > 0 ? peak / max : 0.15))
}

export function SegmentAudioPlayer({ src, title, projectId, segmentId, segments }: SegmentAudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const speedMenuRef = useRef<HTMLDivElement>(null)
  const tocMenuRef = useRef<HTMLDivElement>(null)
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [playbackRate, setPlaybackRate] = useState(1)
  const [showSpeedMenu, setShowSpeedMenu] = useState(false)
  const [showTocMenu, setShowTocMenu] = useState(false)

  const [waveformHeights, setWaveformHeights] = useState<number[]>(() =>
    generateWaveformHeights(BAR_COUNT),
  )

  // Decode the real audio once to render a true waveform; fall back silently to
  // the synthetic shape on any failure (unsupported codec, fetch error, etc).
  useEffect(() => {
    const AudioCtor =
      window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AudioCtor) return

    let cancelled = false
    const audioContext = new AudioCtor()

    void (async () => {
      try {
        const res = await fetch(src)
        const arrayBuffer = await res.arrayBuffer()
        const decoded = await audioContext.decodeAudioData(arrayBuffer)
        if (!cancelled) {
          setWaveformHeights(computeWaveformPeaks(decoded, BAR_COUNT))
        }
      } catch {
        // keep synthetic fallback
      } finally {
        void audioContext.close()
      }
    })()

    return () => {
      cancelled = true
    }
  }, [src])

  const togglePlay = () => {
    const audio = audioRef.current
    if (!audio) return
    if (playing) {
      audio.pause()
    } else {
      audio.play()
    }
    setPlaying(!playing)
  }

  const seek = (seconds: number) => {
    const audio = audioRef.current
    if (!audio) return
    if (!audio.duration || isNaN(audio.duration)) {
      audio.currentTime = Math.max(0, audio.currentTime + seconds)
      return
    }
    audio.currentTime = Math.max(0, Math.min(audio.duration, audio.currentTime + seconds))
  }

  const handleTimeUpdate = () => {
    const audio = audioRef.current
    if (!audio) return
    setCurrentTime(audio.currentTime * 1000)
  }

  const handleLoadedMetadata = () => {
    const audio = audioRef.current
    if (!audio) return
    setDuration(audio.duration * 1000)
  }

  const handleEnded = () => {
    setPlaying(false)
    setCurrentTime(0)
  }

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement).isContentEditable) return

      if (e.code === 'Space') {
        e.preventDefault()
        togglePlay()
      } else if (e.key === 'j') {
        e.preventDefault()
        seek(-3)
      } else if (e.key === 'k') {
        e.preventDefault()
        seek(3)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing])

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackRate
    }
  }, [playbackRate])

  // Close the speed / table-of-contents popovers on outside click or Escape.
  useEffect(() => {
    if (!showSpeedMenu && !showTocMenu) return

    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as Node
      if (speedMenuRef.current?.contains(target) || tocMenuRef.current?.contains(target)) {
        return
      }
      setShowSpeedMenu(false)
      setShowTocMenu(false)
    }

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowSpeedMenu(false)
        setShowTocMenu(false)
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [showSpeedMenu, showTocMenu])

  const handleSpeedChange = (rate: number) => {
    setPlaybackRate(rate)
    if (audioRef.current) {
      audioRef.current.playbackRate = rate
    }
    setShowSpeedMenu(false)
  }

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0

  const handleProgressChange = (event: ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current
    if (!audio) return

    const nextTimeMs = Number(event.target.value)
    audio.currentTime = nextTimeMs / 1000
    setCurrentTime(nextTimeMs)
  }

  const handleBarClick = (barIndex: number) => {
    const audio = audioRef.current
    if (!audio || !duration) return
    const nextTimeMs = (barIndex / BAR_COUNT) * duration
    audio.currentTime = nextTimeMs / 1000
    setCurrentTime(nextTimeMs)
  }

  return (
    <div className="flex flex-col gap-2.5">
      <audio
        ref={audioRef}
        src={src}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={handleEnded}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
      />

      {/* waveform progress */}
      <div className="relative">
        <div className="waveform-track" role="presentation">
          {waveformHeights.map((h, i) => {
            const barPercent = (i / BAR_COUNT) * 100
            const isPlayed = barPercent < progressPercent
            return (
              <button
                key={i}
                type="button"
                aria-hidden
                tabIndex={-1}
                onClick={() => handleBarClick(i)}
                className="waveform-bar cursor-pointer"
                style={{
                  height: `${h * 100}%`,
                  backgroundColor: isPlayed
                    ? 'var(--accent)'
                    : 'var(--ink-line)',
                }}
              />
            )
          })}
        </div>
        <input
          type="range"
          min={0}
          max={Math.max(duration, 0)}
          step={100}
          value={Math.min(currentTime, duration || currentTime)}
          onChange={handleProgressChange}
          aria-label={`${title || 'セグメント'}の再生位置`}
          className="waveform-input absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
      </div>

      {/* time + controls row */}
      <div className="flex items-center justify-between">
        {/* playback speed */}
        <div className="relative" ref={speedMenuRef}>
          <button
            onClick={() => { setShowSpeedMenu(!showSpeedMenu); setShowTocMenu(false) }}
            className="flex items-center justify-center rounded-inset border border-ink-line bg-paper/60 p-2.5 text-ink-muted transition hover:border-ink hover:text-ink"
            title="再生速度"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m12 14 4-4" />
              <path d="M3.34 19a10 10 0 1 1 17.32 0" />
            </svg>
          </button>
          {showSpeedMenu && (
            <div className="absolute bottom-full left-0 mb-2 rounded-inset border border-ink-line bg-paper py-1 shadow-lg">
              {[0.5, 0.75, 1].map((rate) => (
                <button
                  key={rate}
                  onClick={() => handleSpeedChange(rate)}
                  className={`w-full px-4 py-2 text-start text-sm transition hover:bg-surface ${playbackRate === rate ? 'font-medium text-accent' : 'text-ink-muted'}`}
                >
                  {rate}x
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 sm:gap-6">
          {/* rewind 3s */}
          <button
            onClick={() => seek(-3)}
            className="flex items-center justify-center rounded-inset border border-ink-line bg-paper/60 p-2.5 text-ink-muted transition hover:border-ink hover:text-ink"
            title="3秒戻る (j)"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" overflow="visible">
              <g transform="rotate(45 12 12)" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                <path d="M3 3v5h5" />
              </g>
              <text x="12" y="15" textAnchor="middle" fontSize="8" fontWeight="700" fill="currentColor" fontFamily="sans-serif">3</text>
            </svg>
          </button>

          {/* time */}
          <div className="text-center font-mono text-sm tabular-nums text-ink-muted">
            {formatTime(currentTime)}
            <span className="mx-0.5 text-ink-faint">/</span>
            {formatTime(duration)}
          </div>

          {/* play/pause */}
          <button
            onClick={togglePlay}
            className="flex h-12 w-12 items-center justify-center rounded-full bg-accent text-paper shadow-[0_4px_16px_rgba(60,122,85,0.3)] transition hover:bg-accent-deep active:scale-95"
            title={playing ? '一時停止 (Space)' : '再生 (Space)'}
          >
            {playing ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="4" width="4" height="16" rx="1" />
                <rect x="14" y="4" width="4" height="16" rx="1" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="6,3 20,12 6,21" />
              </svg>
            )}
          </button>

          {/* forward 3s */}
          <button
            onClick={() => seek(3)}
            className="flex items-center justify-center rounded-inset border border-ink-line bg-paper/60 p-2.5 text-ink-muted transition hover:border-ink hover:text-ink"
            title="3秒進む (k)"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" overflow="visible">
              <g transform="rotate(-45 12 12)" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
                <path d="M21 3v5h-5" />
              </g>
              <text x="12" y="15" textAnchor="middle" fontSize="8" fontWeight="700" fill="currentColor" fontFamily="sans-serif">3</text>
            </svg>
          </button>
        </div>

        {/* table of contents */}
        <div className="relative" ref={tocMenuRef}>
          <button
            onClick={() => { setShowTocMenu(!showTocMenu); setShowSpeedMenu(false) }}
            className="flex items-center justify-center rounded-inset border border-ink-line bg-paper/60 p-2.5 text-ink-muted transition hover:border-ink hover:text-ink"
            title="目次"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 12h.01" />
              <path d="M3 18h.01" />
              <path d="M3 6h.01" />
              <path d="M8 12h13" />
              <path d="M8 18h13" />
              <path d="M8 6h13" />
            </svg>
          </button>
          {showTocMenu && (
            <div className="absolute bottom-full right-0 mb-2 w-64 rounded-inset border border-ink-line bg-paper py-1 shadow-lg">
              <div className="border-b border-ink-line/50 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-faint">目次</div>
              {segments.map((seg) => (
                <Link
                  key={seg.id}
                  href={`/projects/${projectId}/segments/${seg.id}`}
                  onClick={() => setShowTocMenu(false)}
                  className={`flex items-center gap-2 px-3 py-2 text-sm transition hover:bg-surface ${seg.id === segmentId ? 'font-medium text-accent' : 'text-ink-muted'}`}
                >
                  {seg.id === segmentId && (
                    <span className="flex h-2 w-2 shrink-0 rounded-full bg-accent" />
                  )}
                  <span className="truncate">{seg.title ?? `セグメント${seg.index + 1}`}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
