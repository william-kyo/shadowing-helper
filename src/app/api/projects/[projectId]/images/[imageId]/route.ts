import { NextResponse } from 'next/server'
import { readFile } from 'fs/promises'
import { join } from 'path'
import { db } from '@/lib/db'
import { env } from '@/lib/env'

type RouteParams = {
  params: Promise<{
    projectId: string
    imageId: string
  }>
}

export async function GET(request: Request, { params }: RouteParams) {
  const { projectId, imageId } = await params

  const sourceImage = await db.sourceImage.findFirst({
    where: {
      id: imageId,
      projectId: projectId,
    },
  })

  if (!sourceImage) {
    return NextResponse.json({ error: '画像が見つかりません' }, { status: 404 })
  }

  const imageFilePath = join(env.STORAGE_ROOT, sourceImage.imagePath)

  let fileBuffer: Buffer
  try {
    fileBuffer = await readFile(imageFilePath)
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
