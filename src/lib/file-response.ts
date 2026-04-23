import { NextResponse } from 'next/server'

export function createFileResponse(params: {
  request: Request
  fileBuffer: ArrayBuffer
  contentType: string
  cacheControl?: string
}) {
  const fileSize = params.fileBuffer.byteLength
  const rangeHeader = params.request.headers.get('range')

  if (rangeHeader) {
    const match = rangeHeader.match(/bytes=(\d+)-(\d*)/)
    if (!match) {
      return new NextResponse(null, {
        status: 416,
        headers: { 'content-range': `bytes */${fileSize}` },
      })
    }

    const start = Number.parseInt(match[1], 10)
    const end = match[2] ? Number.parseInt(match[2], 10) : fileSize - 1

    if (start > end || start >= fileSize) {
      return new NextResponse(null, {
        status: 416,
        headers: { 'content-range': `bytes */${fileSize}` },
      })
    }

    const partialData = params.fileBuffer.slice(start, end + 1)

    return new NextResponse(partialData, {
      status: 206,
      headers: {
        'content-type': params.contentType,
        'content-range': `bytes ${start}-${end}/${fileSize}`,
        'accept-ranges': 'bytes',
        'content-length': String(partialData.byteLength),
        'cache-control': params.cacheControl ?? 'no-store',
      },
    })
  }

  return new NextResponse(params.fileBuffer, {
    status: 200,
    headers: {
      'content-type': params.contentType,
      'content-length': String(fileSize),
      'accept-ranges': 'bytes',
      'cache-control': params.cacheControl ?? 'no-store',
    },
  })
}
