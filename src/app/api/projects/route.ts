import { NextResponse } from 'next/server'

import { requireAppUserForApi } from '@/lib/auth'
import { db } from '@/lib/db'
import {
  acceptedAudioMimeTypes,
  acceptedImageMimeTypes,
  createProjectUploadSchema,
} from '@/lib/validations/project'

export async function POST(request: Request) {
  try {
    const { user, response } = await requireAppUserForApi()
    if (response || !user) {
      return response
    }

    const json = await request.json()
    const titleResult = createProjectUploadSchema.safeParse(json)

    if (!titleResult.success) {
      return NextResponse.json(
        {
          error: titleResult.error.issues[0]?.message ?? '入力内容を確認してください。',
        },
        { status: 400 },
      )
    }

    if (!acceptedAudioMimeTypes.includes(titleResult.data.audioMimeType as (typeof acceptedAudioMimeTypes)[number])) {
      return NextResponse.json(
        { error: '対応していない音声形式です。' },
        { status: 400 },
      )
    }

    for (const image of titleResult.data.sourceImages) {
      if (!acceptedImageMimeTypes.includes(image.mimeType as (typeof acceptedImageMimeTypes)[number])) {
        return NextResponse.json(
          { error: '対応していない画像形式が含まれています。' },
          { status: 400 },
        )
      }
    }

    const expectedPrefix = `${user.supabaseUserId}/projects/${titleResult.data.projectId}/`
    if (!titleResult.data.audioPath.startsWith(expectedPrefix)) {
      return NextResponse.json({ error: '音声アップロード先が不正です。' }, { status: 400 })
    }

    if (!titleResult.data.sourceImages.every((image) => image.imagePath.startsWith(expectedPrefix))) {
      return NextResponse.json({ error: '画像アップロード先が不正です。' }, { status: 400 })
    }

    const project = await db.project.create({
      data: {
        id: titleResult.data.projectId,
        userId: user.id,
        title: titleResult.data.title,
        audioPath: titleResult.data.audioPath,
        audioOriginalName: titleResult.data.audioOriginalName,
        audioMimeType: titleResult.data.audioMimeType,
        sourceImages: {
          create: titleResult.data.sourceImages,
        },
      },
      include: {
        sourceImages: true,
      },
    })

    return NextResponse.json({
      project: {
        id: project.id,
        title: project.title,
        status: project.status,
        audioOriginalName: project.audioOriginalName,
        imageCount: project.sourceImages.length,
        createdAt: project.createdAt,
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
