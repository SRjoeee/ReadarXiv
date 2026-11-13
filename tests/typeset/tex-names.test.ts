// The typesetter's head and reference names (packages/typeset/src/data/rules/heads.ts, refs.ts, the package's source) held
// to what they mirror: the engine's packages/engine/src/source/tex-names.json, the names TeX Live 2025's packages print
// (docs/THIRD_PARTY.md), which the source reader reads too. Here, outside both packages, so that the tie outlives today's
// engine and its copy of the file (the cut-over deletes src/pdf-reader/engine/, never packages/).
//
// Tied, for every language the package holds: HEADS[tag] is tex-names.json's targets[tag].heads; REFS.types, .conjunctions
// and .singular are its types, conjunctions and singular; REFS.targets[tag] is its targets[tag].refs and .conj. The package
// adds no field of its own. The file's other fields (note, licence, image, files, gaps, conjunctionGaps) are the engine's:
// the typesetter takes none of them.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { HEADS } from '../../packages/typeset/src/data/rules/heads.ts'
import { REFS } from '../../packages/typeset/src/data/rules/refs.ts'

type Names = {
  types: Record<string, string>
  conjunctions: string[]
  singular: Record<string, string>
  targets: Record<string, { heads: Record<string, string>; refs: Record<string, string>; conj: Record<string, string> }>
}
const names = (): Names =>
  JSON.parse(readFileSync(resolve(__dirname, '../../packages/engine/src/source/tex-names.json'), 'utf8')) as Names

describe("the typesetter's head and reference names are the engine's tex-names.json", () => {
  it('holds every language of the package, in both tables', () => {
    const n = names()
    expect(Object.keys(HEADS).sort()).toEqual(Object.keys(REFS.targets).sort())
    for (const tag of Object.keys(HEADS)) expect(Object.hasOwn(n.targets, tag)).toBe(true)
  })
  it("each language's head names are its targets' heads", () => {
    const n = names()
    for (const [tag, heads] of Object.entries(HEADS)) expect(heads).toEqual(n.targets[tag]!.heads)
  })
  it("the reference names: the forms' types, the conjunctions, the singulars and each language's refs and conj", () => {
    const n = names()
    expect(Object.keys(REFS).sort()).toEqual(['conjunctions', 'singular', 'targets', 'types'])
    expect(REFS.types).toEqual(n.types)
    expect(REFS.conjunctions).toEqual(n.conjunctions)
    expect(REFS.singular).toEqual(n.singular)
    for (const [tag, t] of Object.entries(REFS.targets)) {
      expect(Object.keys(t).sort()).toEqual(['conj', 'refs'])
      expect(t).toEqual({ refs: n.targets[tag]!.refs, conj: n.targets[tag]!.conj })
    }
  })
})
