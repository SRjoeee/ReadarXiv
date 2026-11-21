import { describe, expect, it } from 'vitest'
import { READER_PURPOSE } from '../src/index.ts'

describe('@readarxiv/reader', () => {
  it('states what the package is for', () => {
    expect(READER_PURPOSE).toBe('the page stack, composing, session, highlight and the Host a reader runs in')
  })
  it('runs in the DOM environment its code needs', () => {
    expect('document' in globalThis).toBe(true)
  })
})
