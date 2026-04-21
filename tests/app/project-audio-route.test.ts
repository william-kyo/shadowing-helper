import { describe, expect, it, vi } from 'vitest'

const { findUnique, readFile } = vi.hoisted(() => ({
  findUnique: vi.fn(),
  readFile: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  db: {
    project: {
      findUnique,
    },
  },
}))

vi.mock('node:fs/promises', () => ({
  readFile,
}))

import { GET } from '@/app/api/projects/[projectId]/audio/route'

describe('GET /api/projects/[projectId]/audio', () => {
  it('returns the stored project audio with the project mime type', async () => {
    findUnique.mockResolvedValue({
      id: 'project-1',
      audioPath: '/tmp/project-1.wav',
      audioMimeType: 'audio/wav',
    })
    readFile.mockResolvedValue(Buffer.from('fake-audio'))

    const response = await GET(new Request('http://localhost/api/projects/project-1/audio'), {
      params: Promise.resolve({ projectId: 'project-1' }),
    })

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('audio/wav')
    expect(Buffer.from(await response.arrayBuffer()).toString()).toBe('fake-audio')
  })

  it('returns 404 when the project audio does not exist', async () => {
    findUnique.mockResolvedValue(null)

    const response = await GET(new Request('http://localhost/api/projects/missing/audio'), {
      params: Promise.resolve({ projectId: 'missing' }),
    })

    expect(response.status).toBe(404)
  })
})
