// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { listStorageObjectKeys } from '@/lib/storage'

// Supabase marks folders with a null id and real objects with one.
const folder = (name: string) => ({ name, id: null })
const file = (name: string) => ({ name, id: `id-${name}` })

function clientReturning(tree: Record<string, { name: string; id: string | null }[]>) {
  const list = vi.fn(
    async (prefix: string, { limit, offset }: { limit: number; offset: number }) => {
      const entries = tree[prefix] ?? []
      return { data: entries.slice(offset, offset + limit), error: null }
    },
  )
  return { client: { storage: { from: () => ({ list }) } }, list }
}

describe('listStorageObjectKeys', () => {
  beforeEach(() => vi.clearAllMocks())

  it('walks sub-folders so derived keys cannot be missed', async () => {
    // Stage 4 writes its reference clips to keys built at runtime rather than
    // stored in any table, so only enumeration finds them.
    const { client } = clientReturning({
      'uid-1': [folder('projects'), folder('recordings'), file('stray.mp3')],
      'uid-1/projects': [folder('p1')],
      'uid-1/projects/p1': [file('audio.mp3')],
      'uid-1/recordings': [folder('seg-1')],
      'uid-1/recordings/seg-1': [file('take.webm')],
    })

    const keys = await listStorageObjectKeys({
      client: client as never,
      prefix: 'uid-1',
    })

    expect(keys.sort()).toEqual([
      'uid-1/projects/p1/audio.mp3',
      'uid-1/recordings/seg-1/take.webm',
      'uid-1/stray.mp3',
    ])
  })

  it('pages through a folder holding more than one page', async () => {
    const many = Array.from({ length: 250 }, (_, index) => file(`f${index}.mp3`))
    const { client, list } = clientReturning({ 'uid-1': many })

    const keys = await listStorageObjectKeys({ client: client as never, prefix: 'uid-1' })

    expect(keys).toHaveLength(250)
    // 100 + 100 + 50: the short final page ends the loop.
    expect(list).toHaveBeenCalledTimes(3)
  })

  it('returns nothing for an empty prefix', async () => {
    const { client } = clientReturning({})
    await expect(
      listStorageObjectKeys({ client: client as never, prefix: 'uid-1' }),
    ).resolves.toEqual([])
  })

  it('surfaces a listing error rather than reporting an empty prefix', async () => {
    // Silently returning [] here would make a failed sweep look like a clean one
    // and orphan every file the account owned.
    const list = vi.fn().mockResolvedValue({ data: null, error: { message: 'denied' } })
    const client = { storage: { from: () => ({ list }) } }

    await expect(
      listStorageObjectKeys({ client: client as never, prefix: 'uid-1' }),
    ).rejects.toThrow('denied')
  })
})
