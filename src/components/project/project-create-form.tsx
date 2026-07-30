'use client'

import { useRouter } from 'next/navigation'
import { useRef, useMemo, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'

import { useT } from '@/lib/i18n/client'
import { format } from '@/lib/i18n/format'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { buildStorageObjectKey, createStoredFileName, getProjectStoragePaths } from '@/lib/storage-paths'
import {
  acceptedAudioMimeTypes,
  acceptedImageMimeTypes,
} from '@/lib/validations/project'

type FormValues = {
  title: string
  audio: FileList
  images: FileList
}

type CreateProjectResponse = {
  project?: {
    id: string
    title: string
    status: string
    audioOriginalName: string
    imageCount: number
    createdAt: string
  }
  error?: string
}

export function ProjectCreateForm() {
  const router = useRouter()
  const t = useT()
  const {
    control,
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<FormValues>()
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const audioRef = useRef<HTMLInputElement | null>(null)
  const imagesRef = useRef<HTMLInputElement | null>(null)
  const watchedAudio = useWatch({ control, name: 'audio' })
  const watchedImages = useWatch({ control, name: 'images' })
  const audioFileName = watchedAudio?.[0]?.name ?? null
  const imageFileNames = watchedImages ? Array.from(watchedImages).map((f) => f.name) : []

  const acceptedAudio = useMemo(() => acceptedAudioMimeTypes.join(','), [])
  const acceptedImages = useMemo(() => acceptedImageMimeTypes.join(','), [])

  const onSubmit = handleSubmit(
    async (values) => {
      setErrorMessage(null)
      setSuccessMessage(null)

      const audioFile = values.audio?.[0]
      const imageFiles = values.images ? Array.from(values.images) : []

      if (!audioFile) {
        setErrorMessage(t.projects.audioRequired)
        return
      }

      if (audioFile.size > 100 * 1024 * 1024) {
        setErrorMessage(t.projects.audioTooLarge)
        return
      }

      if (imageFiles.some((image) => image.size > 10 * 1024 * 1024)) {
        setErrorMessage(t.projects.imageTooLarge)
        return
      }

      try {
        const supabase = createSupabaseBrowserClient()
        const { data: userResult, error: userError } = await supabase.auth.getUser()

        if (userError || !userResult.user) {
          setErrorMessage(t.projects.sessionExpired)
          return
        }

        const projectId = crypto.randomUUID()
        const storagePaths = getProjectStoragePaths(userResult.user.id, projectId)
        const audioStoredName = createStoredFileName(audioFile.name)
        const audioPath = buildStorageObjectKey(storagePaths.audioDir, audioStoredName)

        let audioFileHash: string | undefined
        try {
          const audioBytes = await audioFile.arrayBuffer()
          const digest = await crypto.subtle.digest('SHA-256', audioBytes)
          audioFileHash = Array.from(new Uint8Array(digest))
            .map((b) => b.toString(16).padStart(2, '0'))
            .join('')
        } catch (hashError) {
          console.warn('[project-create] failed to compute audio file hash', hashError)
        }

        const { error: audioUploadError } = await supabase.storage.from('app-media').upload(audioPath, audioFile, {
          contentType: audioFile.type,
          upsert: true,
        })

        if (audioUploadError) {
          setErrorMessage(audioUploadError.message || t.projects.audioUploadFailed)
          return
        }

        const sourceImages = [] as {
          imagePath: string
          originalName: string
          mimeType: string
          sortOrder: number
        }[]

        for (const [index, image] of imageFiles.entries()) {
          const imageStoredName = createStoredFileName(image.name)
          const imagePath = buildStorageObjectKey(storagePaths.imageDir, imageStoredName)
          const { error: imageUploadError } = await supabase.storage.from('app-media').upload(imagePath, image, {
            contentType: image.type,
            upsert: true,
          })

          if (imageUploadError) {
            await supabase.storage.from('app-media').remove([
              audioPath,
              ...sourceImages.map((uploadedImage) => uploadedImage.imagePath),
            ])
            setErrorMessage(imageUploadError.message || t.projects.imageUploadFailed)
            return
          }

          sourceImages.push({
            imagePath,
            originalName: image.name,
            mimeType: image.type,
            sortOrder: index,
          })
        }

        const response = await fetch('/api/projects', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            projectId,
            title: values.title,
            audioPath,
            audioOriginalName: audioFile.name,
            audioMimeType: audioFile.type,
            audioFileHash,
            sourceImages,
          }),
        })

        const result = (await response.json()) as CreateProjectResponse

        if (!response.ok || !result.project) {
          await supabase.storage.from('app-media').remove([
            audioPath,
            ...sourceImages.map((image) => image.imagePath),
          ])
          setErrorMessage(result.error ?? t.projects.createFailed)
          return
        }

        setSuccessMessage(
          format(t.projects.createdMessage, {
            title: result.project.title,
            count: result.project.imageCount,
          }),
        )
        reset()
        router.push('/projects')
      } catch {
        setErrorMessage(t.projects.networkFailed)
      }
    },
    () => {
      setSuccessMessage(null)
      setErrorMessage(t.projects.checkInput)
    },
  )

  return (
    <form
      className="grid gap-5 rounded-card border border-ink-line bg-paper p-6"
      onSubmit={onSubmit}
      noValidate
    >
      <div className="grid gap-2">
        <label className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-muted" htmlFor="title">
          {t.projects.nameLabel}
        </label>
        <input
          id="title"
          type="text"
          placeholder={t.projects.namePlaceholder}
          aria-invalid={errors.title ? 'true' : 'false'}
          className="rounded-inset border border-ink-line bg-paper px-4 py-3 text-ink placeholder:text-ink-faint outline-none transition focus:border-ink focus:ring-2 focus:ring-accent/25"
          {...register('title')}
        />
        {errors.title ? (
          <p className="text-sm text-accent-deep">{errors.title.message}</p>
        ) : null}
      </div>

      <div className="grid gap-2">
        <label className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-muted" htmlFor="audio">
          {t.projects.audioLabel}
        </label>
        <input
          id="audio"
          type="file"
          accept={acceptedAudio}
          aria-invalid={errors.audio ? 'true' : 'false'}
          className="sr-only"
          {...register('audio', { required: t.projects.audioRequired })}
          ref={(el) => {
            register('audio', { required: t.projects.audioRequired }).ref(el)
            audioRef.current = el
          }}
        />
        <button
          type="button"
          onClick={() => audioRef.current?.click()}
          className="flex items-center gap-3 rounded-inset border border-dashed border-ink-line bg-paper-soft px-4 py-4 text-sm transition hover:border-ink hover:bg-paper"
        >
          {audioFileName ? (
            <span className="truncate text-ink">{audioFileName}</span>
          ) : (
            <>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-ink-faint">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              <span className="text-ink-faint">{t.projects.chooseFile}</span>
            </>
          )}
        </button>
        <p className="text-xs text-ink-muted">{t.projects.audioHint}</p>
        {errors.audio ? <p className="text-sm text-accent-deep">{errors.audio.message as string}</p> : null}
      </div>

      <div className="grid gap-2">
        <label className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-muted" htmlFor="images">
          {t.projects.imagesLabel}
        </label>
        <input
          id="images"
          type="file"
          multiple
          accept={acceptedImages}
          aria-invalid={errors.images ? 'true' : 'false'}
          className="sr-only"
          {...register('images')}
          ref={(el) => {
            register('images').ref(el)
            imagesRef.current = el
          }}
        />
        <button
          type="button"
          onClick={() => imagesRef.current?.click()}
          className="flex items-center gap-3 rounded-inset border border-dashed border-ink-line bg-paper-soft px-4 py-4 text-sm transition hover:border-ink hover:bg-paper"
        >
          {imageFileNames.length > 0 ? (
            <span className="truncate text-ink">{imageFileNames.join(t.projects.imageNameSeparator)}</span>
          ) : (
            <>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-ink-faint">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              <span className="text-ink-faint">{t.projects.chooseFiles}</span>
            </>
          )}
        </button>
        <p className="text-xs text-ink-muted">{t.projects.imagesHint}</p>
        {errors.images ? <p className="text-sm text-accent-deep">{errors.images.message as string}</p> : null}
      </div>

      {errorMessage ? (
        <p className="rounded-inset border border-accent-soft bg-accent-faint px-4 py-3 text-sm text-accent-deep">
          {errorMessage}
        </p>
      ) : null}

      {successMessage ? (
        <p className="rounded-inset border border-ink-line bg-paper-soft px-4 py-3 text-sm text-ink">
          {successMessage}
        </p>
      ) : null}

      <button
        type="button"
        onClick={(event) => {
          void onSubmit(event)
        }}
        disabled={isSubmitting}
        className="inline-flex items-center justify-center rounded-chip bg-ink px-5 py-3 text-sm font-semibold text-paper transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isSubmitting ? t.common.saving : t.projects.submitCreate}
      </button>
    </form>
  )
}
