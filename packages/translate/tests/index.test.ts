import { describe, expect, it } from 'vitest'
import { adapterOf, chrome, type Fetch, google, microsoft, TRANSLATE_PURPOSE } from '../src/index.ts'

describe('@readarxiv/translate', () => {
  it('states what the package is for', () => {
    expect(TRANSLATE_PURPOSE).toBe('the translator contract, its adapters and the chain that falls back between them')
  })
  it('runs in Node, with no DOM', () => {
    expect('document' in globalThis).toBe(false)
  })
})

describe("an identity's adapter (adapterOf): what a host keys a limit it shares among its translators by", () => {
  const fetch: Fetch = async () => {
    throw new Error('no request')
  }
  it("each adapter's translator is its own, whatever its identity's digest", () => {
    expect(adapterOf(microsoft({ fetch }).identity)).toBe('microsoft')
    expect(adapterOf(google({ fetch }).identity)).toBe('google')
    expect(adapterOf(chrome({ api: null }).identity)).toBe('chrome')
    expect(adapterOf('microsoft:0123456789abcdef')).toBe('microsoft')
  })
  it("an identity no adapter here makes is none: a host's own translator, a name alone, another shape", () => {
    for (const identity of [
      'llm:0123456789abcdef',
      'llm:1',
      'nameless',
      'microsoft',
      'microsoft:',
      'google:0123',
      'runs:microsoft:0123456789abcdef',
      'Microsoft:0123456789abcdef',
      'constructor:0123456789abcdef',
    ])
      expect(adapterOf(identity), identity).toBeNull()
  })
})
