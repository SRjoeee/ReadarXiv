// The popup's own sheet (the redesign's design, §5): no :has() (DESIGN §7.2), and every colour a role of the token
// sheet — named, never written (the Global Constraints)
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(join(import.meta.dirname, path), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
const SHEET = read('../../src/entrypoints/popup/popup.css')
const TOKENS = read('../../src/styles/tokens.css')

describe('popup.css', () => {
  it('carries no :has()', () => {
    expect(SHEET).not.toContain(':has(')
  })

  it('writes no colour: every one is a token\'s', () => {
    expect(SHEET).not.toMatch(/#[0-9a-f]{3,8}\b|\b(?:oklch|oklab|rgba?|hsla?)\(/i)
  })

  it('labels what Enter does in the row\'s words: ink on the neutral row, white on the brand\'s chip (Task 101)', () => {
    expect(SHEET).toContain('.popup .go kbd { color: var(--ink); }')
    expect(SHEET).toContain('.popup .go.brand kbd { background: var(--brand-chip); color: var(--on-brand); }')
  })

  it('names only tokens the token sheet defines', () => {
    const named = [...new Set([...SHEET.matchAll(/var\((--[a-z0-9-]+)/g)].map(m => m[1]!))]
    expect(named.filter(name => !TOKENS.includes(`${name}:`))).toEqual([])
  })
})
