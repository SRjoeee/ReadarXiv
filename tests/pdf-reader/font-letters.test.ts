import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { COVERAGE, METRICS } from '../../packages/engine/src/fonts/font-coverage.ts'
import { HOLDS, SMCP } from '../../packages/engine/src/fonts/font-letters.ts'
import { LETTER_SETS } from '../../packages/engine/src/fonts/font-roles.ts'

// What a reader reads of each face's coverage (packages/engine/src/fonts/font-letters.ts: which alphabets a face holds every letter of, and which
// faces set small capitals of their own), made from the coverage table (font-coverage.ts, which scripts/font-roles.py makes from
// the face files), so that the table itself is no part of a reader's bundle. The file is written by this test and held to the
// table by it: WRITE_FONT_LETTERS=1 pnpm vitest run tests/pdf-reader/font-letters.test.ts writes it again.

const FILE = resolve('packages/engine/src/fonts/font-letters.ts')
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
  return `// packages/engine/src/fonts/font-letters.ts
// Made from the coverage table (font-coverage.ts) by tests/pdf-reader/font-letters.test.ts, which holds the two equal
// (WRITE_FONT_LETTERS=1 writes it again): what a reader reads of each face's coverage, so that the table itself is no part of
// a reader's bundle. Not edited by hand.

/** each face's alphabets whose every letter it holds (font-roles.ts LETTER_SETS: a language's own, and a script's bare letters):
 *  its file's cmap, the OpenType character map (its best Unicode subtable), as the coverage table holds it */
export const HOLDS: Readonly<Record<string, readonly string[]>> = Object.freeze({
${ids.map(id => `  ${JSON.stringify(id)}: Object.freeze(${JSON.stringify(holdsOf(id))}),`).join('\n')}
})
/** the faces that set small capitals of their own: their file's GSUB table has OpenType's \`smcp\` feature (the table's METRICS) */
export const SMCP: readonly string[] = Object.freeze(${JSON.stringify(smcp)})
`
}

describe('the faces\' letters a reader reads (rules/font-letters.mjs)', () => {
  it('is what the coverage table says, face by face and alphabet by alphabet', () => {
    const want = made()
    if (process.env.WRITE_FONT_LETTERS === '1') writeFileSync(FILE, want)
    expect(readFileSync(FILE, 'utf8')).toBe(want)
  })
  // (each face's row read as a reader reads it, by membership: an alphabet is in it exactly where the face's coverage, its file's
  // cmap, maps every letter of it; a CJK face's row, Latin Modern Math's and the caps face's among them, which no style of a
  // Latin group asks (font-roles.ts styled): the table is the files', whoever reads it)
  it('lists an alphabet in a face\'s row exactly where its coverage holds every letter of it, face by face', () => {
    for (const id of Object.keys(COVERAGE))
      for (const a of Object.keys(LETTER_SETS)) {
        const all = [...LETTER_SETS[a]!].every(ch => holds(COVERAGE[id as keyof typeof COVERAGE] as readonly number[], ch.codePointAt(0)!))
        expect(HOLDS[id]!.includes(a), `${id} ${a}`).toBe(all)
      }
    // (the rows no style asks, each with an alphabet in it and one not)
    expect(HOLDS['shs-sc-regular']!.includes('Latn')).toBe(true)
    expect(HOLDS['shs-sc-regular']!.includes('fr')).toBe(false)
    expect(HOLDS['lm-math']!.includes('Cyrl')).toBe(false)
  })
  // (each face read as a reader asks it, by membership: in SMCP exactly where its file's GSUB has the smcp feature, METRICS)
  it('lists a face among those of small capitals of their own exactly where its file has the smcp feature', () => {
    for (const id of Object.keys(METRICS)) expect(SMCP.includes(id), id).toBe((METRICS as Record<string, { smcp: boolean }>)[id]!.smcp)
    expect(SMCP.includes('libertine-regular')).toBe(true)
    expect(SMCP.includes('nimbus-roman-regular')).toBe(false)
  })
  it('names every face of the table, and some alphabets of each that sets text', () => {
    expect(Object.keys(HOLDS).sort()).toEqual(Object.keys(COVERAGE).sort())
    expect(HOLDS['lm-roman-regular']).toContain('Latn')
    expect(SMCP.every(id => Object.hasOwn(METRICS, id))).toBe(true)
  })
})
