'use client'

import { useEffect } from 'react'
import { useReportWebVitals } from 'next/web-vitals'

type PerfPayload = {
  type: 'web_vital' | 'navigation'
  pathname: string
  metric?: {
    id: string
    name: string
    value: number
    rating?: string
    navigationType?: string
  }
  navigation?: {
    ttfbMs: number
    domContentLoadedMs: number
    loadMs: number
    transferSize?: number
    encodedBodySize?: number
  }
}

function sendPerf(payload: PerfPayload) {
  const body = JSON.stringify(payload)

  if (navigator.sendBeacon) {
    navigator.sendBeacon('/api/perf', body)
    return
  }

  void fetch('/api/perf', {
    method: 'POST',
    body,
    keepalive: true,
    headers: { 'Content-Type': 'application/json' },
  })
}

export function WebVitals() {
  useReportWebVitals((metric) => {
    sendPerf({
      type: 'web_vital',
      pathname: window.location.pathname,
      metric: {
        id: metric.id,
        name: metric.name,
        value: Math.round(metric.value * 10) / 10,
        rating: metric.rating,
        navigationType: metric.navigationType,
      },
    })
  })

  useEffect(() => {
    const reportNavigation = () => {
      const [navigation] = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[]
      if (!navigation) return

      sendPerf({
        type: 'navigation',
        pathname: window.location.pathname,
        navigation: {
          ttfbMs: Math.round((navigation.responseStart - navigation.requestStart) * 10) / 10,
          domContentLoadedMs: Math.round(navigation.domContentLoadedEventEnd * 10) / 10,
          loadMs: Math.round(navigation.loadEventEnd * 10) / 10,
          transferSize: navigation.transferSize,
          encodedBodySize: navigation.encodedBodySize,
        },
      })
    }

    if (document.readyState === 'complete') {
      reportNavigation()
      return
    }

    window.addEventListener('load', reportNavigation, { once: true })
    return () => window.removeEventListener('load', reportNavigation)
  }, [])

  return null
}
