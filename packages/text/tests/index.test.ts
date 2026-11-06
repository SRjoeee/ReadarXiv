import { describe, expect, it } from 'vitest'
import { TEXT_PURPOSE } from '../src/index.ts'

describe('@readarxiv/text', () => {
  it('states what the package is for', () => {
    expect(TEXT_PURPOSE).toBe('sentence cuts and paper ids: the small facts several packages share')
  })
  it('runs in Node, with no DOM', () => {
    expect('document' in globalThis).toBe(false)
  })
})
