import { z } from 'zod'

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  STORAGE_ROOT: z.string().default('storage/projects'),
  STORAGE_BUCKET: z.string().default('app-media'),
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  GROQ_API_KEY: z.string().min(1),
  GPT54_BASE_URL: z.string().optional(),
  GPT54_API_KEY: z.string().optional(),
  GPT54_MODEL: z.string().optional(),
})

export const env = envSchema.parse({
  DATABASE_URL: process.env.DATABASE_URL,
  STORAGE_ROOT: process.env.STORAGE_ROOT,
  STORAGE_BUCKET: process.env.STORAGE_BUCKET,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  GROQ_API_KEY: process.env.GROQ_API_KEY,
  GPT54_BASE_URL: process.env.GPT54_BASE_URL,
  GPT54_API_KEY: process.env.GPT54_API_KEY,
  GPT54_MODEL: process.env.GPT54_MODEL,
})
