// @vitest-environment node
// The front half's adapter's code change of the typing lane T6 (packages/engine/src/instrument/instrument.ts), held to the module
// before it (helpers/instrument-before.mjs, 18f6103ac verbatim but its imports), value for value: glyphPiecesOf's reading of a
// footnote's call after a unit's end point (own.mjs MR 4b) read a unit with no end point on the page as `undefined <= j`, false;
// `(ends.get(u) ?? Infinity) <= j` is false there too. Held on pages written here and seeded ones: points of every kind (a unit's
// start and end, a heading's and a cell's, a placeholder's two, a footnote call's, others), each glyph's group (a unit's text,
// its placeholders', its label, none), units whose tail is one footnote's call or more pieces, texts and names: each glyph's
// piece, and the points open at each page's end, page after page.
import { describe, expect, it } from 'vitest'
import * as NOW from '../../packages/engine/src/instrument/instrument.ts'
import type { SourcePiece } from '../../packages/engine/src/source/latex-front.ts'
import * as BEFORE from './helpers/instrument-before.mjs'

const now = NOW

/** a seeded generator (mulberry32) */
function seeded(seed: number) {
  let a = seed >>> 0
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const int = (n: number) => Math.floor(next() * n)
  const pick = <T>(xs: readonly T[]): T => xs[int(xs.length)] as T
  return { next, int, pick }
}

const PIECES: readonly SourcePiece[] = [
  { t: 'text', s: 'Words of it' },
  { t: 'text', s: ' ' },
  { t: 'ph', src: '\\footnotemark' },
  { t: 'ph', src: '\\cite{a}' },
  { t: 'ph', src: '$x$' },
  { t: 'ph', src: '\\bert' },
  { t: 'ph', src: '\\#' },
  { t: 'ph', src: '\\label{x}' },
]

describe('glyphPiecesOf', () => {
  it('gives each glyph its piece as before, a unit with no end point on its page among them', () => {
    const r = seeded(41)
    for (let n = 0; n < 3000; n++) {
      const count = 1 + r.int(5)
      // (each unit's pieces: some end with one footnote's call after their last text, some with more, some with none)
      const units = Array.from({ length: count }, () => {
        const pieces: SourcePiece[] = Array.from({ length: 1 + r.int(6) }, () => r.pick(PIECES))
        if (r.next() < 0.5) pieces.push({ t: 'text', s: 'last words' }, { t: 'ph', src: '\\footnotemark' })
        return { pieces }
      })
      const texts = new Map([['\\bert', 'BERT'], ['\\#', '#']])
      const pages = Array.from({ length: 1 + r.int(3) }, () => {
        const glyphs = Array.from({ length: r.int(14) }, () => ({ u: r.pick(['B', 'E', 'R', 'T', '#', 'a', '1', ' ']) }))
        const names = [...Array.from({ length: count }, (_, u) => [`${u}s`, `${u}e`, `h${u}e`, `t${u}e`, `p${u}.${r.int(8)}a`, `p${u}.${r.int(8)}b`, `n${u}.${r.int(8)}a`]).flat(), 'bs1', 'c1-1']
        const points = Array.from({ length: r.int(8) }, () => ({ name: r.pick(names), glyph: r.int(glyphs.length + 1), box: 0 })).sort((a, b) => a.glyph - b.glyph)
        const row = glyphs.map(() => (r.next() < 0.2 ? null : r.pick(['.p', '.p', '', '.l']).replace(/^/, `u${r.int(count)}`)))
        return { pg: { points, glyphs }, row }
      })
      const said = new Set(pages.flatMap(p => p.pg.points.map(x => x.name)).filter(() => r.next() < 0.5))
      const openA = new Map<number, number[]>(), openB = new Map<number, number[]>()
      for (const [k, { pg, row }] of pages.entries()) {
        const a = Array.from(now.glyphPiecesOf(pg, row, { units, texts, names: said, open: openA }))
        const b = Array.from(BEFORE.glyphPiecesOf(pg, row, { units, texts, names: said, open: openB }))
        expect(a, `seeded ${n} page ${k}`).toEqual(b)
        expect([...openA], `seeded ${n} page ${k}`).toEqual([...openB])
      }
    }
  })
})
