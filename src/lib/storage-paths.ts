const ALLOWED_AUDIO_EXTENSIONS = new Set([
  '.mp3', '.wav', '.m4a', '.mp4', '.webm', '.ogg',
])
const ALLOWED_IMAGE_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.webp', '.heic', '.heif',
])
const ALLOWED_EXTENSIONS = new Set([...ALLOWED_AUDIO_EXTENSIONS, ...ALLOWED_IMAGE_EXTENSIONS])

// Normalize a raw extension string (with or without a leading dot) and return
// it only when it matches a whitelisted audio/image extension. Anything
// containing path separators, traversal sequences, or unknown types yields ''.
export function sanitizeExtension(rawExtension: string): string {
  const withDot = rawExtension.startsWith('.') ? rawExtension : `.${rawExtension}`
  const ext = withDot.toLowerCase()
  if (!/^\.[a-z0-9]+$/.test(ext)) {
    return ''
  }
  return ALLOWED_EXTENSIONS.has(ext) ? ext : ''
}

// Extract and sanitize the extension from a filename. Path separators in the
// extension (e.g. "take.webm/../../x" → ".webm/../../x") are rejected.
export function sanitizeFileExtension(fileName: string): string {
  const lastDotIndex = fileName.lastIndexOf('.')
  if (lastDotIndex < 0) {
    return ''
  }
  return sanitizeExtension(fileName.slice(lastDotIndex))
}

export function createStoredFileName(originalName: string) {
  return `${crypto.randomUUID()}${sanitizeFileExtension(originalName)}`
}

export function getProjectStoragePaths(ownerSupabaseUserId: string, projectId: string) {
  const projectDir = `${ownerSupabaseUserId}/projects/${projectId}`

  return {
    projectDir,
    audioDir: `${projectDir}/audio`,
    imageDir: `${projectDir}/images`,
    recordingDir: `${projectDir}/recordings`,
  }
}

export function buildStorageObjectKey(directory: string, fileName: string) {
  return `${directory}/${fileName}`
}
