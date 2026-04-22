import * as fs from 'node:fs/promises'

import { NextResponse } from 'next/server'

import { requireAppUserForApi } from '@/lib/auth'
import { db } from '@/lib/db'

type RouteContext = {
  params: Promise<{
    projectId: string
  }>
}

export async function GET(request: Request, context: RouteContext) {
  const { user, response } = await requireAppUserForApi()
  if (response || !user) {
    return response
  }

  const { projectId } = await context.params

  const project = await db.project.findFirst({
    where: { id: projectId, userId: user.id },
    select: {
      audioPath: true,
      audioMimeType: true,
    },
  })

  if (!project?.audioPath) {
    return NextResponse.json({ error: '音声が見つかりません。' }, { status: 404 })
  }

  let fileBuffer: ArrayBuffer
  try {
    const fileData = await fs.readFile(project.audioPath)
    fileBuffer = fileData.buffer.slice(
      fileData.byteOffset,
      fileData.byteOffset + fileData.byteLength,
    )
  } catch {
    return NextResponse.json({ error: 'ファイルが見つかりません。' }, { status: 404 })
  }

  const fileSize = fileBuffer.byteLength
  const rangeHeader = request.headers.get('range')

  if (rangeHeader) {
    const match = rangeHeader.match(/bytes=(\d+)-(\d*)/)
    if (!match) {
      return new NextResponse(null, {
        status: 416,
        headers: { 'content-range': `bytes */${fileSize}` },
      })
    }

    const start = parseInt(match[1], 10)
    const end = match[2] ? parseInt(match[2], 10) : fileSize - 1

    if (start > end || start >= fileSize) {
      return new NextResponse(null, {
        status: 416,
        headers: { 'content-range': `bytes */${fileSize}` },
      })
    }

    const partialData = fileBuffer.slice(start, end + 1)

    return new NextResponse(partialData, {
      status: 206,
      headers: {
        'content-type': project.audioMimeType,
        'content-range': `bytes ${start}-${end}/${fileSize}`,
        'accept-ranges': 'bytes',
        'content-length': String(partialData.byteLength),
        'cache-control': 'no-store',
      },
    })
  }

  return new NextResponse(fileBuffer, {
    status: 200,
    headers: {
      'content-type': project.audioMimeType,
      'content-length': String(fileSize),
      'accept-ranges': 'bytes',
      'cache-control': 'no-store',
    },
  })
}
