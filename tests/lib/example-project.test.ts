// @vitest-environment node
import { readFileSync } from 'node:fs'

import { beforeEach, describe, expect, it, vi } from 'vitest'

const { projectCreate } = vi.hoisted(() => ({ projectCreate: vi.fn() }))

vi.mock('@/lib/db', () => ({ db: { project: { create: projectCreate } } }))

import { EXAMPLE_PROJECT } from '@/lib/example-project.data'
import {
  EXAMPLE_AUDIO_OBJECT_KEY,
  isExampleProject,
  provisionExampleProject,
} from '@/lib/example-project'
import { buildSentenceUnits } from '@/lib/sentence-split'

describe('provisionExampleProject', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    projectCreate.mockResolvedValue({ id: 'proj-1' })
  })

  it('inserts the project, its one segment, and all five stages in a single call', async () => {
    await provisionExampleProject('user-1')

    expect(projectCreate).toHaveBeenCalledOnce()
    const data = projectCreate.mock.calls[0][0].data

    expect(data).toMatchObject({
      userId: 'user-1',
      audioPath: EXAMPLE_AUDIO_OBJECT_KEY,
      audioDurationMs: EXAMPLE_PROJECT.audioDurationMs,
      // Segmented at generation time — it must never render as pending work.
      status: 'processed',
    })

    const segments = data.segments.create
    expect(segments).toHaveLength(1)
    expect(segments[0]).toMatchObject({
      index: 0,
      text: EXAMPLE_PROJECT.segment.text,
      // The lone segment spans the whole clip, so it reuses the project's audio
      // object instead of needing its own cut.
      audioPath: EXAMPLE_AUDIO_OBJECT_KEY,
      startMs: 0,
      endMs: EXAMPLE_PROJECT.audioDurationMs,
    })
    expect(segments[0].progress.create.map((row: { stage: number }) => row.stage)).toEqual([
      1, 2, 3, 4, 5,
    ])
  })

  it('ships pre-resolved transcription so no Whisper or LLM runs at sign-up', async () => {
    await provisionExampleProject('user-1')

    const persisted = projectCreate.mock.calls[0][0].data.segments.create[0].whisperSegments
    expect(persisted.length).toBeGreaterThan(0)
    // Every chunk already carries its speaker, which is what lets stage 4 skip
    // the backfill and stage 5 offer role practice immediately.
    expect(persisted.every((chunk: { speaker?: string }) => chunk.speaker)).toBe(true)
  })
})

describe('example project fixture', () => {
  const { segment, audioDurationMs } = EXAMPLE_PROJECT

  it('is a two-speaker dialogue, so stage 5 role practice has both roles', () => {
    const speakers = new Set(segment.whisperSegments.map((chunk) => chunk.speaker))
    expect([...speakers].sort()).toEqual(['A', 'B'])
  })

  it('keeps the script and the chunks telling the same story', () => {
    const strip = (value: string) => value.replace(/[\s。、！？!?,.]/g, '')
    const fromScript = strip(
      segment.text
        .split('\n')
        .map((line) => line.replace(/^\s*[AB]\s*[:：]\s*/, ''))
        .join(''),
    )
    const fromChunks = strip(segment.whisperSegments.map((chunk) => chunk.text).join(''))
    expect(fromScript).toBe(fromChunks)
  })

  it('has chunk timings inside the clip and in ascending order', () => {
    let previousEnd = 0
    for (const chunk of segment.whisperSegments) {
      expect(chunk.startMs).toBeGreaterThanOrEqual(previousEnd)
      expect(chunk.endMs).toBeGreaterThan(chunk.startMs)
      expect(chunk.endMs).toBeLessThanOrEqual(audioDurationMs)
      previousEnd = chunk.endMs
    }
  })

  it('points at the same object key the upload script writes', () => {
    // Drift here would 404 the audio for every newly registered user, and only
    // at runtime — so pin the two literals together.
    const script = readFileSync('scripts/upload-example-audio.mjs', 'utf8')
    expect(script).toContain(`'${EXAMPLE_AUDIO_OBJECT_KEY}'`)
  })

  it('yields practisable stage 4 sentences without any server work', () => {
    const units = buildSentenceUnits(segment.whisperSegments)
    expect(units.length).toBeGreaterThan(0)
    expect(units.every((unit) => unit.text.length > 0)).toBe(true)
    expect(units.every((unit) => unit.speaker === 'A' || unit.speaker === 'B')).toBe(true)
  })
})

describe('isExampleProject', () => {
  it('recognises the seeded sample by its shared audio key', () => {
    expect(isExampleProject({ audioPath: EXAMPLE_AUDIO_OBJECT_KEY })).toBe(true)
  })

  it('treats anything the learner uploaded as their own', () => {
    // Uploads always land under the owner's own prefix — nothing else can write
    // to examples/ — so the key is a reliable marker.
    expect(isExampleProject({ audioPath: 'uid-1/projects/p1/audio/lesson.mp3' })).toBe(false)
    expect(isExampleProject({ audioPath: 'examples/other/thing.mp3' })).toBe(false)
  })
})
