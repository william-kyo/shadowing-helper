import path from 'node:path'
import { randomUUID } from 'node:crypto'

import type { SupabaseClient } from '@supabase/supabase-js'

import { env } from '@/lib/env'

type StorageClient = SupabaseClient

export function createStoredFileName(originalName: string) {
  const extension = path.extname(originalName).toLowerCase()
  return `${randomUUID()}${extension}`
}

export function getProjectStoragePaths(ownerSupabaseUserId: string, projectId: string) {
  const projectDir = path.posix.join(ownerSupabaseUserId, 'projects', projectId)

  return {
    projectDir,
    audioDir: path.posix.join(projectDir, 'audio'),
    imageDir: path.posix.join(projectDir, 'images'),
    recordingDir: path.posix.join(projectDir, 'recordings'),
  }
}

export function buildStorageObjectKey(directory: string, fileName: string) {
  return path.posix.join(directory, fileName)
}

export async function uploadFileToStorage(params: {
  client: StorageClient
  directory: string
  file: File
  storedName?: string
}) {
  const storedName = params.storedName ?? createStoredFileName(params.file.name)
  const objectKey = buildStorageObjectKey(params.directory, storedName)
  const arrayBuffer = await params.file.arrayBuffer()

  await uploadBufferToStorage({
    client: params.client,
    objectKey,
    buffer: arrayBuffer,
    contentType: params.file.type,
  })

  return objectKey
}

export async function uploadBufferToStorage(params: {
  client: StorageClient
  objectKey: string
  buffer: ArrayBuffer | Uint8Array | Buffer
  contentType: string
}) {
  const { error } = await params.client.storage.from(env.STORAGE_BUCKET).upload(params.objectKey, params.buffer, {
    contentType: params.contentType,
    upsert: true,
  })

  if (error) {
    throw new Error(`Failed to upload ${params.objectKey}: ${error.message}`)
  }
}

export async function downloadStorageObject(params: {
  client: StorageClient
  objectKey: string
}) {
  const { data, error } = await params.client.storage.from(env.STORAGE_BUCKET).download(params.objectKey)

  if (error || !data) {
    throw new Error(`Failed to download ${params.objectKey}: ${error?.message ?? 'not found'}`)
  }

  return data.arrayBuffer()
}

export async function removeStorageObjects(params: {
  client: StorageClient
  objectKeys: string[]
}) {
  const objectKeys = [...new Set(params.objectKeys.filter(Boolean))]
  if (objectKeys.length === 0) {
    return
  }

  const { error } = await params.client.storage.from(env.STORAGE_BUCKET).remove(objectKeys)

  if (error) {
    throw new Error(`Failed to remove storage objects: ${error.message}`)
  }
}
