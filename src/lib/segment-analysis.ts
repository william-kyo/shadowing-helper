import { env } from '@/lib/env'
import type { WhisperSegment } from '@/lib/groq'

export interface TopicSegment {
  title: string
  startIndex: number
  endIndex: number
  text: string
}

export async function analyzeTopicBoundaries(segments: WhisperSegment[]): Promise<TopicSegment[]> {
  const apiKey = env.GROQ_API_KEY

  const segmentsText = segments
    .map((s, i) => `[${i}] "${s.text}"`)
    .join('\n')

  const prompt = `You are given a transcript of an audio file, segmented by Whisper into sentences. Your task is to identify topic/theme changes and group consecutive segments into coherent paragraphs.

Each segment has:
- Index number (0-based, in order of appearance)
- The transcribed text

Analyze the transcript and identify where topic changes occur. Group consecutive segments that discuss the same topic into paragraphs.

Return a JSON object with a "paragraphs" array where each item represents a paragraph/topic with:
- "title": A short descriptive title (in Japanese, 5-15 characters)
- "startIndex": The index of the FIRST segment in this topic (use the exact index from the input)
- "endIndex": The index of the LAST segment in this topic (use the exact index from the input)
- "text": The combined text of all segments in this topic (join the text fields with spaces)

Rules:
1. Use EXACT segment indices from the input (0, 1, 2, etc.) - do not skip or reorder
2. startIndex must be <= endIndex
3. Groups should be consecutive indices (no gaps)
4. Titles should be concise and descriptive (e.g., "天気の話", "約束事", "今日の予定")
5. Return ONLY the JSON object with "paragraphs" array, no markdown code blocks

Transcript:
${segmentsText}`

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.3,
      response_format: { type: 'json_object' },
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Groq LLM API error ${response.status}: ${errorText}`)
  }

  const json = await response.json()
  const content = json.choices?.[0]?.message?.content

  if (!content) {
    throw new Error('No content in LLM response')
  }

  const parsed = JSON.parse(content)

  if (parsed.paragraphs && Array.isArray(parsed.paragraphs)) {
    return parsed.paragraphs as TopicSegment[]
  }

  if (parsed.topics && Array.isArray(parsed.topics)) {
    return parsed.topics as TopicSegment[]
  }

  if (parsed.segments && Array.isArray(parsed.segments)) {
    return parsed.segments as TopicSegment[]
  }

  if (Array.isArray(parsed)) {
    return parsed as TopicSegment[]
  }

  throw new Error(`Unexpected LLM response format: ${JSON.stringify(Object.keys(parsed))}`)
}
