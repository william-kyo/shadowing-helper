// One-time upload of the onboarding sample audio to the shared storage key that
// every seeded example project points at.
//
//   SUPABASE_SERVICE_ROLE_KEY=... npm run example:upload
//
// A service-role key is required on purpose: the examples/ prefix is read-only
// for signed-in users, so no ordinary session can write (or overwrite) it. The
// key is read straight from the environment rather than src/lib/env.ts — it is
// needed by this script alone, never by the app.

import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { createClient } from '@supabase/supabase-js'

// Must stay in step with EXAMPLE_AUDIO_OBJECT_KEY in src/lib/example-project.ts
// (a test asserts they match).
const OBJECT_KEY = 'examples/dialogue-v1/dialogue_example.mp3'
const SOURCE = 'public/dialogue_example.mp3'
const CONTENT_TYPE = 'audio/mpeg'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const bucket = process.env.STORAGE_BUCKET ?? 'app-media'

if (!url || !serviceRoleKey) {
  console.error(
    'Missing config. Needs NEXT_PUBLIC_SUPABASE_URL (from .env) and SUPABASE_SERVICE_ROLE_KEY.',
  )
  process.exit(1)
}

const client = createClient(url, serviceRoleKey, { auth: { persistSession: false } })
const buffer = await readFile(path.join(process.cwd(), SOURCE))

const { error } = await client.storage.from(bucket).upload(OBJECT_KEY, buffer, {
  contentType: CONTENT_TYPE,
  upsert: true,
})

if (error) {
  console.error(`Failed to upload ${OBJECT_KEY}: ${error.message}`)
  process.exit(1)
}

console.log(`Uploaded ${SOURCE} → ${bucket}/${OBJECT_KEY} (${buffer.byteLength} bytes)`)
