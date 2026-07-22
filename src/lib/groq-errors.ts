// Typed error for Groq transcription failures so API routes can tell a bad
// user upload (Groq 400: "could not process file") apart from a genuine
// server-side failure. Lives outside groq.ts so routes and tests can import
// it without pulling in `server-only` or env access.
export class GroqTranscriptionError extends Error {
  constructor(
    readonly status: number,
    body: string,
  ) {
    // Keep the exact legacy message shape so Vercel error grouping stays
    // continuous with pre-existing occurrences.
    super(`Groq API error ${status}: ${body}`)
    this.name = 'GroqTranscriptionError'
  }
}
