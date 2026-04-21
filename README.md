# Shadowing Helper

Local-first full-stack TypeScript app for shadowing practice.

## Current MVP status

Implemented in this phase:
- Next.js 16 + TypeScript + Tailwind scaffold
- Prisma + SQLite data model
- Local file storage conventions
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
cp .env.example .env.local
npm run prisma:generate
npm run prisma:migrate -- --name init
npm run dev
```

Then open:
- http://localhost:3000

## Notes

- Secrets must stay in `.env.local` and must not be committed.
- Uploaded files are stored under `storage/projects/`.
- SQLite database is configured through `DATABASE_URL`.
