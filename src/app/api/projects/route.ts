import { NextResponse } from 'next/server'

import { requireAppUserForApi } from '@/lib/auth'
import { db } from '@/lib/db'
import { addPerfAttrs, measureStep, withApiPerf } from '@/lib/perf'
import { transcribeAudioWithSegments } from '@/lib/groq'
import { analyzeTopicBoundaries } from '@/lib/segment-analysis'
import { extractAudioSegmentFromBuffer } from '@/lib/segment-audio'
import {
  acceptedAudioMimeTypes,
  acceptedImageMimeTypes,
  createProjectUploadSchema,
} from '@/lib/validations/project'
import { buildStorageObjectKey, createStoredFileName, downloadStorageObject, getProjectStoragePaths, uploadBufferToStorage } from '@/lib/storage'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import path from 'node:path'

export async function POST(request: Request) {
  return withApiPerf('/api/projects', request, async () => {
  try {
    const { user, response } = await measureStep('auth.require_api_user', () => requireAppUserForApi())
    if (response || !user) {
      return response
    }

    const json = await measureStep('request.json', () => request.json())
    const titleResult = await measureStep('validation.project_create', async () => createProjectUploadSchema.safeParse(json))

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

    addPerfAttrs({ 'project.source_image_count': titleResult.data.sourceImages.length })

    const projectTitle = titleResult.data.title?.trim()
      || path.basename(titleResult.data.audioOriginalName, path.extname(titleResult.data.audioOriginalName))

    const project = await measureStep('db.project.create_with_images', () =>
      db.project.create({
        data: {
          id: titleResult.data.projectId,
          userId: user.id,
          title: projectTitle,
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
      }),
    )

    void (async () => {
      try {
        const supabase = await createSupabaseServerClient()
        const audioBuffer = Buffer.from(await downloadStorageObject({
          client: supabase,
          objectKey: titleResult.data.audioPath,
        }))

        const whisperResponse = await transcribeAudioWithSegments({
          audioBuffer,
          fileName: titleResult.data.audioOriginalName,
          mimeType: titleResult.data.audioMimeType,
        })

        const topicSegments = await analyzeTopicBoundaries(whisperResponse.segments)
        const resolvedSegments = topicSegments
          .map((seg) => {
            const startWhisperSeg = whisperResponse.segments[seg.startIndex]
            const endWhisperSeg = whisperResponse.segments[seg.endIndex]
            if (!startWhisperSeg || !endWhisperSeg) {
              console.warn(`[auto-segment] Invalid indices ${seg.startIndex}-${seg.endIndex} for ${whisperResponse.segments.length} segments`)
              return null
            }
            return {
              title: seg.title,
              startSeconds: startWhisperSeg.start,
              endSeconds: endWhisperSeg.end,
              text: seg.text,
            }
          })
          .filter(Boolean) as { title: string; startSeconds: number; endSeconds: number; text: string }[]

        const filteredSegments = resolvedSegments.filter(
          (seg) => (seg.endSeconds - seg.startSeconds) >= 3,
        )
        const limitedSegments = filteredSegments.slice(0, 20)

        const storagePaths = getProjectStoragePaths(user.supabaseUserId, project.id)
        const baseName = path.basename(titleResult.data.audioOriginalName, path.extname(titleResult.data.audioOriginalName))

        await Promise.all(
          limitedSegments.map(async (seg, index: number) => {
            const storedName = createStoredFileName(`${baseName}_segment_${index + 1}${path.extname(titleResult.data.audioOriginalName)}`)
            const audioPath = buildStorageObjectKey(storagePaths.audioDir, storedName)

            const segmentAudioBuffer = await extractAudioSegmentFromBuffer({
              inputBuffer: audioBuffer,
              inputExtension: path.extname(titleResult.data.audioOriginalName),
              outputExtension: path.extname(storedName),
              startSeconds: seg.startSeconds,
              endSeconds: seg.endSeconds,
            })

            await uploadBufferToStorage({
              client: supabase,
              objectKey: audioPath,
              buffer: segmentAudioBuffer,
              contentType: titleResult.data.audioMimeType,
            })

            await db.segment.create({
              data: {
                projectId: project.id,
                index,
                title: seg.title,
                text: seg.text,
                audioPath,
                startMs: Math.round(seg.startSeconds * 1000),
                endMs: Math.round(seg.endSeconds * 1000),
                progress: {
                  create: Array.from({ length: 5 }, (_, idx) => ({ stage: idx + 1 })),
                },
              },
            })
          }),
        )
      } catch (err) {
        console.error('[auto-segment] Failed during project creation for project', project.id, err)
      }
    })()

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
  })
}
