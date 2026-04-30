import { z } from 'zod'

export const acceptedAudioMimeTypes = [
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/x-wav',
  'audio/mp4',
  'audio/x-m4a',
  'audio/webm',
  'audio/ogg',
] as const

export const acceptedImageMimeTypes = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/heic',
  'image/heif',
] as const

export const createProjectSchema = z.object({
  title: z
    .string()
    .trim()
    .max(120, 'タイトルは120文字以内で入力してください。')
    .optional(),
})

export const createProjectUploadSchema = z.object({
  projectId: z.string().min(1),
  title: createProjectSchema.shape.title,
  audioPath: z.string().min(1),
  audioOriginalName: z.string().min(1),
  audioMimeType: z.string().min(1),
  audioFileHash: z.string().regex(/^[0-9a-f]{64}$/).optional(),
  sourceImages: z.array(z.object({
    imagePath: z.string().min(1),
    originalName: z.string().min(1),
    mimeType: z.string().min(1),
    sortOrder: z.number().int().min(0),
  })).default([]),
})

export type CreateProjectInput = z.infer<typeof createProjectSchema>
