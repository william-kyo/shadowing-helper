'use client'

import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'

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
    formState: { errors, isSubmitting },
    reset,
  } = useForm<FormValues>()
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

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

      if (imageFiles.length === 0) {
        setErrorMessage('台本画像を1枚以上選択してください。')
        return
      }

      const formData = new FormData()
      formData.append('title', values.title)
      formData.append('audio', audioFile)
      imageFiles.forEach((image) => formData.append('images', image))

      try {
        const response = await fetch('/api/projects', {
          method: 'POST',
          body: formData,
        })

        const result = (await response.json()) as CreateProjectResponse

        if (!response.ok || !result.project) {
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
          {...register('title', {
            required: 'プロジェクト名を入力してください。',
          })}
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
          className="block rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-5 text-sm"
          {...register('audio', {
            required: '音声ファイルを選択してください。',
          })}
        />
        <p className="text-xs text-zinc-500">
          mp3 / wav / m4a / webm / ogg を想定。まずはローカル保存のみ行います。
        </p>
        {errors.audio ? (
          <p className="text-sm text-red-600">{errors.audio.message as string}</p>
        ) : null}
      </div>

      <div className="grid gap-2">
        <label className="text-sm font-medium text-zinc-900" htmlFor="images">
          台本画像
        </label>
        <input
          id="images"
          type="file"
          multiple
          accept={acceptedImages}
          aria-invalid={errors.images ? 'true' : 'false'}
          className="block rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-5 text-sm"
          {...register('images', {
            required: '台本画像を1枚以上選択してください。',
          })}
        />
        <p className="text-xs text-zinc-500">
          png / jpg / webp / heic を受け付けます。順番どおりに選ぶとその順で保存します。
        </p>
        {errors.images ? (
          <p className="text-sm text-red-600">{errors.images.message as string}</p>
        ) : null}
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
