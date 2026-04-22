import { mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

import { env } from '@/lib/env'

export function createStoredFileName(originalName: string) {
  const extension = path.extname(originalName).toLowerCase()
  return `${randomUUID()}${extension}`
}

export function getProjectStoragePaths(projectId: string) {
  const projectDir = path.join(env.STORAGE_ROOT, projectId)

  return {
    projectDir,
    audioDir: path.join(projectDir, 'audio'),
    imageDir: path.join(projectDir, 'images'),
    recordingDir: path.join(projectDir, 'recordings'),
  }
}

export async function ensureProjectStorage(projectId: string) {
  const paths = getProjectStoragePaths(projectId)

  await Promise.all([
    mkdir(paths.audioDir, { recursive: true }),
    mkdir(paths.imageDir, { recursive: true }),
    mkdir(paths.recordingDir, { recursive: true }),
  ])

  return paths
}

export async function deleteProjectStorage(projectId: string) {
  const projectDir = path.join(env.STORAGE_ROOT, projectId)
  try {
    await rm(projectDir, { recursive: true, force: true })
  } catch {
    // ignore
  }
}

export async function saveUploadedFile(params: {
  directory: string
  file: File
}) {
  const storedName = createStoredFileName(params.file.name)
  const outputPath = path.join(params.directory, storedName)
  const buffer = Buffer.from(await params.file.arrayBuffer())

  await mkdir(params.directory, { recursive: true })
  await writeFile(outputPath, buffer)

  return outputPath
}
