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

function formatTime(ms: number): string {
  const totalSeconds = Math.round(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

export function SegmentAudioPlayer({ src, title, projectId, segmentId, segments }: SegmentAudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [playbackRate, setPlaybackRate] = useState(1)
  const [showSpeedMenu, setShowSpeedMenu] = useState(false)
  const [showTocMenu, setShowTocMenu] = useState(false)

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
      <div className="flex items-center justify-between">
        {/* playback speed - left */}
        <div className="relative">
          <button
            onClick={() => { setShowSpeedMenu(!showSpeedMenu); setShowTocMenu(false) }}
            className="flex items-center justify-center rounded-2xl border border-zinc-300 bg-white p-3 text-zinc-500 shadow-sm transition hover:border-zinc-900 hover:bg-zinc-50"
            title="再生速度"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m12 14 4-4"></path>
              <path d="M3.34 19a10 10 0 1 1 17.32 0"></path>
            </svg>
          </button>
          {showSpeedMenu && (
            <div className="absolute bottom-full mb-2 left-0 rounded-xl border border-zinc-200 bg-white py-1 shadow-lg">
              {[0.5, 0.75, 1].map((rate) => (
                <button
                  key={rate}
                  onClick={() => handleSpeedChange(rate)}
                  className={`w-full px-4 py-2 text-sm text-start transition hover:bg-zinc-50 ${playbackRate === rate ? 'font-medium text-indigo-600' : 'text-zinc-700'}`}
                >
                  {rate}x
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-4 sm:gap-12">
          {/* rewind 3s */}
          <button
            onClick={() => seek(-3)}
            className="flex items-center justify-center rounded-2xl border border-zinc-300 bg-white p-3 text-zinc-500 shadow-sm transition hover:border-zinc-900 hover:bg-zinc-50"
            title="3秒戻る (j)"
          >
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" overflow="visible">
              <g transform="rotate(45 12 12)" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                <path d="M3 3v5h5" />
              </g>
              <text x="12" y="15" textAnchor="middle" fontSize="8" fontWeight="700" fill="currentColor" fontFamily="sans-serif">3</text>
            </svg>
          </button>

          {/* play/pause */}
          <button
            onClick={togglePlay}
            className="flex h-14 w-14 items-center justify-center rounded-full bg-indigo-600 text-white shadow-lg transition hover:bg-indigo-700"
            title={playing ? '一時停止 (Space)' : '再生 (Space)'}
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
            className="flex items-center justify-center rounded-2xl border border-zinc-300 bg-white p-3 text-zinc-500 shadow-sm transition hover:border-zinc-900 hover:bg-zinc-50"
            title="3秒進む (k)"
          >
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" overflow="visible">
              <g transform="rotate(-45 12 12)" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
                <path d="M21 3v5h-5" />
              </g>
              <text x="12" y="15" textAnchor="middle" fontSize="8" fontWeight="700" fill="currentColor" fontFamily="sans-serif">3</text>
            </svg>
          </button>
        </div>

        {/* table of contents - right */}
        <div className="relative">
          <button
            onClick={() => { setShowTocMenu(!showTocMenu); setShowSpeedMenu(false) }}
            className="flex items-center justify-center rounded-2xl border border-zinc-300 bg-white p-3 text-zinc-500 shadow-sm transition hover:border-zinc-900 hover:bg-zinc-50"
            title="目次"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 12h.01"></path>
              <path d="M3 18h.01"></path>
              <path d="M3 6h.01"></path>
              <path d="M8 12h13"></path>
              <path d="M8 18h13"></path>
              <path d="M8 6h13"></path>
            </svg>
          </button>
          {showTocMenu && (
            <div className="absolute bottom-full mb-2 right-0 w-64 rounded-xl border border-zinc-200 bg-white py-1 shadow-lg">
              <div className="border-b border-zinc-100 px-3 py-2 text-xs font-medium text-zinc-400">目次</div>
              {segments.map((seg) => (
                <Link
                  key={seg.id}
                  href={`/projects/${projectId}/segments/${seg.id}`}
                  onClick={() => setShowTocMenu(false)}
                  className={`flex items-center gap-2 px-3 py-2 text-sm transition hover:bg-zinc-50 ${seg.id === segmentId ? 'text-indigo-600 font-medium' : 'text-zinc-700'}`}
                >
                  {seg.id === segmentId && (
                    <span className="flex h-2 w-2 shrink-0 rounded-full bg-indigo-600" />
                  )}
                  <span className="truncate">{seg.title ?? `Segment ${seg.index + 1}`}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-2">
        <div className="relative h-4 w-full">
          <div className="absolute inset-x-0 top-1/2 h-3 -translate-y-1/2 rounded-full bg-zinc-200" />
          <div
            className="absolute inset-y-0 left-0 top-1/2 h-3 -translate-y-1/2 rounded-full bg-indigo-600 transition-[width] duration-100"
            style={{ width: `${progressPercent}%` }}
          />
          <input
            type="range"
            min={0}
            max={Math.max(duration, 0)}
            step={100}
            value={Math.min(currentTime, duration || currentTime)}
            onChange={handleProgressChange}
            aria-label={`${title || 'Segment'} audio progress`}
            className="absolute inset-0 h-full w-full cursor-pointer appearance-none bg-transparent [&::-webkit-slider-runnable-track]:h-3 [&::-webkit-slider-runnable-track]:bg-transparent [&::-webkit-slider-thumb]:mt-[-4px] [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:bg-indigo-600 [&::-webkit-slider-thumb]:shadow-md [&::-moz-range-track]:h-3 [&::-moz-range-track]:bg-transparent [&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-white [&::-moz-range-thumb]:bg-indigo-600 [&::-moz-range-thumb]:shadow-md"
          />
        </div>
        <div className="flex justify-between text-xs text-zinc-400">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>
    </div>
  )
}