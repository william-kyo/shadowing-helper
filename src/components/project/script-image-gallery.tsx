'use client'

import { useCallback, useEffect, useState } from 'react'

type ScriptImage = {
  id: string
  originalName: string
}

type ScriptImageGalleryProps = {
  projectId: string
  images: ScriptImage[]
}

/**
 * Script image grid with a tap-to-zoom lightbox.
 *
 * Shadowing practice means flipping between script pages constantly, so the
 * overlay supports keyboard (←/→/Esc) and on-screen prev/next in addition to
 * tap-to-close.
 */
export function ScriptImageGallery({ projectId, images }: ScriptImageGalleryProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(null)
  const isOpen = openIndex !== null

  const close = useCallback(() => setOpenIndex(null), [])
  const step = useCallback(
    (delta: number) =>
      setOpenIndex((current) => {
        if (current === null) return current
        const next = current + delta
        if (next < 0 || next >= images.length) return current
        return next
      }),
    [images.length],
  )

  useEffect(() => {
    if (!isOpen) return

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
      else if (e.key === 'ArrowRight') step(1)
      else if (e.key === 'ArrowLeft') step(-1)
    }

    document.addEventListener('keydown', handleKey)
    // Prevent the page behind the overlay from scrolling.
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handleKey)
      document.body.style.overflow = previousOverflow
    }
  }, [isOpen, close, step])

  const src = (id: string) => `/api/projects/${projectId}/images/${id}`

  return (
    <>
      <div className={`grid gap-4 ${images.length >= 5 ? 'grid-cols-3' : 'grid-cols-2'}`}>
        {images.map((image, index) => (
          <button
            key={image.id}
            type="button"
            onClick={() => setOpenIndex(index)}
            aria-label={`${image.originalName} を拡大表示`}
            className="group flex flex-col items-center gap-2 text-center"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src(image.id)}
              alt={image.originalName}
              loading="lazy"
              className="h-auto w-full rounded-inset border border-ink-line transition group-hover:border-accent group-hover:shadow-[0_8px_24px_-12px_rgba(29,27,24,0.5)]"
            />
            <span className="truncate text-xs text-ink-muted">{image.originalName}</span>
          </button>
        ))}
      </div>

      {isOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="台本画像ビューア"
          onClick={close}
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-paper-deep/92 p-4 backdrop-blur-sm sm:p-8"
          style={{
            paddingTop: 'calc(env(safe-area-inset-top) + 1rem)',
            paddingBottom: 'calc(env(safe-area-inset-bottom) + 1rem)',
          }}
        >
          {/* close */}
          <button
            type="button"
            onClick={close}
            aria-label="閉じる"
            className="absolute right-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-chip border border-paper/20 bg-paper/10 text-paper transition hover:bg-paper/20"
            style={{ top: 'calc(env(safe-area-inset-top) + 1rem)' }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>

          {/* image (stop propagation so taps on it don't close) */}
          <div onClick={(e) => e.stopPropagation()} className="flex max-h-full max-w-3xl flex-col items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src(images[openIndex].id)}
              alt={images[openIndex].originalName}
              className="max-h-[80vh] w-auto max-w-full rounded-inset object-contain shadow-2xl"
            />
            <p className="font-mono text-xs tracking-wide text-paper/70">
              {openIndex + 1} / {images.length} · {images[openIndex].originalName}
            </p>
          </div>

          {/* prev / next */}
          {openIndex > 0 ? (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); step(-1) }}
              aria-label="前の画像"
              className="absolute left-3 top-1/2 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-chip border border-paper/20 bg-paper/10 text-paper transition hover:bg-paper/20 sm:left-6"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </button>
          ) : null}
          {openIndex < images.length - 1 ? (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); step(1) }}
              aria-label="次の画像"
              className="absolute right-3 top-1/2 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-chip border border-paper/20 bg-paper/10 text-paper transition hover:bg-paper/20 sm:right-6"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 6l6 6-6 6" />
              </svg>
            </button>
          ) : null}
        </div>
      ) : null}
    </>
  )
}
