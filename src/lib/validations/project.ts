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

export type CreateProjectInput = z.infer<typeof createProjectSchema>
