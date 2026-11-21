import { describe, expect, it } from 'vitest'
import { newSessionId } from '@/core/scheduler/session'

describe('newSessionId', () => {
  it('ids differ, even fifty within one millisecond', () => {
    const ids = new Set(Array.from({ length: 50 }, () => newSessionId()))
    expect(ids.size).toBe(50)
  })

  it('one token without white space, its first eight characters telling sessions apart (the diagnostics\' scope tag)', () => {
    const ids = Array.from({ length: 50 }, () => newSessionId())
    for (const id of ids) expect(id).toMatch(/^\S{8,}$/)
    expect(new Set(ids.map(id => id.slice(0, 8))).size).toBe(50)
  })
})
