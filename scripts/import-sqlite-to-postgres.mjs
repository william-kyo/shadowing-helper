import { execFileSync } from 'node:child_process'

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const sqlitePath = process.argv[2] ?? 'prisma/dev.db'

function readTable(tableName) {
  const output = execFileSync('sqlite3', ['-json', sqlitePath, `select * from ${tableName};`], {
    encoding: 'utf8',
  }).trim()

  return output ? JSON.parse(output) : []
}

function toDate(value) {
  return value ? new Date(value) : undefined
}

async function main() {
  const users = readTable('User')
  const projects = readTable('Project')
  const sourceImages = readTable('SourceImage')
  const segments = readTable('Segment')
  const stageProgresses = readTable('StageProgress')
  const recordings = readTable('Recording')

  for (const user of users) {
    await prisma.user.upsert({
      where: { id: user.id },
      update: {
        supabaseUserId: user.supabaseUserId,
        email: user.email,
        createdAt: toDate(user.createdAt),
        updatedAt: toDate(user.updatedAt),
      },
      create: {
        id: user.id,
        supabaseUserId: user.supabaseUserId,
        email: user.email,
        createdAt: toDate(user.createdAt),
        updatedAt: toDate(user.updatedAt),
      },
    })
  }

  for (const project of projects) {
    await prisma.project.upsert({
      where: { id: project.id },
      update: {
        userId: project.userId,
        title: project.title,
        audioPath: project.audioPath,
        audioOriginalName: project.audioOriginalName,
        audioMimeType: project.audioMimeType,
        audioDurationMs: project.audioDurationMs,
        status: project.status,
        rawExtractedText: project.rawExtractedText,
        createdAt: toDate(project.createdAt),
        updatedAt: toDate(project.updatedAt),
      },
      create: {
        id: project.id,
        userId: project.userId,
        title: project.title,
        audioPath: project.audioPath,
        audioOriginalName: project.audioOriginalName,
        audioMimeType: project.audioMimeType,
        audioDurationMs: project.audioDurationMs,
        status: project.status,
        rawExtractedText: project.rawExtractedText,
        createdAt: toDate(project.createdAt),
        updatedAt: toDate(project.updatedAt),
      },
    })
  }

  for (const sourceImage of sourceImages) {
    await prisma.sourceImage.upsert({
      where: { id: sourceImage.id },
      update: {
        projectId: sourceImage.projectId,
        imagePath: sourceImage.imagePath,
        originalName: sourceImage.originalName,
        mimeType: sourceImage.mimeType,
        sortOrder: sourceImage.sortOrder,
        ocrText: sourceImage.ocrText,
        createdAt: toDate(sourceImage.createdAt),
      },
      create: {
        id: sourceImage.id,
        projectId: sourceImage.projectId,
        imagePath: sourceImage.imagePath,
        originalName: sourceImage.originalName,
        mimeType: sourceImage.mimeType,
        sortOrder: sourceImage.sortOrder,
        ocrText: sourceImage.ocrText,
        createdAt: toDate(sourceImage.createdAt),
      },
    })
  }

  for (const segment of segments) {
    await prisma.segment.upsert({
      where: { id: segment.id },
      update: {
        projectId: segment.projectId,
        index: segment.index,
        title: segment.title,
        text: segment.text,
        audioPath: segment.audioPath,
        startMs: segment.startMs,
        endMs: segment.endMs,
        notes: segment.notes,
        createdAt: toDate(segment.createdAt),
        updatedAt: toDate(segment.updatedAt),
      },
      create: {
        id: segment.id,
        projectId: segment.projectId,
        index: segment.index,
        title: segment.title,
        text: segment.text,
        audioPath: segment.audioPath,
        startMs: segment.startMs,
        endMs: segment.endMs,
        notes: segment.notes,
        createdAt: toDate(segment.createdAt),
        updatedAt: toDate(segment.updatedAt),
      },
    })
  }

  for (const stageProgress of stageProgresses) {
    await prisma.stageProgress.upsert({
      where: { id: stageProgress.id },
      update: {
        segmentId: stageProgress.segmentId,
        stage: stageProgress.stage,
        status: stageProgress.status,
        dictationInput: stageProgress.dictationInput,
        studyNotes: stageProgress.studyNotes,
        textVisible: stageProgress.textVisible,
        completedAt: toDate(stageProgress.completedAt),
        updatedAt: toDate(stageProgress.updatedAt),
      },
      create: {
        id: stageProgress.id,
        segmentId: stageProgress.segmentId,
        stage: stageProgress.stage,
        status: stageProgress.status,
        dictationInput: stageProgress.dictationInput,
        studyNotes: stageProgress.studyNotes,
        textVisible: stageProgress.textVisible,
        completedAt: toDate(stageProgress.completedAt),
        updatedAt: toDate(stageProgress.updatedAt),
      },
    })
  }

  for (const recording of recordings) {
    await prisma.recording.upsert({
      where: { id: recording.id },
      update: {
        segmentId: recording.segmentId,
        stage: recording.stage,
        filePath: recording.filePath,
        durationMs: recording.durationMs,
        createdAt: toDate(recording.createdAt),
      },
      create: {
        id: recording.id,
        segmentId: recording.segmentId,
        stage: recording.stage,
        filePath: recording.filePath,
        durationMs: recording.durationMs,
        createdAt: toDate(recording.createdAt),
      },
    })
  }

  console.log(
    `Imported ${users.length} user(s), ${projects.length} project(s), ${sourceImages.length} image(s), ${segments.length} segment(s), ${stageProgresses.length} stage progress row(s), and ${recordings.length} recording(s) from ${sqlitePath}.`,
  )
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
