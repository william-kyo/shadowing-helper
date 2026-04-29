import { describe, expect, it } from 'vitest'

import { createProjectSchema } from '@/lib/validations/project'

describe('createProjectSchema', () => {
  it('accepts a title with 1 to 120 characters', () => {
    const result = createProjectSchema.safeParse({
      title: 'Shadowing lesson 1',
    })

    expect(result.success).toBe(true)
  })

  it('accepts an empty title (title is optional)', () => {
    const result = createProjectSchema.safeParse({})

    expect(result.success).toBe(true)
  })

  it('accepts an empty string that gets trimmed to nothing (treated as optional)', () => {
    const result = createProjectSchema.safeParse({
      title: '',
    })

    expect(result.success).toBe(true)
  })
})
