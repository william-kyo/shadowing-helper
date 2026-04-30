import { z } from 'zod'

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  STORAGE_ROOT: z.string().default('storage/projects'),
  STORAGE_BUCKET: z.string().default('app-media'),
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  GROQ_API_KEY: z.string().min(1),
})

export const env = envSchema.parse({
  DATABASE_URL: process.env.DATABASE_URL,
  STORAGE_ROOT: process.env.STORAGE_ROOT,
  STORAGE_BUCKET: process.env.STORAGE_BUCKET,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  GROQ_API_KEY: process.env.GROQ_API_KEY,
})
