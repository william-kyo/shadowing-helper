import { describe, expect, it } from 'vitest'

import { createStoredFileName, getProjectStoragePaths } from '@/lib/storage'
import { sanitizeExtension, sanitizeFileExtension } from '@/lib/storage-paths'

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

describe('sanitizeFileExtension', () => {
  it('extracts and lowercases a known audio extension', () => {
    expect(sanitizeFileExtension('take.webm')).toBe('.webm')
    expect(sanitizeFileExtension('audio.MP3')).toBe('.mp3')
    expect(sanitizeFileExtension('clip.M4A')).toBe('.m4a')
  })

  it('extracts a known image extension', () => {
    expect(sanitizeFileExtension('photo.PNG')).toBe('.png')
    expect(sanitizeFileExtension('photo.JPEG')).toBe('.jpeg')
    expect(sanitizeFileExtension('photo.webp')).toBe('.webp')
  })

  it('returns empty string for unknown extensions', () => {
    expect(sanitizeFileExtension('file.flac')).toBe('')
    expect(sanitizeFileExtension('file.xyz')).toBe('')
  })

  it('returns empty string when no extension is present', () => {
    expect(sanitizeFileExtension('noext')).toBe('')
  })

  it('rejects path-traversal sequences in the extension', () => {
    expect(sanitizeFileExtension('take.webm/../../x')).toBe('')
    expect(sanitizeFileExtension('a.mp3/../b')).toBe('')
  })

  it('rejects extensions with non-alphanumeric characters', () => {
    expect(sanitizeFileExtension('file.webm;evil')).toBe('')
    expect(sanitizeFileExtension('file.mp3 evil')).toBe('')
  })
})

describe('sanitizeExtension', () => {
  it('normalizes a raw extension without a leading dot', () => {
    expect(sanitizeExtension('webm')).toBe('.webm')
    expect(sanitizeExtension('mp3')).toBe('.mp3')
  })

  it('preserves a leading dot', () => {
    expect(sanitizeExtension('.webm')).toBe('.webm')
    expect(sanitizeExtension('.mp4')).toBe('.mp4')
  })

  it('lowercases the extension', () => {
    expect(sanitizeExtension('WEBM')).toBe('.webm')
    expect(sanitizeExtension('.MP3')).toBe('.mp3')
  })

  it('returns empty string for unknown extensions', () => {
    expect(sanitizeExtension('flac')).toBe('')
    expect(sanitizeExtension('.exe')).toBe('')
  })

  it('rejects path-traversal or separator characters', () => {
    expect(sanitizeExtension('webm/../../x')).toBe('')
    expect(sanitizeExtension('mp3 evil')).toBe('')
    expect(sanitizeExtension('webm;evil')).toBe('')
  })

  it('returns empty string for empty input', () => {
    expect(sanitizeExtension('')).toBe('')
  })
})

describe('createStoredFileName (sanitization)', () => {
  it('produces a UUID-only name when the extension is a path-traversal attempt', () => {
    const result = createStoredFileName('take.webm/../../x')
    expect(result).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
  })

  it('appends a sanitized extension for valid filenames', () => {
    const result = createStoredFileName('recording.webm')
    expect(result).toMatch(/\.webm$/)
  })
})
