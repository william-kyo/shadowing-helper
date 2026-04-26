import { AsyncLocalStorage } from 'node:async_hooks'
import { randomUUID } from 'node:crypto'
import { performance } from 'node:perf_hooks'

type PerfValue = string | number | boolean | null | undefined

type PerfContext = {
  requestId: string
  kind: 'api' | 'page'
  route: string
  method?: string
  start: number
  coldStart: boolean
  steps: Record<string, number>
  attrs: Record<string, PerfValue>
}

let isColdStart = true

const perfStorage = new AsyncLocalStorage<PerfContext>()

function roundedMs(value: number) {
  return Math.round(value * 10) / 10
}

function currentPerf() {
  return perfStorage.getStore()
}

function recordStep(name: string, durationMs: number) {
  const perf = currentPerf()
  if (!perf) return

  const ms = roundedMs(durationMs)
  perf.steps[name] = roundedMs((perf.steps[name] ?? 0) + ms)

  const countKey = `${name}.count`
  perf.attrs[countKey] = Number(perf.attrs[countKey] ?? 0) + 1
}

export function addPerfAttrs(attrs: Record<string, PerfValue>) {
  const perf = currentPerf()
  if (!perf) return

  for (const [key, value] of Object.entries(attrs)) {
    if (value !== undefined) {
      perf.attrs[key] = value
    }
  }
}

export async function measureStep<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const start = performance.now()
  try {
    return await fn()
  } finally {
    recordStep(name, performance.now() - start)
  }
}

export function measureStepSync<T>(name: string, fn: () => T): T {
  const start = performance.now()
  try {
    return fn()
  } finally {
    recordStep(name, performance.now() - start)
  }
}

function logPerf(perf: PerfContext, status?: number, error?: unknown) {
  const totalMs = roundedMs(performance.now() - perf.start)
  const errorMessage = error instanceof Error ? error.message : error ? String(error) : undefined

  console.info(
    JSON.stringify({
      type: 'perf',
      requestId: perf.requestId,
      kind: perf.kind,
      route: perf.route,
      method: perf.method,
      status,
      totalMs,
      coldStart: perf.coldStart,
      steps: perf.steps,
      attrs: perf.attrs,
      error: errorMessage,
      region: process.env.VERCEL_REGION ?? process.env.AWS_REGION ?? null,
      runtime: process.env.NEXT_RUNTIME ?? 'nodejs',
    }),
  )
}

function createPerfContext(kind: PerfContext['kind'], route: string, method?: string): PerfContext {
  const perf: PerfContext = {
    requestId: randomUUID(),
    kind,
    route,
    method,
    start: performance.now(),
    coldStart: isColdStart,
    steps: {},
    attrs: {},
  }

  isColdStart = false
  return perf
}

export async function withApiPerf(route: string, request: Request, handler: () => Promise<Response>) {
  const perf = createPerfContext('api', route, request.method)

  return perfStorage.run(perf, async () => {
    try {
      const response = await handler()
      logPerf(perf, response.status)
      return response
    } catch (error) {
      logPerf(perf, 500, error)
      throw error
    }
  })
}

export async function withPagePerf<T>(route: string, handler: () => Promise<T>) {
  const perf = createPerfContext('page', route)

  return perfStorage.run(perf, async () => {
    try {
      const result = await handler()
      logPerf(perf, 200)
      return result
    } catch (error) {
      logPerf(perf, 500, error)
      throw error
    }
  })
}
