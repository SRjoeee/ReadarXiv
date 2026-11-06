// The engine package's copies of today's ink makers (packages/engine/src/locate/today: the ledger, inkUnitsOf, keptUnitsOf,
// claimInk, figureUnitsOf, and what they import, deps.mjs) and the ports beside them (locate/ink.ts: contentOf, unicodeOf, spansOf;
// deps.mjs classOf for the forms an ink unit's placeholder takes) held equal to today's (src/pdf-reader/engine): the same pages,
// owners and units in, the same units out.
import { describe, expect, it } from 'vitest'
import * as P from '../../packages/engine/src/locate/ink.ts'
import * as T from '../../packages/engine/src/locate/today/today.types.ts'
import { figureUnitsOf } from '../../src/pdf-reader/engine/layout/figure-text.mjs'
import { claimInk, inkUnitsOf, keptUnitsOf } from '../../src/pdf-reader/engine/layout/ink-units.mjs'
import { ledgerOf } from '../../src/pdf-reader/engine/layout/ledger.mjs'
import { classOf } from '../../src/pdf-reader/engine/layout/marks.mjs'
import { contentOf, spansOf, unicodeOf } from '../../src/pdf-reader/engine/pipeline/instrument.mjs'

type G = Record<string, unknown>
/** a page in today's shape: lines of glyphs set left to right (a glyph half its size wide), the marks' points by glyph */
function pageOf(lines: { s: string; x?: number; y: number; size?: number; font?: string; form?: boolean; fid?: number }[], marks: { points?: [string, number][]; paras?: [string, number][]; paraEnds?: [string, number, number, number][]; regions?: { kind: string; from: number; to: number }[]; pictures?: [string, number][] } = {}) {
  const glyphs: G[] = []
  lines.forEach((l, n) => {
    const size = l.size ?? 10
    let x = l.x ?? 72
    for (const u of l.s) {
      glyphs.push({ u, x0: x, x1: x + 0.5 * size, ix0: x, ix1: x + 0.5 * size, y: l.y, size, top: l.y + 0.7 * size, bottom: l.y - 0.2 * size, font: l.font ?? 'ABCDEF+CMR10', fill: 0, n, k: glyphs.length, form: !!l.form, ...(u === ' ' ? { blank: true } : {}), ...(l.fid ? { fid: l.fid } : {}) })
      x += 0.5 * size
    }
  })
  const pt = ([name, glyph]: [string, number]) => ({ name, glyph, box: 0 })
  return {
    glyphs, turned: [], boxes: [], paths: [], boxAt: glyphs.map(() => 0), view: [0, 0, 612, 792],
    points: (marks.points ?? []).map(pt), paras: (marks.paras ?? []).map(pt),
    paraEnds: (marks.paraEnds ?? []).map(([name, glyph, point, para]) => ({ name, glyph, box: 0, point, para })),
    regions: marks.regions ?? [], pictures: (marks.pictures ?? []).map(pt), shapes: new Map(), figures: new Map(), unseen: new Set(), cut: new Map(),
  }
}

const page1 = pageOf([
  { s: 'Journal of Tests', y: 760 },
  { s: 'Body owned text', y: 700 },
  { s: 'An orphan line with x math', y: 688 },
  { s: 'see https://example.org/x', y: 676 },
  { s: 'int main() {', y: 664, font: 'ABCDEF+CMTT10' },
  { s: 'Accuracy', y: 600, form: true, fid: 1 },
  { s: 'A centred line', x: 250, y: 560 },
  { s: '1', x: 300, y: 40 },
], {
  points: [['bs1', 16], ['be1', 116]],
  paras: [['q1', 102]],
  paraEnds: [['qe1c', 116, 1, 1]],
})
// (the math run of the orphan line: its "x" in a math face)
;(page1.glyphs[16 + 15 + 20] as G).font = 'ABCDEF+CMMI10'
const page2 = pageOf([
  { s: '1 Introduction . . . 3', y: 700 },
  { s: '2 Method . . . 5', y: 688 },
  { s: 'Method', y: 600, size: 12 },
  { s: 'A. Author. A title of a paper.', y: 500 },
], {
  points: [['bs2', 0], ['n0.contents.e', 0], ['1s', 38], ['1e', 44], ['bi1', 44], ['bz1', 74], ['be2', 74]],
})
const pages = [page1, page2]
const units = [
  { kind: 'para', pieces: [{ t: 'text', s: 'Body owned text' }] },
  { kind: 'heading', pieces: [{ t: 'text', s: 'Method' }] },
]
/** the source units' ownership: the body's paragraph and the heading */
const ownOf = (): { glyphs: (string | null)[][]; boxes: (string | null)[][] } => ({
  glyphs: [page1.glyphs.map((_, g) => (g >= 16 && g < 31 ? 'u0' : null)), page2.glyphs.map((_, g) => (g >= 38 && g < 44 ? 'u1' : null))],
  boxes: [[], []],
})

