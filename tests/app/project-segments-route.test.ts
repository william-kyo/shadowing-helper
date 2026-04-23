import { afterEach, describe, expect, it, vi } from 'vitest'

const { findProject, createSegment, getPaths, createStoredFileName, downloadStorageObject, uploadBufferToStorage, extractAudioSegmentFromBuffer, createSupabaseServerClient, transcribeAudio } = vi.hoisted(() => ({
  findProject: vi.fn(),
  createSegment: vi.fn(),
  getPaths: vi.fn(),
  createStoredFileName: vi.fn(),
  downloadStorageObject: vi.fn(),
  uploadBufferToStorage: vi.fn(),
  extractAudioSegmentFromBuffer: vi.fn(),
  createSupabaseServerClient: vi.fn(),
  transcribeAudio: vi.fn(),
}))

afterEach(() => {
  vi.restoreAllMocks()
})

vi.mock('@/lib/auth', () => ({
  requireAppUserForApi: vi.fn().mockResolvedValue({
    user: { id: 'user-1', supabaseUserId: 'sb-user-1', email: 'owner@example.com' },
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
  downloadStorageObject,
  uploadBufferToStorage,
  buildStorageObjectKey: (directory: string, fileName: string) => `${directory}/${fileName}`,
}))

vi.mock('@/lib/segment-audio', () => ({
  extractAudioSegmentFromBuffer,
}))

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient,
}))

vi.mock('@/lib/groq', () => ({
  transcribeAudio,
}))

import { POST } from '@/app/api/projects/[projectId]/segments/route'

describe('POST /api/projects/[projectId]/segments', () => {
  it('creates a segment, extracts audio, initializes five stages, and returns the new segment', async () => {
    findProject.mockResolvedValue({
      id: 'project-1',
      title: 'lesson',
      audioPath: 'sb-user-1/projects/project-1/audio/source.wav',
      audioMimeType: 'audio/wav',
      audioOriginalName: 'source.wav',
      segments: [{ id: 'seg-1', index: 0 }],
    })
    getPaths.mockReturnValue({
      projectDir: 'sb-user-1/projects/project-1',
      audioDir: 'sb-user-1/projects/project-1/audio',
      imageDir: 'sb-user-1/projects/project-1/images',
      recordingDir: 'sb-user-1/projects/project-1/recordings',
    })
    createStoredFileName.mockReturnValue('segment-2.wav')
    createSupabaseServerClient.mockResolvedValue({})
    downloadStorageObject.mockResolvedValue(Buffer.from('source-audio').buffer)
    extractAudioSegmentFromBuffer.mockResolvedValue(Buffer.from('segment-audio'))
    transcribeAudio.mockResolvedValue('transcribed text')
    createSegment.mockResolvedValue({
      id: 'seg-2',
      index: 1,
      title: '01',
      startMs: 0,
      endMs: 16000,
      audioPath: 'sb-user-1/projects/project-1/audio/segment-2.wav',
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
    expect(downloadStorageObject).toHaveBeenCalledWith({
      client: {},
      objectKey: 'sb-user-1/projects/project-1/audio/source.wav',
    })
    expect(extractAudioSegmentFromBuffer).toHaveBeenCalledWith({
      inputBuffer: expect.any(Buffer),
      inputExtension: '.wav',
      outputExtension: '.wav',
      startSeconds: 0,
      endSeconds: 16,
    })
    expect(uploadBufferToStorage).toHaveBeenCalledWith({
      client: {},
      objectKey: 'sb-user-1/projects/project-1/audio/segment-2.wav',
      buffer: Buffer.from('segment-audio'),
      contentType: 'audio/wav',
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
