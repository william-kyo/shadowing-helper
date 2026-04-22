import { NextResponse } from 'next/server'
import { readFile } from 'fs/promises'

import { requireAppUserForApi } from '@/lib/auth'
import { db } from '@/lib/db'

type RouteParams = {
  params: Promise<{
    projectId: string
    imageId: string
  }>
}

export async function GET(request: Request, { params }: RouteParams) {
  const { user, response } = await requireAppUserForApi()
  if (response || !user) {
    return response
  }

  const { projectId, imageId } = await params

  const sourceImage = await db.sourceImage.findFirst({
    where: {
      id: imageId,
      projectId: projectId,
      project: { userId: user.id },
    },
  })

  if (!sourceImage) {
    return NextResponse.json({ error: '画像が見つかりません' }, { status: 404 })
  }

  // imagePath stored in DB is the full absolute path (returned by saveUploadedFile)
  let fileBuffer: Buffer
  try {
    fileBuffer = await readFile(sourceImage.imagePath)
  } catch {
    return NextResponse.json({ error: '画像ファイルの読み込みに失敗しました' }, { status: 500 })
  }

  return new NextResponse(new Uint8Array(fileBuffer), {
    headers: {
      'Content-Type': sourceImage.mimeType,
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  })
}
