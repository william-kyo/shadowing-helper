import { NextResponse } from 'next/server'

const allowedMetricNames = new Set(['TTFB', 'FCP', 'LCP', 'FID', 'CLS', 'INP'])

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export async function POST(request: Request) {
  try {
    const body = await request.text()
    if (body.length > 4096) {
      return NextResponse.json({ ok: false }, { status: 413 })
    }

    const payload = JSON.parse(body) as unknown
    if (!isPlainObject(payload)) {
      return NextResponse.json({ ok: false }, { status: 400 })
    }

    const type = payload.type
    const pathname = typeof payload.pathname === 'string' ? payload.pathname.slice(0, 200) : null

    if (type === 'web_vital' && isPlainObject(payload.metric)) {
      const name = payload.metric.name
      if (typeof name === 'string' && allowedMetricNames.has(name)) {
        console.info(
          JSON.stringify({
            type: 'browser_perf',
            source: 'web_vital',
            pathname,
            metric: {
              id: typeof payload.metric.id === 'string' ? payload.metric.id : null,
              name,
              value: typeof payload.metric.value === 'number' ? payload.metric.value : null,
              rating: typeof payload.metric.rating === 'string' ? payload.metric.rating : null,
              navigationType:
                typeof payload.metric.navigationType === 'string' ? payload.metric.navigationType : null,
            },
          }),
        )
      }
    }

    if (type === 'navigation' && isPlainObject(payload.navigation)) {
      console.info(
        JSON.stringify({
          type: 'browser_perf',
          source: 'navigation',
          pathname,
          navigation: {
            ttfbMs: typeof payload.navigation.ttfbMs === 'number' ? payload.navigation.ttfbMs : null,
            domContentLoadedMs:
              typeof payload.navigation.domContentLoadedMs === 'number'
                ? payload.navigation.domContentLoadedMs
                : null,
            loadMs: typeof payload.navigation.loadMs === 'number' ? payload.navigation.loadMs : null,
            transferSize:
              typeof payload.navigation.transferSize === 'number' ? payload.navigation.transferSize : null,
            encodedBodySize:
              typeof payload.navigation.encodedBodySize === 'number' ? payload.navigation.encodedBodySize : null,
          },
        }),
      )
    }

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 })
  }
}
