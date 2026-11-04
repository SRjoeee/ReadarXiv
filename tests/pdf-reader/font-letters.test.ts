import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { COVERAGE, METRICS } from '@/pdf-reader/engine/rules/font-coverage.mjs'
import { HOLDS, SMCP } from '@/pdf-reader/engine/rules/font-letters.mjs'
import { LETTER_SETS } from '@/pdf-reader/engine/rules/font-roles.mjs'

// What a reader reads of each face's coverage (rules/font-letters.mjs: which alphabets a face holds every letter of, and which
// faces set small capitals of their own), made from the coverage table (font-coverage.mjs, which scripts/font-roles.py makes from
// the face files), so that the table itself is no part of a reader's bundle. The file is written by this test and held to the
// table by it: WRITE_FONT_LETTERS=1 pnpm vitest run tests/pdf-reader/font-letters.test.ts writes it again.

const FILE = resolve('src/pdf-reader/engine/rules/font-letters.mjs')
/** whether a face's coverage (sorted, disjoint inclusive ranges, start and end in turn) holds a code point */
const holds = (r: readonly number[], cp: number) => {
  let lo = 0, hi = r.length / 2 - 1
  while (lo <= hi) {
    const m = (lo + hi) >> 1
    if (cp < r[2 * m]!) hi = m - 1
    else if (cp > r[2 * m + 1]!) lo = m + 1
    else return true
  }
  return false
}
const made = () => {
  const ids = Object.keys(COVERAGE).sort()
  const holdsOf = (id: string) => Object.keys(LETTER_SETS).filter(a => [...LETTER_SETS[a]!].every(ch => holds(COVERAGE[id as keyof typeof COVERAGE] as readonly number[], ch.codePointAt(0)!)))
  const smcp = Object.keys(METRICS).filter(id => (METRICS as Record<string, { smcp: boolean }>)[id]!.smcp).sort()
  return `// src/pdf-reader/engine/rules/font-letters.mjs
// Made from the coverage table (font-coverage.mjs) by tests/pdf-reader/font-letters.test.ts, which holds the two equal
// (WRITE_FONT_LETTERS=1 writes it again): what a reader reads of each face's coverage, so that the table itself is no part of
// a reader's bundle. Not edited by hand.

/** each face's alphabets whose every letter it holds (font-roles.mjs LETTER_SETS: a language's own, and a script's bare letters) */
export const HOLDS = Object.freeze({
${ids.map(id => `  ${JSON.stringify(id)}: Object.freeze(${JSON.stringify(holdsOf(id))}),`).join('\n')}
})
/** the faces that set small capitals of their own (GSUB smcp, the table's METRICS) */
export const SMCP = Object.freeze(${JSON.stringify(smcp)})
`
}

describe('the faces\' letters a reader reads (rules/font-letters.mjs)', () => {
  it('is what the coverage table says, face by face and alphabet by alphabet', () => {
    const want = made()
    if (process.env.WRITE_FONT_LETTERS === '1') writeFileSync(FILE, want)
    expect(readFileSync(FILE, 'utf8')).toBe(want)
  })
  it('names every face of the table, and some alphabets of each that sets text', () => {
    expect(Object.keys(HOLDS).sort()).toEqual(Object.keys(COVERAGE).sort())
    expect(HOLDS['lm-roman-regular']).toContain('Latn')
    expect(SMCP.every(id => Object.hasOwn(METRICS, id))).toBe(true)
  })
})
