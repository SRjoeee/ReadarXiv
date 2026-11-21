import { describe, expect, it } from 'vitest'
import { ENGINE_PURPOSE } from '../src/index.ts'

describe('@readarxiv/engine', () => {
  it('states what the package is for', () => {
    expect(ENGINE_PURPOSE).toBe(
      'source, marks, ink, align, locate, wrap, bundle and prepare: a paper in, its bundle out',
    )
  })
  it('runs in Node, with no DOM', () => {
    expect('document' in globalThis).toBe(false)
  })
})
