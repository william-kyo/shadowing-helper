import 'server-only'

import type { Prisma } from '@prisma/client'

import { db } from '@/lib/db'
import { EXAMPLE_PROJECT } from '@/lib/example-project.data'

// The sample audio lives at one shared storage key instead of being copied per
// user. Access is granted by the Project/Segment row that points at it — the
// audio routes authorise by ownership of the row, not by the object path — so a
// single object can back every account's copy. A read-only storage policy lets
// authenticated users SELECT under `examples/`; nothing may write there, and the
// delete paths already tolerate a removal being refused.
export const EXAMPLE_AUDIO_OBJECT_KEY = 'examples/dialogue-v1/dialogue_example.mp3'

const STAGE_COUNT = 5

// Seed a new account's sample project. Deliberately nothing but inserts: the
// transcription, punctuation and A/B labels were all resolved once by
// scripts/generate-example-fixture.ts, so no Whisper, LLM, ffmpeg or upload runs
// per user.
export async function provisionExampleProject(userId: string): Promise<void> {
  const { segment } = EXAMPLE_PROJECT

  await db.project.create({
    data: {
      userId,
      title: EXAMPLE_PROJECT.title,
      audioPath: EXAMPLE_AUDIO_OBJECT_KEY,
      audioOriginalName: EXAMPLE_PROJECT.audioOriginalName,
      audioMimeType: EXAMPLE_PROJECT.audioMimeType,
      audioDurationMs: EXAMPLE_PROJECT.audioDurationMs,
      // Already segmented at generation time — never show it as pending.
      status: 'processed',
      segments: {
        create: [
          {
            index: 0,
            title: segment.title,
            text: segment.text,
            // A single segment spanning the whole clip, so it plays the
            // project's own audio object rather than needing a cut of its own.
            audioPath: EXAMPLE_AUDIO_OBJECT_KEY,
            startMs: segment.startMs,
            endMs: segment.endMs,
            whisperSegments: segment.whisperSegments as unknown as Prisma.InputJsonValue,
            progress: {
              create: Array.from({ length: STAGE_COUNT }, (_, index) => ({ stage: index + 1 })),
            },
          },
        ],
      },
    },
  })
}
