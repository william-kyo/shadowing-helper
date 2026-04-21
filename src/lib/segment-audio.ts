import { execFile } from 'node:child_process'
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
