import { env } from '@/lib/env'

export interface WhisperSegment {
  id: number
  seek: number
  start: number
  end: number
  text: string
  tokens: number[]
  temperature: number
  avg_logprob: number
  compression_ratio: number
  no_speech_prob: number
}

export interface WhisperResponse {
  task: string
  language: string
  duration: number
  text: string
  segments: WhisperSegment[]
}

// The app is Japanese-only end to end (sentence splitting, punctuation
// restoration, and CER scoring are all Japanese-specific), so transcription
// defaults to pinning Whisper to Japanese. Without an explicit language,
// Whisper auto-detects from the first seconds of audio — reliable on long
// reference uploads, but short single-sentence stage 4 recordings (accented
// speech, leading silence, mic noise) regularly get misdetected and come back
// transcribed in the wrong language/script, tanking the CER score.
//
// Deliberately NOT supported: passing the expected sentence as a Whisper
// `prompt`. It would anchor the script even harder, but Whisper parrots prompt
// text it half-hears, which inflates shadowing scores.
const DEFAULT_TRANSCRIPTION_LANGUAGE = 'ja'

export async function transcribeAudio(params: {
  audioBuffer: ArrayBuffer | Uint8Array | Buffer
  fileName: string
  mimeType: string
  // ISO-639-1 code. Defaults to Japanese; pass another code only if a
  // non-Japanese flow ever appears.
  language?: string
}): Promise<string> {
  const apiKey = env.GROQ_API_KEY
  const audioBytes = params.audioBuffer instanceof ArrayBuffer
    ? new Uint8Array(params.audioBuffer)
    : Uint8Array.from(params.audioBuffer)

  const formData = new FormData()
  const audioFile = new File([audioBytes], params.fileName, { type: params.mimeType })
  formData.append('file', audioFile)
  formData.append('model', 'whisper-large-v3-turbo')
  formData.append('response_format', 'text')
  formData.append('language', params.language ?? DEFAULT_TRANSCRIPTION_LANGUAGE)

  const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: formData,
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Groq API error ${response.status}: ${errorText}`)
  }

  const text = await response.text()
  return text
}

export async function transcribeAudioWithSegments(params: {
  audioBuffer: ArrayBuffer | Uint8Array | Buffer
  fileName: string
  mimeType: string
  // ISO-639-1 code. Defaults to Japanese; see DEFAULT_TRANSCRIPTION_LANGUAGE.
  language?: string
}): Promise<WhisperResponse> {
  const apiKey = env.GROQ_API_KEY
  const audioBytes = params.audioBuffer instanceof ArrayBuffer
    ? new Uint8Array(params.audioBuffer)
    : Uint8Array.from(params.audioBuffer)

  const formData = new FormData()
  const audioFile = new File([audioBytes], params.fileName, { type: params.mimeType })
  formData.append('file', audioFile)
  formData.append('model', 'whisper-large-v3-turbo')
  formData.append('response_format', 'verbose_json')
  formData.append('language', params.language ?? DEFAULT_TRANSCRIPTION_LANGUAGE)

  const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: formData,
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Groq API error ${response.status}: ${errorText}`)
  }

  const json = await response.json() as WhisperResponse
  return json
}
