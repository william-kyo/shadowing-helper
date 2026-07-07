import { env } from '@/lib/env'

interface ChatProvider {
  baseUrl: string
  headers: Record<string, string>
  model: string
}

// Both Groq and Xiaomi MiMo expose an OpenAI-compatible /chat/completions
// endpoint, so a single resolver + fetch covers both. MiMo has no STT, so this
// only governs the text-analysis step; Whisper stays on Groq.
function resolveChatProvider(): ChatProvider {
  if (env.LLM_PROVIDER === 'mimo') {
    if (!env.MIMO_API_KEY) {
      throw new Error('LLM_PROVIDER=mimo requires MIMO_API_KEY')
    }
    return {
      baseUrl: 'https://api.xiaomimimo.com/v1',
      // MiMo authenticates with a custom `api-key` header, not `Authorization: Bearer`.
      headers: { 'api-key': env.MIMO_API_KEY },
      model: env.LLM_MODEL ?? 'mimo-v2.5',
    }
  }

  return {
    baseUrl: 'https://api.groq.com/openai/v1',
    headers: { Authorization: `Bearer ${env.GROQ_API_KEY}` },
    model: env.LLM_MODEL ?? 'llama-3.3-70b-versatile',
  }
}

function parseJsonContent(content: string): unknown {
  // Some models wrap JSON in ```json fences despite response_format requests.
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
  return JSON.parse(fenced ? fenced[1] : content)
}

const MAX_ATTEMPTS = 3

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export async function chatJson(params: { prompt: string; temperature?: number }): Promise<unknown> {
  const provider = resolveChatProvider()
  const body = JSON.stringify({
    model: provider.model,
    messages: [{ role: 'user', content: params.prompt }],
    temperature: params.temperature ?? 0.3,
    response_format: { type: 'json_object' },
  })

  let lastError: unknown
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const response = await fetch(`${provider.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          ...provider.headers,
          'Content-Type': 'application/json',
        },
        body,
      })

      // Retry transient upstream failures (the endpoint 5xx's
      // intermittently); surface 4xx immediately since retrying won't help.
      if (response.status >= 500) {
        throw new Error(`LLM API error ${response.status}: ${await response.text()}`)
      }
      if (!response.ok) {
        throw Object.assign(new Error(`LLM API error ${response.status}: ${await response.text()}`), { fatal: true })
      }

      const json = await response.json()
      const content = json.choices?.[0]?.message?.content
      if (!content) {
        throw new Error('No content in LLM response')
      }
      return parseJsonContent(content)
    } catch (err) {
      lastError = err
      if ((err as { fatal?: boolean })?.fatal || attempt === MAX_ATTEMPTS) break
      await sleep(attempt * 600)
    }
  }

  throw lastError
}
