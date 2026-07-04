import { z } from 'zod'

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  STORAGE_ROOT: z.string().default('storage/projects'),
  STORAGE_BUCKET: z.string().default('app-media'),
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  GROQ_API_KEY: z.string().min(1),
  // Provider for the text-analysis step (topic grouping + punctuation).
  // Whisper STT always stays on Groq; only chat completions can switch.
  LLM_PROVIDER: z.enum(['groq', 'opencode']).default('groq'),
  OPENCODE_API_KEY: z.string().optional(),
  // Optional override for the chat model id (defaults per provider).
  LLM_MODEL: z.string().optional(),
  // Web Push (VAPID). Optional: when unset, push features are disabled but the
  // rest of the app keeps working (dev/test environments).
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  // VAPID contact, e.g. "mailto:you@example.com" or the site origin URL.
  VAPID_SUBJECT: z.string().optional(),
  // Shared secret the pg_cron job presents as a Bearer token to /api/cron/*.
  CRON_SECRET: z.string().optional(),
})

export const env = envSchema.parse({
  DATABASE_URL: process.env.DATABASE_URL,
  STORAGE_ROOT: process.env.STORAGE_ROOT,
  STORAGE_BUCKET: process.env.STORAGE_BUCKET,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  GROQ_API_KEY: process.env.GROQ_API_KEY,
  LLM_PROVIDER: process.env.LLM_PROVIDER,
  OPENCODE_API_KEY: process.env.OPENCODE_API_KEY,
  LLM_MODEL: process.env.LLM_MODEL,
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY: process.env.VAPID_PRIVATE_KEY,
  VAPID_SUBJECT: process.env.VAPID_SUBJECT,
  CRON_SECRET: process.env.CRON_SECRET,
})
