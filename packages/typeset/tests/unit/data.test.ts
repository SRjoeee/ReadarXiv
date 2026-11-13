// The package's data (src/data/faces.ts, src/data/rules/): every export loads, in the shape its type states and the readers
// take for granted (a face's coverage and small capitals name faces of the catalogue; each language's script has its fields;
// the heads and references name the same targets as the rule set), and each export's value is the one it held at 46dd8fcdf,
// where the files were still written from today's tree (lab/typeset/faces-data.mjs, rules-data.mjs): the sha256 of its JSON.
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { FACES, HOLDS, SMCP } from '../../src/data/faces.ts'
import { HYPHENATION, LANGUAGES, SCRIPTS } from '../../src/data/rules/index.ts'
import { HEADS } from '../../src/data/rules/heads.ts'
import { REFS } from '../../src/data/rules/refs.ts'

const keys = (o: object) => Object.keys(o).sort()
const words = (o: Readonly<Record<string, string>>) =>
  Object.entries(o).every(([k, v]) => k.length > 0 && typeof v === 'string' && v.length > 0)

describe("the package's data loads in its shape", () => {
  it('the face catalogue: each face a family of ours, a weight, a slant and a size correction', () => {
    const faces = Object.values(FACES)
    expect(faces.length).toBeGreaterThan(0)
    for (const f of faces) {
      expect(f.family).toMatch(/^axt-[a-z0-9-]+$/)
      expect([400, 500, 700]).toContain(f.weight)
      expect(['normal', 'italic']).toContain(f.style)
      expect(f.size > 0 && f.size <= 1).toBe(true)
    }
  })
  it("each face's coverage names the faces of the catalogue, each alphabet once; the small capitals faces of it, sorted", () => {
    expect(keys(HOLDS)).toEqual(keys(FACES))
    for (const alphabets of Object.values(HOLDS)) {
      expect(alphabets.length).toBeGreaterThan(0)
      expect(new Set(alphabets).size).toBe(alphabets.length)
      for (const a of alphabets) expect(a).toMatch(/^(?:Latn|Cyrl|[a-z]{2})$/)
    }
    expect(SMCP.every((id) => Object.hasOwn(FACES, id))).toBe(true)
    expect([...SMCP]).toEqual([...new Set(SMCP)].sort())
  })
  it("the rule set: every script with the same fields, every language's script among them, a language's own fields a script's or its labels", () => {
    const fields = keys(Object.values(SCRIPTS)[0]!)
    for (const s of Object.values(SCRIPTS)) expect(keys(s)).toEqual(fields)
    for (const [tag, l] of Object.entries(LANGUAGES)) {
      expect(Object.hasOwn(SCRIPTS, new Intl.Locale(tag).maximize().script ?? '')).toBe(true)
      for (const f of Object.keys(l)) expect(f === 'labels' || fields.includes(f)).toBe(true)
      // (a label is a string, empty where the language names none: zh's preface, zh-TW's proof)
      expect(Object.values(l.labels ?? {}).every((v) => typeof v === 'string')).toBe(true)
    }
    const { minWord, ...minimums } = HYPHENATION as { minWord: number } & Record<
      string,
      { left: number; right: number }
    >
    expect(Number.isInteger(minWord) && minWord > 0).toBe(true)
    for (const m of Object.values(minimums)) expect(Number.isInteger(m.left) && Number.isInteger(m.right)).toBe(true)
  })
  it("the head and reference names: the rule set's targets, each a table of words", () => {
    expect(keys(HEADS)).toEqual(keys(LANGUAGES))
    expect(keys(REFS.targets)).toEqual(keys(LANGUAGES))
    for (const h of Object.values(HEADS)) expect(words(h)).toBe(true)
    expect(words(REFS.types) && words(REFS.singular)).toBe(true)
    expect(REFS.conjunctions.every((c) => typeof c === 'string' && c.length > 0)).toBe(true)
    for (const t of Object.values(REFS.targets)) expect(words(t.refs) && words(t.conj)).toBe(true)
  })
})

describe("the package's data holds the values it held at 46dd8fcdf", () => {
  const digest = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex')
  it('each export, by the sha256 of its JSON', () => {
    expect({
      FACES: digest(FACES),
      HOLDS: digest(HOLDS),
      SMCP: digest(SMCP),
      SCRIPTS: digest(SCRIPTS),
      HYPHENATION: digest(HYPHENATION),
      LANGUAGES: digest(LANGUAGES),
      HEADS: digest(HEADS),
      REFS: digest(REFS),
    }).toEqual({
      FACES: 'cfeac43d844e102e2ce07c1541ad8f14d6d1878e44b2c57d3e92d812c0178189',
      HOLDS: '81306dcee2ebcf89ca1bd51ebf3fbbbc8318af77aab4451887761996bf23004f',
      SMCP: '466523129b1d28e7761185a3f3d4414106872743a8d555d710eab63a4452e9e4',
      SCRIPTS: 'eae077b71323825d238b5fe18c47981a7cdfef4f80ab10884a451911290ae1a6',
      HYPHENATION: '67c131282f53501f3228f571cc3a15d1f932e60cec6365e6a5128735167a11e1',
      LANGUAGES: 'f5807f3a2e597cb84f8961676f8228a37e90770a95dc7de8b3b2b9f9a618b9b4',
      HEADS: '5f0000fdc80442207d44decb1b0fcacf1d8e0f6c9d285e7dc37de296b03b1735',
      REFS: 'd0aa146767b471c48b78aca12b3afae910f4c3992f00fa7065d0b15cbf1c0af8',
    })
  })
})
