import { env } from '@/lib/env'

interface ChatProvider {
  baseUrl: string
  apiKey: string
  model: string
}

// Both Groq and opencode Go expose an OpenAI-compatible /chat/completions
// endpoint, so a single resolver + fetch covers both. opencode Go has no STT,
// so this only governs the text-analysis step; Whisper stays on Groq.
function resolveChatProvider(): ChatProvider {
  if (env.LLM_PROVIDER === 'opencode') {
    if (!env.OPENCODE_API_KEY) {
      throw new Error('LLM_PROVIDER=opencode requires OPENCODE_API_KEY')
    }
    return {
      baseUrl: 'https://opencode.ai/zen/go/v1',
      apiKey: env.OPENCODE_API_KEY,
      // The /zen/go endpoint is already scoped to the Go plan, so model IDs are
      // bare (e.g. "glm-5.1", "kimi-k2.6", "qwen3.7-max"), not "opencode-go/...".
      model: env.LLM_MODEL ?? 'glm-5.1',
    }
  }

  return {
    baseUrl: 'https://api.groq.com/openai/v1',
    apiKey: env.GROQ_API_KEY,
    model: env.LLM_MODEL ?? 'llama-3.3-70b-versatile',
  }
}

function parseJsonContent(content: string): unknown {
  // Some models wrap JSON in ```json fences despite response_format requests.
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
  return JSON.parse(fenced ? fenced[1] : content)
}

export async function chatJson(params: { prompt: string; temperature?: number }): Promise<unknown> {
  const provider = resolveChatProvider()

  const response = await fetch(`${provider.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${provider.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: provider.model,
      messages: [{ role: 'user', content: params.prompt }],
      temperature: params.temperature ?? 0.3,
      response_format: { type: 'json_object' },
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`LLM API error ${response.status}: ${errorText}`)
  }

  const json = await response.json()
  const content = json.choices?.[0]?.message?.content

  if (!content) {
    throw new Error('No content in LLM response')
  }

  return parseJsonContent(content)
}
