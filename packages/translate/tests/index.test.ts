import { describe, expect, it } from 'vitest'
import { TRANSLATE_PURPOSE } from '../src/index.ts'

describe('@readarxiv/translate', () => {
  it('states what the package is for', () => {
    expect(TRANSLATE_PURPOSE).toBe('the translator contract, its adapters and the chain that falls back between them')
  })
  it('runs in Node, with no DOM', () => {
    expect('document' in globalThis).toBe(false)
  })
})
