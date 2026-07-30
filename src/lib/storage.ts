import type { SupabaseClient } from '@supabase/supabase-js'

import { env } from '@/lib/env'
import { addPerfAttrs, measureStep } from '@/lib/perf'
import { buildStorageObjectKey, createStoredFileName, getProjectStoragePaths } from '@/lib/storage-paths'

type StorageClient = SupabaseClient

export { buildStorageObjectKey, createStoredFileName, getProjectStoragePaths }

export async function uploadFileToStorage(params: {
  client: StorageClient
  directory: string
  file: File
  storedName?: string
}) {
  const storedName = params.storedName ?? createStoredFileName(params.file.name)
  const objectKey = buildStorageObjectKey(params.directory, storedName)
  addPerfAttrs({ 'storage.file_upload_size_bytes': params.file.size })

  const arrayBuffer = await measureStep('file.array_buffer', () => params.file.arrayBuffer())

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
  const size =
    params.buffer instanceof ArrayBuffer
      ? params.buffer.byteLength
      : params.buffer.byteLength
  addPerfAttrs({ 'storage.upload_bytes': size })

  const { error } = await measureStep('storage.upload', () =>
    params.client.storage.from(env.STORAGE_BUCKET).upload(params.objectKey, params.buffer, {
      contentType: params.contentType,
      upsert: true,
    }),
  )

  if (error) {
    throw new Error(`Failed to upload ${params.objectKey}: ${error.message}`)
  }
}

export async function downloadStorageObject(params: {
  client: StorageClient
  objectKey: string
}) {
  const { data, error } = await measureStep('storage.download', () =>
    params.client.storage.from(env.STORAGE_BUCKET).download(params.objectKey),
  )

  if (error || !data) {
    throw new Error(`Failed to download ${params.objectKey}: ${error?.message ?? 'not found'}`)
  }

  const arrayBuffer = await measureStep('storage.blob_array_buffer', () => data.arrayBuffer())
  addPerfAttrs({ 'storage.download_bytes': arrayBuffer.byteLength })
  return arrayBuffer
}

// Every object under a prefix, walking sub-folders and paging through each one.
//
// Used by account deletion, where enumerating is the only safe approach: stage 4
// cuts its reference clips to keys derived at runtime rather than stored in the
// database, so a delete driven off table rows alone would leave them behind.
export async function listStorageObjectKeys(params: {
  client: StorageClient
  prefix: string
}): Promise<string[]> {
  const PAGE_SIZE = 100
  const keys: string[] = []
  const queue = [params.prefix]

  while (queue.length > 0) {
    const prefix = queue.pop() as string
    for (let offset = 0; ; offset += PAGE_SIZE) {
      const { data, error } = await params.client.storage
        .from(env.STORAGE_BUCKET)
        .list(prefix, { limit: PAGE_SIZE, offset })

      if (error) throw new Error(`Failed to list ${prefix}: ${error.message}`)
      if (!data || data.length === 0) break

      for (const entry of data) {
        const path = prefix ? `${prefix}/${entry.name}` : entry.name
        // Supabase reports folders as entries with no id; only real objects can
        // be removed, so recurse into the rest.
        if (entry.id === null) queue.push(path)
        else keys.push(path)
      }

      if (data.length < PAGE_SIZE) break
    }
  }

  return keys
}

export async function removeStorageObjects(params: {
  client: StorageClient
  objectKeys: string[]
}) {
  const objectKeys = [...new Set(params.objectKeys.filter(Boolean))]
  if (objectKeys.length === 0) {
    return
  }

  const { error } = await measureStep('storage.remove', () =>
    params.client.storage.from(env.STORAGE_BUCKET).remove(objectKeys),
  )

  if (error) {
    throw new Error(`Failed to remove storage objects: ${error.message}`)
  }
}
