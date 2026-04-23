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
    .min(1, 'タイトルを入力してください。')
    .max(120, 'タイトルは120文字以内で入力してください。'),
})

export const createProjectUploadSchema = z.object({
  projectId: z.string().min(1),
  title: createProjectSchema.shape.title,
  audioPath: z.string().min(1),
  audioOriginalName: z.string().min(1),
  audioMimeType: z.string().min(1),
  sourceImages: z.array(z.object({
    imagePath: z.string().min(1),
    originalName: z.string().min(1),
    mimeType: z.string().min(1),
    sortOrder: z.number().int().min(0),
  })).min(1, '台本画像を1枚以上アップロードしてください。'),
})

export type CreateProjectInput = z.infer<typeof createProjectSchema>
