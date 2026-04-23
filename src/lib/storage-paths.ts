function getLowercaseExtension(fileName: string) {
  const lastDotIndex = fileName.lastIndexOf('.')
  if (lastDotIndex < 0) {
    return ''
  }

  return fileName.slice(lastDotIndex).toLowerCase()
}

export function createStoredFileName(originalName: string) {
  return `${crypto.randomUUID()}${getLowercaseExtension(originalName)}`
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
