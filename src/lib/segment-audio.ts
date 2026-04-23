import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export async function extractAudioSegment(params: {
  inputPath: string
  outputPath: string
  startSeconds: number
  endSeconds: number
}) {
  await execFileAsync('ffmpeg', [
    '-y',
    '-i',
    params.inputPath,
    '-ss',
    params.startSeconds.toString(),
    '-to',
    params.endSeconds.toString(),
    '-vn',
    params.outputPath,
  ])
}

export async function extractAudioSegmentFromBuffer(params: {
  inputBuffer: Buffer
  inputExtension: string
  outputExtension: string
  startSeconds: number
  endSeconds: number
}) {
  const tempDir = await mkdtemp(path.join(tmpdir(), 'segment-audio-'))
  const inputPath = path.join(tempDir, `input${params.inputExtension || '.tmp'}`)
  const outputPath = path.join(tempDir, `output${params.outputExtension || '.tmp'}`)

  try {
    await writeFile(inputPath, params.inputBuffer)
    await extractAudioSegment({
      inputPath,
      outputPath,
      startSeconds: params.startSeconds,
      endSeconds: params.endSeconds,
    })

    return await readFile(outputPath)
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }
}
