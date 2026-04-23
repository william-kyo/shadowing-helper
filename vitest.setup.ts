import '@testing-library/jest-dom/vitest'

process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'file:./test.db'
process.env.STORAGE_ROOT = process.env.STORAGE_ROOT ?? 'storage/projects'
process.env.STORAGE_BUCKET = process.env.STORAGE_BUCKET ?? 'app-media'
process.env.NEXT_PUBLIC_SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://example.supabase.co'
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? 'sb_publishable_test'
process.env.GROQ_API_KEY = process.env.GROQ_API_KEY ?? 'test-groq-key'
