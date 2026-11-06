import { describe, expect, it } from 'vitest'
import { UI_PURPOSE } from '../src/index.ts'

describe('@readarxiv/ui', () => {
  it('states what the package is for', () => {
    expect(UI_PURPOSE).toBe('the controls, the tokens and the strings the extension, the reader and the website share')
  })
  it('runs in the DOM environment its code needs', () => {
    expect('document' in globalThis).toBe(true)
  })
})
