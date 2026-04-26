#!/usr/bin/env node

import fs from 'node:fs'

const inputPath = process.argv[2]
const input = inputPath ? fs.readFileSync(inputPath, 'utf8') : fs.readFileSync(0, 'utf8')

if (input.trim().length === 0) {
  console.error(
    [
      'No log data found.',
      '',
      'Vercel CLI writes runtime log lines to stderr in some environments.',
      'Capture both stdout and stderr before running the summary:',
      '',
      '  vercel logs --environment production --source serverless --since 24h --expand > perf.log 2>&1',
      '  npm run perf:summary perf.log',
    ].join('\n'),
  )
  process.exit(1)
}

function tryParseJson(line) {
  const start = line.indexOf('{')
  if (start === -1) return null

  try {
    return JSON.parse(line.slice(start))
  } catch {
    return null
  }
}

function percentile(values, pct) {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.ceil((pct / 100) * sorted.length) - 1
  return sorted[Math.min(Math.max(index, 0), sorted.length - 1)]
}

function round(value) {
  return Math.round(value * 10) / 10
}

const routeTotals = new Map()
const stepTotals = new Map()
const browserTotals = new Map()
let parsedJsonCount = 0

for (const line of input.split('\n')) {
  const entry = tryParseJson(line)
  if (!entry || typeof entry !== 'object') continue
  parsedJsonCount += 1

  if (entry.type === 'perf' && typeof entry.route === 'string' && typeof entry.totalMs === 'number') {
    const routeKey = `${entry.method ?? entry.kind ?? 'PAGE'} ${entry.route}`
    const routeValues = routeTotals.get(routeKey) ?? []
    routeValues.push(entry.totalMs)
    routeTotals.set(routeKey, routeValues)

    if (entry.steps && typeof entry.steps === 'object') {
      for (const [step, value] of Object.entries(entry.steps)) {
        if (typeof value !== 'number') continue
        const stepKey = `${routeKey} :: ${step}`
        const stepValues = stepTotals.get(stepKey) ?? []
        stepValues.push(value)
        stepTotals.set(stepKey, stepValues)
      }
    }
  }

  if (entry.type === 'browser_perf' && typeof entry.pathname === 'string') {
    if (entry.source === 'web_vital' && entry.metric?.name && typeof entry.metric.value === 'number') {
      const key = `${entry.pathname} :: ${entry.metric.name}`
      const values = browserTotals.get(key) ?? []
      values.push(entry.metric.value)
      browserTotals.set(key, values)
    }

    if (entry.source === 'navigation' && typeof entry.navigation?.ttfbMs === 'number') {
      const key = `${entry.pathname} :: navigation.ttfbMs`
      const values = browserTotals.get(key) ?? []
      values.push(entry.navigation.ttfbMs)
      browserTotals.set(key, values)
    }
  }
}

if (routeTotals.size === 0 && stepTotals.size === 0 && browserTotals.size === 0) {
  console.error(
    [
      `Parsed ${parsedJsonCount} JSON line(s), but found no perf entries.`,
      'Expected log JSON with type "perf" or "browser_perf".',
    ].join('\n'),
  )
  process.exitCode = 1
}

function printSummary(title, groups) {
  console.log(`\n${title}`)
  console.log('count\tp50\tp95\tmax\tname')

  const rows = [...groups.entries()]
    .map(([name, values]) => ({
      name,
      count: values.length,
      p50: round(percentile(values, 50)),
      p95: round(percentile(values, 95)),
      max: round(Math.max(...values)),
    }))
    .sort((a, b) => b.p95 - a.p95)

  for (const row of rows) {
    console.log(`${row.count}\t${row.p50}\t${row.p95}\t${row.max}\t${row.name}`)
  }
}

printSummary('Route totals (ms)', routeTotals)
printSummary('Step timings (ms)', stepTotals)
printSummary('Browser timings', browserTotals)
