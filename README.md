# Shadowing Helper

Supabase-authenticated full-stack TypeScript app for shadowing practice.

## Current MVP status

Implemented in this phase:
- Next.js 16 + TypeScript + Tailwind scaffold
- Prisma + SQLite data model
- Supabase Storage-backed media handling
- Project creation flow for:
  - one audio file
  - multiple script images
- Basic project list page

Planned next:
- OCR pipeline for uploaded images
- LLM-based segment extraction using the Raspberry Pi GPT 5.4 setup
- Segment timing editor
- Five stage study UI
- Recording workflow for stage 5

## Local setup

```bash
npm install
cp .env.example .env
# Fill in required values in .env (GROQ_API_KEY is required for transcription)
npm run prisma:generate
npm run prisma:migrate -- --name init
npm run dev
```

Then open:
- http://localhost:3000

## Required environment variables

| Variable | Description |
|---|---|
| `DATABASE_URL` | SQLite path (already set in `.env.example`) |
| `STORAGE_ROOT` | Legacy local storage root, used only by the migration script |
| `STORAGE_BUCKET` | Supabase Storage bucket name |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase publishable key |
| `GROQ_API_KEY` | **Required.** Get free key at https://console.groq.com/keys |

## Notes

- Secrets must stay in `.env.local` and must not be committed.
- `.env` is gitignored — use `.env.example` as a template.
- Project media is stored in Supabase Storage.
- SQLite database is configured through `DATABASE_URL`.

## Migrate local media to Supabase Storage

If you already have local files saved under `STORAGE_ROOT`, set `MIGRATION_USER_EMAIL` and `MIGRATION_USER_PASSWORD` in `.env` for the target user, then run:

```bash
npm run storage:migrate-local
```

The script signs in as that user with the normal publishable key, uploads project audio, source images, segment audio, and recordings to `STORAGE_BUCKET`, then rewrites the corresponding DB paths to Storage object keys.
Because it respects your existing RLS policies, one run migrates one user's files.
