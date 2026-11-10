import { describe, expect, it } from 'vitest'
import { FORMAT_PURPOSE } from '../src/index.ts'

describe('@readarxiv/format', () => {
  it('states what the package is for', () => {
    expect(FORMAT_PURPOSE).toBe('the schema of the bundle, read and write')
  })
  it('runs in Node, with no DOM', () => {
    expect('document' in globalThis).toBe(false)
  })
})
