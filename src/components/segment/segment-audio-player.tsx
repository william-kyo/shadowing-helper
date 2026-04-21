'use client'

import { useRef, useState } from 'react'

type SegmentAudioPlayerProps = {
  src: string
  title: string
}

function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  const tenths = Math.floor((ms % 1000) / 100)
  return `${minutes}:${seconds.toString().padStart(2, '0')}.${tenths}`
}

export function SegmentAudioPlayer({ src, title }: SegmentAudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)

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
    // Guard: if duration is not loaded yet, audio.duration is NaN
    // Math.min(NaN, x) = NaN → currentTime becomes NaN → audio restarts
    if (!audio.duration || isNaN(audio.duration)) {
      // Fallback: seek without upper-bound check
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

  return (
    <div className="flex flex-col gap-4">
      <audio
        ref={audioRef}
        src={src}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={handleEnded}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
      />

      {/* time display */}
      <div className="text-center font-mono text-2xl font-medium text-zinc-800">
        {formatTime(currentTime)} <span className="text-zinc-400">/</span>{' '}
        <span className="text-zinc-500">{formatTime(duration)}</span>
      </div>

      {/* controls */}
      <div className="flex items-center justify-center gap-4">
        {/* rewind 3s */}
        <button
          onClick={() => seek(-3)}
          className="flex items-center gap-1 rounded-2xl border border-zinc-300 bg-white px-5 py-3 text-sm font-medium text-zinc-800 shadow-sm transition hover:border-zinc-900 hover:bg-zinc-50"
          title="3秒戻る"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M11 19l-7-7 7-7" />
            <path d="M22 19l-7-7 7-7" />
          </svg>
          3秒
        </button>

        {/* play/pause */}
        <button
          onClick={togglePlay}
          className="flex h-14 w-14 items-center justify-center rounded-full bg-indigo-600 text-white shadow-lg transition hover:bg-indigo-700"
          title={playing ? '一時停止' : '再生'}
        >
          {playing ? (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="4" width="4" height="16" rx="1" />
              <rect x="14" y="4" width="4" height="16" rx="1" />
            </svg>
          ) : (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="5,3 19,12 5,21" />
            </svg>
          )}
        </button>

        {/* forward 3s */}
        <button
          onClick={() => seek(3)}
          className="flex items-center gap-1 rounded-2xl border border-zinc-300 bg-white px-5 py-3 text-sm font-medium text-zinc-800 shadow-sm transition hover:border-zinc-900 hover:bg-zinc-50"
          title="3秒進む"
        >
          3秒
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M13 5l7 7-7 7" />
            <path d="M2 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* progress bar */}
      <div className="h-2 w-full rounded-full bg-zinc-200">
        <div
          className="h-2 rounded-full bg-indigo-600 transition-all duration-100"
          style={{ width: duration > 0 ? `${(currentTime / duration) * 100}%` : '0%' }}
        />
      </div>
    </div>
  )
}
