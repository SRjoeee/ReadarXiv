// The package's data (src/data/faces.ts, src/data/rules/): every export loads, in the shape its type states and the readers
// take for granted (a face's coverage and small capitals name faces of the catalogue; each language's script has its fields;
// the heads and references name the same targets as the rule set). The heads and references are held to the engine's
// tex-names.json, which they mirror, by tests/typeset/tex-names.test.ts.
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
