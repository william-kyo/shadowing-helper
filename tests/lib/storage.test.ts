import { describe, expect, it } from 'vitest'

import { createStoredFileName, getProjectStoragePaths } from '@/lib/storage'

describe('storage helpers', () => {
  it('preserves a lowercase file extension when generating stored filenames', () => {
    const fileName = createStoredFileName('My Script.PNG')

    expect(fileName).toMatch(/\.png$/)
  })

  it('returns deterministic directories for a project', () => {
    expect(getProjectStoragePaths('supabase-user-1', 'project-123')).toEqual({
      projectDir: 'supabase-user-1/projects/project-123',
      audioDir: 'supabase-user-1/projects/project-123/audio',
      imageDir: 'supabase-user-1/projects/project-123/images',
      recordingDir: 'supabase-user-1/projects/project-123/recordings',
    })
  })
})
