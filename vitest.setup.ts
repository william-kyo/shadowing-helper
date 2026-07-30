import '@testing-library/jest-dom/vitest'
import { vi } from 'vitest'

// Page tests render server components directly, outside Next's request scope,
// where `cookies()`/`headers()` throw. Stub them empty so locale resolution
// falls through to the default; `tests/lib/i18n.test.ts` covers the real
// resolution logic against explicit inputs.
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => undefined, getAll: () => [], set: () => {} }),
  headers: async () => new Headers(),
}))

process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'file:./test.db'
process.env.STORAGE_ROOT = process.env.STORAGE_ROOT ?? 'storage/projects'
process.env.STORAGE_BUCKET = process.env.STORAGE_BUCKET ?? 'app-media'
process.env.NEXT_PUBLIC_SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://example.supabase.co'
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? 'sb_publishable_test'
// Dummy value for tests; not a real credential. secret-scan:allow
process.env.GROQ_API_KEY = process.env.GROQ_API_KEY ?? 'test-groq-key' // secret-scan:allow
