import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/env', () => ({
  env: { GROQ_API_KEY: 'test-key' },
}))

const { transcribeAudio, transcribeAudioWithSegments } = await import('@/lib/groq')

function mockFetchOnce(body: string | object) {
  const response =
    typeof body === 'string'
      ? new Response(body, { status: 200 })
      : new Response(JSON.stringify(body), { status: 200 })
  const fetchMock = vi.fn().mockResolvedValue(response)
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function sentFormData(fetchMock: ReturnType<typeof vi.fn>): FormData {
  const body = fetchMock.mock.calls[0]?.[1]?.body
  expect(body).toBeInstanceOf(FormData)
  return body as FormData
}

const audioParams = {
  audioBuffer: new Uint8Array([1, 2, 3]),
  fileName: 'take.webm',
  mimeType: 'audio/webm',
}

describe('groq transcription language pinning', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('transcribeAudio pins Japanese by default', async () => {
    // Short stage 4 recordings get language-misdetected without this pin,
    // coming back transcribed in the wrong script and tanking the CER score.
    const fetchMock = mockFetchOnce('こんにちは')
    await transcribeAudio(audioParams)
    expect(sentFormData(fetchMock).get('language')).toBe('ja')
  })

  it('transcribeAudioWithSegments pins Japanese by default', async () => {
    const fetchMock = mockFetchOnce({ task: 'transcribe', language: 'ja', duration: 1, text: '', segments: [] })
    await transcribeAudioWithSegments(audioParams)
    expect(sentFormData(fetchMock).get('language')).toBe('ja')
  })

  it('accepts an explicit language override', async () => {
    const fetchMock = mockFetchOnce('hello')
    await transcribeAudio({ ...audioParams, language: 'en' })
    expect(sentFormData(fetchMock).get('language')).toBe('en')
  })

  it('transcribeAudioWithSegments accepts an explicit language override', async () => {
    const fetchMock = mockFetchOnce({ task: 'transcribe', language: 'en', duration: 1, text: '', segments: [] })
    await transcribeAudioWithSegments({ ...audioParams, language: 'en' })
    expect(sentFormData(fetchMock).get('language')).toBe('en')
  })
})
