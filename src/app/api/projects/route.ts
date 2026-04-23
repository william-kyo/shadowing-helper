import { NextResponse } from 'next/server'

import { requireAppUserForApi } from '@/lib/auth'
import { db } from '@/lib/db'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getProjectStoragePaths, uploadFileToStorage } from '@/lib/storage'
import {
  acceptedAudioMimeTypes,
  acceptedImageMimeTypes,
  createProjectSchema,
} from '@/lib/validations/project'

const MAX_AUDIO_SIZE_BYTES = 100 * 1024 * 1024
const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024

function isFile(value: FormDataEntryValue | null): value is File {
  return value instanceof File
}

export async function POST(request: Request) {
  try {
    const { user, response } = await requireAppUserForApi()
    if (response || !user) {
      return response
    }

    const formData = await request.formData()
    const titleResult = createProjectSchema.safeParse({
      title: formData.get('title'),
    })

    if (!titleResult.success) {
      return NextResponse.json(
        {
          error: titleResult.error.issues[0]?.message ?? '入力内容を確認してください。',
        },
        { status: 400 },
      )
    }

    const audioFile = formData.get('audio')
    const imageFiles = formData.getAll('images').filter(isFile)

    if (!isFile(audioFile)) {
      return NextResponse.json(
        { error: '音声ファイルを1つ選択してください。' },
        { status: 400 },
      )
    }

    if (!acceptedAudioMimeTypes.includes(audioFile.type as (typeof acceptedAudioMimeTypes)[number])) {
      return NextResponse.json(
        { error: '対応していない音声形式です。' },
        { status: 400 },
      )
    }

    if (audioFile.size > MAX_AUDIO_SIZE_BYTES) {
      return NextResponse.json(
        { error: '音声ファイルは100MB以下にしてください。' },
        { status: 400 },
      )
    }

    if (imageFiles.length === 0) {
      return NextResponse.json(
        { error: '台本画像を1枚以上アップロードしてください。' },
        { status: 400 },
      )
    }

    for (const image of imageFiles) {
      if (!acceptedImageMimeTypes.includes(image.type as (typeof acceptedImageMimeTypes)[number])) {
        return NextResponse.json(
          { error: '対応していない画像形式が含まれています。' },
          { status: 400 },
        )
      }

      if (image.size > MAX_IMAGE_SIZE_BYTES) {
        return NextResponse.json(
          { error: '画像ファイルは1枚10MB以下にしてください。' },
          { status: 400 },
        )
      }
    }

    const project = await db.project.create({
      data: {
        userId: user.id,
        title: titleResult.data.title,
        audioPath: '',
        audioOriginalName: audioFile.name,
        audioMimeType: audioFile.type,
      },
    })

    const supabase = await createSupabaseServerClient()
    const storagePaths = getProjectStoragePaths(user.supabaseUserId, project.id)
    const audioPath = await uploadFileToStorage({
      client: supabase,
      directory: storagePaths.audioDir,
      file: audioFile,
    })

    const savedImages = [] as {
      imagePath: string
      originalName: string
      mimeType: string
      sortOrder: number
    }[]

    for (const [index, image] of imageFiles.entries()) {
      const imagePath = await uploadFileToStorage({
        client: supabase,
        directory: storagePaths.imageDir,
        file: image,
      })

      savedImages.push({
        imagePath,
        originalName: image.name,
        mimeType: image.type,
        sortOrder: index,
      })
    }

    const savedProject = await db.project.update({
      where: { id: project.id },
      data: {
        audioPath,
        sourceImages: {
          create: savedImages,
        },
      },
      include: {
        sourceImages: true,
      },
    })

    return NextResponse.json({
      project: {
        id: savedProject.id,
        title: savedProject.title,
        status: savedProject.status,
        audioOriginalName: savedProject.audioOriginalName,
        imageCount: savedProject.sourceImages.length,
        createdAt: savedProject.createdAt,
      },
    })
  } catch (error) {
    console.error(error)
    return NextResponse.json(
      { error: 'プロジェクト作成に失敗しました。' },
      { status: 500 },
    )
  }
}
