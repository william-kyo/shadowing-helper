import { env } from '@/lib/env'

export async function transcribeAudio(audioPath: string): Promise<string> {
  const apiKey = env.GROQ_API_KEY

  const formData = new FormData()
  const audioBuffer = await import('node:fs/promises').then((fs) =>
    fs.readFile(audioPath)
  )
  const audioFile = new File([audioBuffer], 'audio.webm', { type: 'audio/webm' })
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
