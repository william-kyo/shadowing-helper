import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

function getFfmpegPath() {
  return path.join(
    process.cwd(),
    'node_modules',
    'ffmpeg-static',
    process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg',
  )
}

export function computeFileHash(buffer: Buffer | ArrayBuffer | Uint8Array): string {
  const view = buffer instanceof Buffer
    ? buffer
    : Buffer.from(buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : buffer)
  return createHash('sha256').update(view).digest('hex')
}

export async function computePcmHash(params: {
  inputBuffer: Buffer
  inputExtension: string
}): Promise<string> {
  const tempDir = await mkdtemp(path.join(tmpdir(), 'pcm-hash-'))
  const inputPath = path.join(tempDir, `input${params.inputExtension || '.tmp'}`)

  try {
    await writeFile(inputPath, params.inputBuffer)

    return await new Promise<string>((resolve, reject) => {
      const hash = createHash('sha256')
      const proc = spawn(
        getFfmpegPath(),
        [
          '-hide_banner',
          '-loglevel', 'error',
          '-i', inputPath,
          '-vn',
          '-f', 's16le',
          '-ac', '1',
          '-ar', '16000',
          '-',
        ],
        { stdio: ['ignore', 'pipe', 'pipe'] },
      )

      let stderr = ''
      proc.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString()
      })
      proc.stdout.on('data', (chunk: Buffer) => hash.update(chunk))
      proc.on('error', reject)
      proc.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`ffmpeg pcm decode failed (code ${code}): ${stderr}`))
          return
        }
        resolve(hash.digest('hex'))
      })
    })
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }
}
