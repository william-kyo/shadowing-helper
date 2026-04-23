import { access, readFile } from 'node:fs/promises'
import path from 'node:path'

import { PrismaClient } from '@prisma/client'
import { createClient } from '@supabase/supabase-js'

const prisma = new PrismaClient()

const STORAGE_ROOT = process.env.STORAGE_ROOT ?? 'storage/projects'
const STORAGE_BUCKET = process.env.STORAGE_BUCKET ?? 'app-media'
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
const MIGRATION_USER_EMAIL = process.env.MIGRATION_USER_EMAIL
const MIGRATION_USER_PASSWORD = process.env.MIGRATION_USER_PASSWORD

if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
  throw new Error('NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY are required.')
}

if (!MIGRATION_USER_EMAIL || !MIGRATION_USER_PASSWORD) {
  throw new Error('MIGRATION_USER_EMAIL and MIGRATION_USER_PASSWORD are required.')
}

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

function getProjectStoragePaths(ownerSupabaseUserId, projectId) {
  const projectDir = path.posix.join(ownerSupabaseUserId, 'projects', projectId)

  return {
    projectDir,
    audioDir: path.posix.join(projectDir, 'audio'),
    imageDir: path.posix.join(projectDir, 'images'),
    recordingDir: path.posix.join(projectDir, 'recordings'),
  }
}

function isAlreadyMigrated(filePath, ownerSupabaseUserId, projectId) {
  return filePath.startsWith(path.posix.join(ownerSupabaseUserId, 'projects', projectId))
}

async function fileExists(filePath) {
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}

async function uploadLocalFile(objectKey, localPath, contentType) {
  const buffer = await readFile(localPath)
  const { error } = await supabase.storage.from(STORAGE_BUCKET).upload(objectKey, buffer, {
    contentType,
    upsert: true,
  })

  if (error) {
    throw new Error(`Failed to upload ${localPath} -> ${objectKey}: ${error.message}`)
  }
}

async function migrateField({ label, currentPath, objectKey, contentType, update }) {
  if (!currentPath) {
    return { migrated: false, skipped: true, reason: 'empty' }
  }

  if (currentPath === objectKey) {
    return { migrated: false, skipped: true, reason: 'already-mapped' }
  }

  if (!(await fileExists(currentPath))) {
    return { migrated: false, skipped: true, reason: 'missing-local-file' }
  }

  await uploadLocalFile(objectKey, currentPath, contentType)
  await update(objectKey)
  console.log(`migrated ${label}: ${currentPath} -> ${objectKey}`)
  return { migrated: true, skipped: false }
}

async function main() {
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: MIGRATION_USER_EMAIL,
    password: MIGRATION_USER_PASSWORD,
  })

  if (authError || !authData.user) {
    throw new Error(`Failed to sign in migration user: ${authError?.message ?? 'unknown error'}`)
  }

  const migrationSupabaseUserId = authData.user.id
  console.log(`signed in as ${MIGRATION_USER_EMAIL} (${migrationSupabaseUserId})`)

  const projects = await prisma.project.findMany({
    include: {
      user: true,
      sourceImages: true,
      segments: {
        include: {
          recordings: true,
        },
      },
    },
    where: {
      user: {
        supabaseUserId: migrationSupabaseUserId,
      },
    },
    orderBy: { createdAt: 'asc' },
  })

  let migratedCount = 0
  let skippedCount = 0

  for (const project of projects) {
    if (!project.user?.supabaseUserId) {
      skippedCount += 1
      console.warn(`skip project ${project.id}: missing linked supabase user`)
      continue
    }

    const ownerSupabaseUserId = project.user.supabaseUserId

    if (ownerSupabaseUserId !== migrationSupabaseUserId) {
      skippedCount += 1
      console.warn(`skip project ${project.id}: owned by another supabase user`)
      continue
    }

    const paths = getProjectStoragePaths(ownerSupabaseUserId, project.id)

    if (project.audioPath && !isAlreadyMigrated(project.audioPath, ownerSupabaseUserId, project.id)) {
      const result = await migrateField({
        label: `project audio ${project.id}`,
        currentPath: project.audioPath,
        objectKey: path.posix.join(paths.audioDir, path.basename(project.audioPath)),
        contentType: project.audioMimeType,
        update: (audioPath) => prisma.project.update({ where: { id: project.id }, data: { audioPath } }),
      })
      migratedCount += Number(result.migrated)
      skippedCount += Number(result.skipped)
    }

    for (const image of project.sourceImages) {
      const result = await migrateField({
        label: `image ${image.id}`,
        currentPath: image.imagePath,
        objectKey: path.posix.join(paths.imageDir, path.basename(image.imagePath)),
        contentType: image.mimeType,
        update: (imagePath) => prisma.sourceImage.update({ where: { id: image.id }, data: { imagePath } }),
      })
      migratedCount += Number(result.migrated)
      skippedCount += Number(result.skipped)
    }

    for (const segment of project.segments) {
      const result = await migrateField({
        label: `segment audio ${segment.id}`,
        currentPath: segment.audioPath,
        objectKey: path.posix.join(paths.audioDir, path.basename(segment.audioPath)),
        contentType: project.audioMimeType,
        update: (audioPath) => prisma.segment.update({ where: { id: segment.id }, data: { audioPath } }),
      })
      migratedCount += Number(result.migrated)
      skippedCount += Number(result.skipped)

      for (const recording of segment.recordings) {
        const result = await migrateField({
          label: `recording ${recording.id}`,
          currentPath: recording.filePath,
          objectKey: path.posix.join(paths.recordingDir, path.basename(recording.filePath)),
          contentType: 'audio/webm',
          update: (filePath) => prisma.recording.update({ where: { id: recording.id }, data: { filePath } }),
        })
        migratedCount += Number(result.migrated)
        skippedCount += Number(result.skipped)
      }
    }
  }

  await supabase.auth.signOut()

  console.log(`migration complete: migrated=${migratedCount}, skipped=${skippedCount}, storage_root=${STORAGE_ROOT}`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
