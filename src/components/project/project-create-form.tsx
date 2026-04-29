'use client'

import { useRouter } from 'next/navigation'
import { useRef, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'

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
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<FormValues>()
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const audioRef = useRef<HTMLInputElement | null>(null)
  const imagesRef = useRef<HTMLInputElement | null>(null)
  const watchedAudio = watch('audio')
  const watchedImages = watch('images')
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
        setErrorMessage('音声ファイルを選択してください。')
        return
      }

      if (audioFile.size > 100 * 1024 * 1024) {
        setErrorMessage('音声ファイルは100MB以下にしてください。')
        return
      }

      if (imageFiles.some((image) => image.size > 10 * 1024 * 1024)) {
        setErrorMessage('画像ファイルは1枚10MB以下にしてください。')
        return
      }

      try {
        const supabase = createSupabaseBrowserClient()
        const { data: userResult, error: userError } = await supabase.auth.getUser()

        if (userError || !userResult.user) {
          setErrorMessage('ログイン状態を確認できませんでした。再度ログインしてください。')
          return
        }

        const projectId = crypto.randomUUID()
        const storagePaths = getProjectStoragePaths(userResult.user.id, projectId)
        const audioStoredName = createStoredFileName(audioFile.name)
        const audioPath = buildStorageObjectKey(storagePaths.audioDir, audioStoredName)

        const { error: audioUploadError } = await supabase.storage.from('app-media').upload(audioPath, audioFile, {
          contentType: audioFile.type,
          upsert: true,
        })

        if (audioUploadError) {
          setErrorMessage(audioUploadError.message || '音声アップロードに失敗しました。')
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
            setErrorMessage(imageUploadError.message || '画像アップロードに失敗しました。')
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
            sourceImages,
          }),
        })

        const result = (await response.json()) as CreateProjectResponse

        if (!response.ok || !result.project) {
          await supabase.storage.from('app-media').remove([
            audioPath,
            ...sourceImages.map((image) => image.imagePath),
          ])
          setErrorMessage(result.error ?? 'プロジェクト作成に失敗しました。')
          return
        }

        setSuccessMessage(
          `「${result.project.title}」を作成しました。画像 ${result.project.imageCount} 枚を受け付けました。`,
        )
        reset()
        router.push('/projects')
      } catch {
        setErrorMessage('通信に失敗しました。時間をおいて再度お試しください。')
      }
    },
    () => {
      setSuccessMessage(null)
      setErrorMessage('入力内容を確認してください。')
    },
  )

  return (
    <form
      className="grid gap-5 rounded-3xl border border-black/10 bg-white p-6 shadow-sm"
      onSubmit={onSubmit}
      noValidate
    >
      <div className="grid gap-2">
        <label className="text-sm font-medium text-zinc-900" htmlFor="title">
          プロジェクト名
        </label>
        <input
          id="title"
          type="text"
          placeholder="例: NHK ニュース shadowing 01"
          aria-invalid={errors.title ? 'true' : 'false'}
          className="rounded-2xl border border-zinc-300 px-4 py-3 outline-none transition focus:border-zinc-900"
          {...register('title')}
        />
        {errors.title ? (
          <p className="text-sm text-red-600">{errors.title.message}</p>
        ) : null}
      </div>

      <div className="grid gap-2">
        <label className="text-sm font-medium text-zinc-900" htmlFor="audio">
          音声ファイル
        </label>
        <input
          id="audio"
          type="file"
          accept={acceptedAudio}
          aria-invalid={errors.audio ? 'true' : 'false'}
          className="sr-only"
          {...register('audio', { required: '音声ファイルを選択してください。' })}
          ref={(el) => {
            register('audio', { required: '音声ファイルを選択してください。' }).ref(el)
            audioRef.current = el
          }}
        />
        <button
          type="button"
          onClick={() => audioRef.current?.click()}
          className="flex items-center gap-3 rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-4 text-sm transition hover:border-zinc-500 hover:bg-zinc-100"
        >
          {audioFileName ? (
            <span className="truncate text-zinc-800">{audioFileName}</span>
          ) : (
            <>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-zinc-400">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              <span className="text-zinc-400">ファイルを選択</span>
            </>
          )}
        </button>
        <p className="text-xs text-zinc-500">mp3 / wav / m4a / webm / ogg を想定。まずはローカル保存のみ行います。</p>
        {errors.audio ? <p className="text-sm text-red-600">{errors.audio.message as string}</p> : null}
      </div>

      <div className="grid gap-2">
        <label className="text-sm font-medium text-zinc-900" htmlFor="images">
          台本画像（任意）
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
          className="flex items-center gap-3 rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-4 text-sm transition hover:border-zinc-500 hover:bg-zinc-100"
        >
          {imageFileNames.length > 0 ? (
            <span className="truncate text-zinc-800">{imageFileNames.join('、')}</span>
          ) : (
            <>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-zinc-400">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              <span className="text-zinc-400">ファイルを選択（複数可）</span>
            </>
          )}
        </button>
        <p className="text-xs text-zinc-500">png / jpg / webp / heic を受け付けます（任意）。順番どおりに選ぶとその順で保存します。</p>
        {errors.images ? <p className="text-sm text-red-600">{errors.images.message as string}</p> : null}
      </div>

      {errorMessage ? (
        <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </p>
      ) : null}

      {successMessage ? (
        <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {successMessage}
        </p>
      ) : null}

      <button
        type="button"
        onClick={(event) => {
          void onSubmit(event)
        }}
        disabled={isSubmitting}
        className="inline-flex items-center justify-center rounded-2xl bg-zinc-950 px-5 py-3 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-500"
      >
        {isSubmitting ? '保存中…' : 'プロジェクトを作成'}
      </button>
    </form>
  )
}
