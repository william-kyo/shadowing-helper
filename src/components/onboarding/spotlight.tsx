'use client'

// Dimming spotlight for an onboarding hint.
//
// The dim is drawn as four rectangles around the target rather than one
// full-screen layer with a CSS cutout. That leaves a genuinely empty hole, so the
// highlighted control keeps receiving pointer and touch events with no
// pointer-events trickery — which matters here because the fixed bottom player
// sits under the overlay and a swallowed tap would strand the learner.
//
// If the target cannot be found the whole thing renders nothing: a dark screen
// highlighting nothing is far worse than no hint at all.

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

type Rect = { top: number; left: number; width: number; height: number }

type SpotlightProps = {
  // `data-tour` value of the element to highlight.
  anchor: string
  title: string
  body: string
  confirmLabel: string
  skipLabel: string
  onConfirm: () => void
  onSkip: () => void
}

const PADDING = 8
const TOOLTIP_GAP = 12
const TOOLTIP_WIDTH = 288

function readRect(element: Element): Rect {
  const rect = element.getBoundingClientRect()
  return {
    top: rect.top - PADDING,
    left: rect.left - PADDING,
    width: rect.width + PADDING * 2,
    height: rect.height + PADDING * 2,
  }
}

export function Spotlight({
  anchor,
  title,
  body,
  confirmLabel,
  skipLabel,
  onConfirm,
  onSkip,
}: SpotlightProps) {
  const [rect, setRect] = useState<Rect | null>(null)
  const tooltipRef = useRef<HTMLDivElement | null>(null)

  const measure = useCallback(() => {
    const element = document.querySelector(`[data-tour="${anchor}"]`)
    if (!element) {
      setRect(null)
      return
    }
    setRect(readRect(element))
  }, [anchor])

  // Bring the target into view, then measure it. Reading layout after commit is
  // what a layout effect is for, and there is no way to know an element's
  // on-screen rect without doing it — so this is a deliberate exception to the
  // no-setState-in-effect rule rather than an oversight.
  useLayoutEffect(() => {
    const element = document.querySelector(`[data-tour="${anchor}"]`)
    // Feature-detected rather than assumed: not every engine ships it, and a
    // missing scroll helper must not stop the hint from being measured.
    if (element instanceof HTMLElement && typeof element.scrollIntoView === 'function') {
      element.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    measure()
  }, [anchor, measure])

  useEffect(() => {
    let frame = 0
    const schedule = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(measure)
    }

    window.addEventListener('resize', schedule)
    window.addEventListener('scroll', schedule, true)
    // The anchor can be resized by its own content (a stage chip changing label),
    // which neither scroll nor resize reports. Optional — where it is missing the
    // hint simply relies on scroll and resize.
    const element = document.querySelector(`[data-tour="${anchor}"]`)
    const observer =
      typeof ResizeObserver === 'function' && element ? new ResizeObserver(schedule) : null
    if (observer && element) observer.observe(element)

    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', schedule)
      window.removeEventListener('scroll', schedule, true)
      observer?.disconnect()
    }
  }, [anchor, measure])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onSkip()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onSkip])

  useEffect(() => {
    tooltipRef.current?.focus()
  }, [anchor])

  if (!rect) return null

  const viewportHeight = window.innerHeight
  const viewportWidth = window.innerWidth
  const below = rect.top + rect.height + TOOLTIP_GAP
  const placeBelow = below + 180 < viewportHeight
  const tooltipTop = placeBelow ? below : Math.max(TOOLTIP_GAP, rect.top - 180 - TOOLTIP_GAP)
  const tooltipLeft = Math.min(
    Math.max(TOOLTIP_GAP, rect.left + rect.width / 2 - TOOLTIP_WIDTH / 2),
    Math.max(TOOLTIP_GAP, viewportWidth - TOOLTIP_WIDTH - TOOLTIP_GAP),
  )

  const dim = 'fixed bg-ink/55 transition-opacity'

  return createPortal(
    <div aria-live="polite">
      {/* Four panes around the hole. Clicking the dim skips, matching the usual
          "tap outside to get on with it" expectation. */}
      <div
        className={dim}
        style={{ top: 0, left: 0, width: '100vw', height: Math.max(0, rect.top) }}
        onClick={onSkip}
      />
      <div
        className={dim}
        style={{
          top: rect.top + rect.height,
          left: 0,
          width: '100vw',
          height: Math.max(0, viewportHeight - rect.top - rect.height),
        }}
        onClick={onSkip}
      />
      <div
        className={dim}
        style={{ top: rect.top, left: 0, width: Math.max(0, rect.left), height: rect.height }}
        onClick={onSkip}
      />
      <div
        className={dim}
        style={{
          top: rect.top,
          left: rect.left + rect.width,
          width: Math.max(0, viewportWidth - rect.left - rect.width),
          height: rect.height,
        }}
        onClick={onSkip}
      />

      {/* Ring around the hole. Non-interactive so the control underneath stays
          reachable. */}
      <div
        aria-hidden
        className="pointer-events-none fixed rounded-inset ring-2 ring-accent ring-offset-2 ring-offset-transparent"
        style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height }}
      />

      <div
        ref={tooltipRef}
        role="dialog"
        aria-modal="false"
        aria-label={title}
        tabIndex={-1}
        className="fixed rounded-card border border-ink-line bg-paper p-4 shadow-[0_18px_50px_-18px_rgba(29,27,24,0.5)] outline-none"
        style={{ top: tooltipTop, left: tooltipLeft, width: TOOLTIP_WIDTH }}
      >
        <p className="font-display text-base font-semibold tracking-tight text-ink">{title}</p>
        <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">{body}</p>
        <div className="mt-3 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={onSkip}
            className="rounded-chip px-2 py-1 text-xs font-medium text-ink-faint transition hover:text-ink-muted"
          >
            {skipLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-chip bg-accent px-4 py-2 text-sm font-semibold text-paper transition hover:bg-accent-deep"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
