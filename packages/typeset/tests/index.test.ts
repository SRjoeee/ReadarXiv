import { describe, expect, it } from 'vitest'
import { TYPESET_PURPOSE } from '../src/index.ts'

describe('@readarxiv/typeset', () => {
  it('states what the package is for', () => {
    expect(TYPESET_PURPOSE).toBe('layFlow, rules, language data and painters: a translated unit laid into its room')
  })
  it('runs in Node, with no DOM', () => {
    expect('document' in globalThis).toBe(false)
  })
})
