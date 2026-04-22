import { describe, expect, it, vi } from 'vitest'

const { findProject, createSegment, getPaths, createStoredFileName, extractAudioSegment } = vi.hoisted(() => ({
  findProject: vi.fn(),
  createSegment: vi.fn(),
  getPaths: vi.fn(),
  createStoredFileName: vi.fn(),
  extractAudioSegment: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({
  requireAppUserForApi: vi.fn().mockResolvedValue({
    user: { id: 'user-1', email: 'owner@example.com' },
    response: null,
  }),
}))

vi.mock('@/lib/db', () => ({
  db: {
    project: {
      findFirst: findProject,
    },
    segment: {
      create: createSegment,
    },
  },
}))

vi.mock('@/lib/storage', () => ({
  getProjectStoragePaths: getPaths,
  createStoredFileName,
}))

vi.mock('@/lib/segment-audio', () => ({
  extractAudioSegment,
}))

import { POST } from '@/app/api/projects/[projectId]/segments/route'

describe('POST /api/projects/[projectId]/segments', () => {
  it('creates a segment, extracts audio, initializes five stages, and returns the new segment', async () => {
    findProject.mockResolvedValue({
      id: 'project-1',
      title: 'lesson',
      audioPath: '/tmp/source.wav',
      audioMimeType: 'audio/wav',
      segments: [{ id: 'seg-1', index: 0 }],
    })
    getPaths.mockReturnValue({
      projectDir: 'storage/projects/project-1',
      audioDir: 'storage/projects/project-1/audio',
      imageDir: 'storage/projects/project-1/images',
      recordingDir: 'storage/projects/project-1/recordings',
    })
    createStoredFileName.mockReturnValue('segment-2.wav')
    createSegment.mockResolvedValue({
      id: 'seg-2',
      index: 1,
      title: '01',
      startMs: 0,
      endMs: 16000,
      audioPath: 'storage/projects/project-1/audio/segment-2.wav',
      progress: [1, 2, 3, 4, 5].map((stage) => ({ id: `sp-${stage}`, stage, status: 'not_started' })),
    })

    const request = new Request('http://localhost/api/projects/project-1/segments', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: '01', startSeconds: 0, endSeconds: 16 }),
    })

    const response = await POST(request, { params: Promise.resolve({ projectId: 'project-1' }) })
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(extractAudioSegment).toHaveBeenCalledWith({
      inputPath: '/tmp/source.wav',
      outputPath: 'storage/projects/project-1/audio/segment-2.wav',
      startSeconds: 0,
      endSeconds: 16,
    })
    expect(createSegment).toHaveBeenCalled()
    expect(json.segment).toMatchObject({
      id: 'seg-2',
      index: 1,
      title: '01',
      startMs: 0,
      endMs: 16000,
      progressCount: 5,
    })
  })
})
