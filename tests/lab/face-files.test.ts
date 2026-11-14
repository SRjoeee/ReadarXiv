// @vitest-environment node
// The release check's `face-files` (lab/typeset/face-files.mjs over lab/typeset/face-tables.py's reading of the files): the
// typesetter's HOLDS and SMCP (packages/typeset/src/data/faces.ts) held to the face files' OpenType tables, by the check's own
// reference (lab/typeset/face-files.json). Here on tables written for the test: lists that agree pass, and each seeded
// difference fails, named; and the reference itself against the catalogue it serves, which needs no font file.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { differencesOf, heldOf, REFERENCE } from '../../lab/typeset/face-files.mjs'
import { FACES, HOLDS, SMCP } from '../../packages/typeset/src/data/faces.ts'

/** a reference of two faces and two alphabets, as face-files.json holds them */
const reference = {
  files: { faces: { serif: 'Serif.otf', caps: 'Caps.otf' } },
  letters: { alphabets: { Latn: 'Aa', de: 'AaÄä' } },
  sha256: { faces: { serif: 'a'.repeat(64), caps: 'b'.repeat(64) } },
}
/** each face's tables as face-tables.py writes them: its file, its SHA-256, the letters each alphabet leaves unmapped, smcp */
const tables = () => ({
  serif: { file: 'Serif.otf', sha256: 'a'.repeat(64), unmapped: {}, smcp: false },
  caps: { file: 'Caps.otf', sha256: 'b'.repeat(64), unmapped: { de: 'Ää' }, smcp: true },
})
const lists = { faces: ['serif', 'caps'], holds: { serif: ['Latn', 'de'], caps: ['Latn'] }, smcp: ['caps'] }

describe("the face files' tables, against the package's lists", () => {
  it('reads the alphabets a face holds as those its file leaves no letter of unmapped, in the reference order', () => {
    expect(heldOf(tables().caps, reference.letters.alphabets)).toEqual(['Latn'])
    expect(heldOf(tables().serif, reference.letters.alphabets)).toEqual(['Latn', 'de'])
  })
  it('passes lists that are the files’: every alphabet held listed, SMCP the faces whose GSUB has smcp', () => {
    expect(differencesOf(tables(), reference, lists)).toEqual([])
  })
  it('fails an alphabet claimed whose letters a face does not map, and one held that HOLDS leaves out, each named', () => {
    expect(differencesOf(tables(), reference, { ...lists, holds: { ...lists.holds, caps: ['Latn', 'de'] } })).toEqual([
      "caps: HOLDS claims de, its file's cmap does not map Ää",
    ])
    expect(differencesOf(tables(), reference, { ...lists, holds: { ...lists.holds, serif: ['Latn'] } })).toEqual([
      "serif: its file's cmap maps every letter of de, HOLDS leaves it out",
    ])
    expect(differencesOf(tables(), reference, { ...lists, holds: { ...lists.holds, serif: ['de', 'Latn'] } })).toEqual([
      "serif: HOLDS lists its alphabets in another order than the reference's (Latn de)",
    ])
  })
  it('fails a face claimed in SMCP whose GSUB has no smcp, and one whose GSUB has it that SMCP leaves out', () => {
    expect(differencesOf(tables(), reference, { ...lists, smcp: ['caps', 'serif'] })).toEqual([
      "serif: SMCP claims it, its file's GSUB has no smcp feature",
    ])
    expect(differencesOf(tables(), reference, { ...lists, smcp: [] })).toEqual([
      "caps: its file's GSUB has the smcp feature, SMCP leaves it out",
    ])
  })
  it('fails a file not of its binding SHA-256, a file missing, and a face the reference and the catalogue do not share', () => {
    const other = { ...tables(), serif: { ...tables().serif, sha256: 'c'.repeat(64) } }
    expect(differencesOf(other, reference, lists)).toEqual([
      `serif: Serif.otf sha256 ${'c'.repeat(64)}, not the binding ${'a'.repeat(64)}`,
    ])
    expect(differencesOf({ ...tables(), caps: { file: 'Caps.otf', missing: true } }, reference, lists)).toEqual([
      'caps: Caps.otf not in the fonts folder',
    ])
    expect(differencesOf(tables(), reference, { ...lists, faces: ['serif', 'caps', 'mono'] })).toEqual([
      'mono: a face of the catalogue, no file in the reference',
    ])
    expect(differencesOf(tables(), reference, { ...lists, faces: ['serif'], smcp: [] })).toEqual([
      'caps: a file in the reference, no face of the catalogue',
    ])
  })
})

describe("the check's reference, against the catalogue it serves", () => {
  const ref = () => JSON.parse(readFileSync(REFERENCE, 'utf8'))
  it('names a file and a binding SHA-256 for every face of the catalogue and no other, its alphabets every one HOLDS uses', () => {
    const r = ref()
    const faces = Object.keys(FACES).sort()
    expect(Object.keys(r.files.faces).sort()).toEqual(faces)
    expect(Object.keys(r.sha256.faces).sort()).toEqual(faces)
    for (const d of Object.values(r.sha256.faces)) expect(d).toMatch(/^[0-9a-f]{64}$/)
    for (const alphabets of Object.values(HOLDS)) for (const a of alphabets) expect(Object.hasOwn(r.letters.alphabets, a)).toBe(true)
    // (each block says what it copies and from where)
    for (const block of [r.files, r.letters, r.sha256]) expect([typeof block.copies, typeof block.from]).toEqual(['string', 'string'])
    expect(SMCP.every((id) => Object.hasOwn(r.files.faces, id))).toBe(true)
  })
})