/** what the sequence reads of an implementation of the makers (today's, or the package's copies) */
interface Impl {
  figureUnitsOf(pages: unknown, own: unknown): { glyphs: Map<number, number>[]; units: { group: string; text: string }[] }
  ledgerOf(pages: unknown, own: unknown, o: unknown): { lines: unknown[] }
  inkUnitsOf(pages: unknown, ledger: unknown, o: unknown): { kind: string; pieces: { t: string; src?: string }[] }[]
  claimInk(own: unknown, ink: unknown, pages: unknown): number
  keptUnitsOf(pages: unknown, ledger: unknown, owner: (p: number, g: number) => string | null, o: unknown): unknown[]
}
const TODAY = { figureUnitsOf, ledgerOf, inkUnitsOf, claimInk, keptUnitsOf } as unknown as Impl
/** today's sequence (pipeline/instrument.mjs before this change) by one implementation */
function run(I: Impl) {
  const own = ownOf()
  const fig = I.figureUnitsOf(pages, own)
  const glyphs = own.glyphs.map((row, i) => { const m = fig.glyphs[i]; if (!m?.size) return row; const out = [...row]; for (const [g, k] of m) out[g] = fig.units[k]!.group; return out })
  const ledger = I.ledgerOf(pages, { glyphs }, { units })
  const ink = I.inkUnitsOf(pages, ledger, { units, from: 2 })
  const claimed = I.claimInk(own, ink, pages)
  const kept = I.keptUnitsOf(pages, ledger, (p: number, g: number) => own.glyphs[p - 1]?.[g] ?? (fig.glyphs[p - 1]?.has(g) ? 'f' : null), { from: 2 + ink.length })
  return { fig, lines: ledger.lines, ink, claimed, own, kept }
}

describe('today’s ink makers in the engine package', () => {
  it('make the same figure texts, ledger lines, ink units, claims and kept blocks as today’s', () => {
    const today = run(TODAY)
    const copy = run(T as unknown as Impl)
    expect(copy).toEqual(today)
    // (and the page makes what the test means it to: a head, notes or orphans, a figure text, contents lines and an entry)
    expect(today.ink.map((u) => u.kind)).toEqual(expect.arrayContaining(['inkheads', 'inkorphan', 'inkcontents', 'inkreferences']))
    expect(today.fig.units.map((u) => u.text)).toEqual(['Accuracy'])
    expect(today.kept.length).toBeGreaterThan(0)
  })
  it('read a placeholder an ink unit makes as today’s classOf does', () => {
    for (const src of ['$$', '$x$', '$a+b$', '\\url{https://a.b/c}', '\\url{}']) expect(T.classOf({ t: 'ph', src })).toBe(classOf({ t: 'ph', src }))
    expect(T.classOf({ t: 'ph', src: '$x$', kind: 'other' })).toBe(null)
    expect(T.classOf({ t: 'nested' })).toBe(classOf({ t: 'nested' }))
  })
  it('turn an ink unit’s pieces into the format’s content and spans as the instrument adapter did', () => {
    const today = run(TODAY)
    const kindOf = (p: unknown) => classOf(p as { t: string; src?: string }) ?? 'other'
    for (const u of today.ink) {
      expect(P.contentOf(u.pieces)).toEqual(contentOf(u.pieces, { kindOf }))
      expect(P.spansOf(u.pieces)).toEqual(spansOf(u.pieces))
    }
    const pieces = [{ t: 'open', id: 1, src: '\\textbf{' }, { t: 'text', s: P.latin1View('Física é') }, { t: 'close', id: 1, src: '}' }, { t: 'ph', src: '$x$' }]
    expect(P.contentOf(pieces)).toEqual(contentOf(pieces, { kindOf }))
    expect(P.spansOf(pieces)).toEqual(spansOf(pieces))
    for (const s of ['plain', P.latin1View('Física'), 'wide \u4e2d', 3]) expect(P.unicodeOf(s)).toBe(unicodeOf(s))
  })
})
