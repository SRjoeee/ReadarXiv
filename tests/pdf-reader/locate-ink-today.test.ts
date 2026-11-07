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
  it('read a stack’s glyphs at one x in the stream’s order, where today’s read the float noise of their x (the one difference)', () => {
    // (2307.16209v1 p14's "s = −1/2" in a list of figures: the fraction's 1 and 2 stand at one x, 451.282, which PDF.js composes
    // as 451.28200000000004 and 451.282 on our compile's page and 451.28199999999993 and 451.282 on arXiv's; today's word order
    // by x0 read "21" on the one and "12" on the other. TeX ships a stack top first, so its glyphs at one x are read as the
    // stream holds them: "12" on both)
    const stack = pageOf([
      { s: 'Journal of Tests', y: 760 },
      { s: 'Body owned text', y: 700 },
      { s: 'An orphan line with x 12 and its words after it', y: 688 },
    ], { points: [['bs1', 16], ['be1', 100]] })
    const g = stack.glyphs as G[]
    const at = 16 + 15 + 'An orphan line with '.length
    for (const k of [at, at + 2, at + 3]) g[k]!.font = 'ABCDEF+CMMI10'
    Object.assign(g[at + 2]!, { x0: 182.28200000000004, ix0: 182.28200000000004, x1: 185.782, ix1: 185.782, y: 692, top: 697, bottom: 691, size: 7 })
    Object.assign(g[at + 3]!, { x0: 182.282, ix0: 182.282, x1: 185.782, ix1: 185.782, y: 684, top: 689, bottom: 683, size: 7 })
    const one = (I: Impl) => {
      const own = { glyphs: [stack.glyphs.map((_, k) => (k >= 16 && k < 31 ? 'u0' : null))], boxes: [[]] }
      const ledger = I.ledgerOf([stack], own, { units: units.slice(0, 1) })
      return I.inkUnitsOf([stack], ledger, { units: units.slice(0, 1), from: 1 }).flatMap((u) => u.pieces.filter((p) => p.t === 'ph').map((p) => p.src))
    }
    expect(one(TODAY)).toEqual(['$x21$'])
    expect(one(T as unknown as Impl)).toEqual(['$x12$'])
  })
  it('keep a running head\'s number in its phrase where it stands a word space from it, as its words do: the whole head one unit (the checkpoint\'s "5 of 21")', () => {
    // (2610.30875v1's head "5 of 21" at the page's right: today's took the 5 for the folio, its words recurring with another
    // number on every page, and translated "of 21" beside the original's 5; the 5 stands from "of" as "of" from "21", the phrase's
    // word space, so the copy keeps it the head's: "5 of 21" one unit, each page's its own. amsart's \llap'ed folio, nearer its
    // title's last word than the title's words stand from each other, stays the page's own ink in both)
    const at = (s: string, n: number, x: number) => pageOf([
      { s, x, y: 760 },
      { s: 'Body owned text', y: 700 },
    ], { points: [['bs1', s.length], ['be1', s.length + 15]] })
    const heads = (I: Impl, list: ReturnType<typeof pageOf>[]) => {
      const own = { glyphs: list.map((p) => p.glyphs.map((g) => ((g as G).y === 700 ? 'u0' : null))), boxes: list.map(() => []) }
      const ledger = I.ledgerOf(list, own, { units: units.slice(0, 1) })
      return I.inkUnitsOf(list, ledger, { units: units.slice(0, 1), from: 1 }).map((u) => u.pieces.filter((p) => p.t === 'text').map((p) => p.src ?? (p as { s?: string }).s).join(''))
    }
    const of21 = [1, 2, 3].map((n) => at(`${n} of 21`, n, 520))
    expect(heads(TODAY, of21)).toEqual(['of 21', 'of 21', 'of 21'])
    expect(heads(T as unknown as Impl, of21)).toEqual(['1 of 21', '2 of 21', '3 of 21'])
    // (amsart's: the title's words a word space apart, its two-digit folio nearer the last: the folio the page's in both)
    const amsart = [11, 13, 15].map((n) => {
      const p = at('MEAN CURVATURE FLOW', n, 100)
      const g = p.glyphs as G[]
      const last = g[18] as G
      const digits = String(n).split('').map((u, k) => ({ ...last, u, x0: (last.x1 as number) + 3 + 5 * k, ix0: (last.x1 as number) + 3 + 5 * k, x1: (last.x1 as number) + 8 + 5 * k, ix1: (last.x1 as number) + 8 + 5 * k, k: g.length + k }))
      p.glyphs = [...g.slice(0, 19), ...digits, ...g.slice(19)] as typeof p.glyphs
      p.points = [{ name: 'bs1', glyph: 21, box: 0 }, { name: 'be1', glyph: 36, box: 0 }]
      return p
    })
    expect(heads(TODAY, amsart)).toEqual(['MEAN CURVATURE FLOW', 'MEAN CURVATURE FLOW', 'MEAN CURVATURE FLOW'])
    expect(heads(T as unknown as Impl, amsart)).toEqual(['MEAN CURVATURE FLOW', 'MEAN CURVATURE FLOW', 'MEAN CURVATURE FLOW'])
    // (ACM's "2 • Names": the folio a word space from a mark of no letter or digit that sets it apart from the head's words, the
    // page's own in both, the names one translation, 2610.37668v1)
    const acm = [2, 4, 6].map((n) => at(`${n} • Ann Author, Bo Writer`, n, 72))
    expect(heads(T as unknown as Impl, acm)).toEqual(heads(TODAY, acm))
    expect(heads(TODAY, acm)[0]).toMatch(/^[^0-9].* Ann Author, Bo Writer$/)
  })
  it('class a word in a text face between a formula\'s lines a line of the formula, no unit (the checkpoint\'s "tr")', () => {
    // (2610.21765v1 p10's display (22): its "tr" in CMR10 a line of its own between the fraction's denominator, a formula's line,
    // and a big bracket, symbols: today's made it an orphan ink unit, translated "TR" over the formula; the copy reads it the
    // formula's, the formula's lines kept as they stand)
    const pg = pageOf([
      { s: 'Body owned text', y: 700 },
      { s: 'ab', x: 100, y: 643, font: 'ABCDEF+CMMI10' },
      { s: 'tr', x: 112, y: 650 },
      { s: '[', x: 122, y: 657, font: 'ABCDEF+CMEX10' },
      { s: 'An orphan line of words after it here', y: 600 },
    ], { points: [['bs1', 0], ['be1', 57]] })
    const one = (I: Impl) => {
      const own = { glyphs: [pg.glyphs.map((_, k) => (k < 15 ? 'u0' : null))], boxes: [[]] }
      const ledger = I.ledgerOf([pg], own, { units: units.slice(0, 1) }) as { lines: { cls: string; gs: number[] }[] }
      const ink = I.inkUnitsOf([pg], ledger, { units: units.slice(0, 1), from: 1 })
      return { lines: ledger.lines.map((l) => [l.cls, l.gs.map((g) => (pg.glyphs[g] as G).u).join('')]), ink: ink.map((u) => u.pieces.map((p) => (p as { s?: string }).s ?? '').join('')) }
    }
    // (a line of text between two formulas, not inside one: no ink of the formulas left and right of it on its band, an orphan
    // in both, 2610.21377v1's "where", "Therefore," between displays)
    const between = pageOf([
      { s: 'Body owned text', y: 700 },
      { s: 'ab', x: 100, y: 660, font: 'ABCDEF+CMMI10' },
      { s: 'where', x: 72, y: 645 },
      { s: 'cd', x: 100, y: 630, font: 'ABCDEF+CMMI10' },
    ], { points: [['bs1', 0], ['be1', 24]] })
    const cls = (I: Impl) => {
      const own = { glyphs: [between.glyphs.map((_, k) => (k < 15 ? 'u0' : null))], boxes: [[]] }
      return (I.ledgerOf([between], own, { units: units.slice(0, 1) }) as { lines: { cls: string }[] }).lines.map((l) => l.cls)
    }
    expect(cls(T as unknown as Impl)).toEqual(cls(TODAY))
    expect(cls(TODAY)).toEqual(['symbols', 'orphan', 'symbols'])
    expect(one(TODAY)).toEqual({ lines: [['symbols', 'ab'], ['orphan', 'tr'], ['symbols', '['], ['orphan', 'An orphan line of words after it here']], ink: ['tr', 'An orphan line of words after it here'] })
    expect(one(T as unknown as Impl)).toEqual({ lines: [['symbols', 'ab'], ['math', 'tr'], ['symbols', '['], ['orphan', 'An orphan line of words after it here']], ink: ['An orphan line of words after it here'] })
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
