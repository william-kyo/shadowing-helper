import { describe, expect, it } from 'vitest'

import { createStoredFileName, getProjectStoragePaths } from '@/lib/storage'

describe('storage helpers', () => {
  it('preserves a lowercase file extension when generating stored filenames', () => {
    const fileName = createStoredFileName('My Script.PNG')

    expect(fileName).toMatch(/\.png$/)
  })

  it('returns deterministic directories for a project', () => {
    expect(getProjectStoragePaths('project-123')).toEqual({
      projectDir: 'storage/projects/project-123',
      audioDir: 'storage/projects/project-123/audio',
      imageDir: 'storage/projects/project-123/images',
      recordingDir: 'storage/projects/project-123/recordings',
    })
  })
})
