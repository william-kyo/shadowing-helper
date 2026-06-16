// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { recordingContentTypeFromKey } from '@/lib/recording-storage'

describe('recordingContentTypeFromKey', () => {
  it('maps known recording extensions to audio MIME types', () => {
    expect(recordingContentTypeFromKey('u/p/r/s/4/0/abc.webm')).toBe('audio/webm')
    expect(recordingContentTypeFromKey('u/p/r/s/4/0/abc.mp4')).toBe('audio/mp4')
    expect(recordingContentTypeFromKey('u/p/r/s/4/0/abc.m4a')).toBe('audio/mp4')
    expect(recordingContentTypeFromKey('u/p/r/s/4/0/abc.ogg')).toBe('audio/ogg')
    expect(recordingContentTypeFromKey('u/p/r/s/4/0/abc.wav')).toBe('audio/wav')
  })

  it('is case-insensitive', () => {
    expect(recordingContentTypeFromKey('u/p/r/s/4/0/ABC.MP4')).toBe('audio/mp4')
    expect(recordingContentTypeFromKey('u/p/r/s/4/0/ABC.WebM')).toBe('audio/webm')
  })

  it('falls back to audio/webm for unknown or missing extensions', () => {
    expect(recordingContentTypeFromKey('u/p/r/s/4/0/abc.xyz')).toBe('audio/webm')
    expect(recordingContentTypeFromKey('u/p/r/s/4/0/noext')).toBe('audio/webm')
  })
})
