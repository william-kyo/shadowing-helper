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

export async function transcribeAudio(params: {
  audioBuffer: ArrayBuffer | Uint8Array | Buffer
  fileName: string
  mimeType: string
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
