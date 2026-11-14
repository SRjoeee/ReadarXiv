// The engine package's copies of today's ink makers (packages/engine/src/locate/today: the ledger, inkUnitsOf, keptUnitsOf,
// claimInk, figureUnitsOf, and what they import, deps.mjs) and the ports beside them (locate/ink.ts: contentOf, unicodeOf, spansOf;
// deps.mjs classOf for the forms an ink unit's placeholder takes) held equal to today's (src/pdf-reader/engine): the same pages,
// owners and units in, the same units out.
import { describe, expect, it } from 'vitest'
import * as P from '../../packages/engine/src/locate/ink.ts'
import * as TF from '../../packages/engine/src/locate/figure-text.ts'
import * as TI from '../../packages/engine/src/locate/ink-units.ts'
import * as TL from '../../packages/engine/src/locate/ledger.ts'
import * as TD from '../../packages/engine/src/locate/today/today.types.ts'
import { figureUnitsOf } from '../../src/pdf-reader/engine/layout/figure-text.mjs'
import { claimInk, inkUnitsOf, keptUnitsOf } from '../../src/pdf-reader/engine/layout/ink-units.mjs'
import { ledgerOf } from '../../src/pdf-reader/engine/layout/ledger.mjs'
import { classOf } from '../../src/pdf-reader/engine/layout/marks.mjs'
import { classesOf, contentOf, spansOf, unicodeOf } from '../../src/pdf-reader/engine/pipeline/instrument.mjs'
import { DISPLAY } from '../../src/pdf-reader/engine/translate/mt.mjs'
import { identifiersIn } from '../../src/pdf-reader/engine/source/latex-front.mjs'

/** the package's copies, as the facades that type them give them (deps.mjs's JavaScript names, and each maker's) */
const T = { ...TD, ...TF, ...TI, ...TL }
type G = Record<string, unknown>
/** a page in today's shape: lines of glyphs set left to right (a glyph half its size wide), the marks' points by glyph */
function pageOf(lines: { s: string; x?: number; y: number; size?: number; font?: string; form?: boolean; fid?: number; space?: number }[], marks: { points?: [string, number][]; paras?: [string, number][]; paraEnds?: [string, number, number, number][]; regions?: { kind: string; from: number; to: number }[]; pictures?: [string, number][] } = {}) {
  const glyphs: G[] = []
  lines.forEach((l, n) => {
    const size = l.size ?? 10
    let x = l.x ?? 72
    for (const u of l.s) {
      // (a space's advance the line's own where it states one: a justified line's, stretched)
      const advance = u === ' ' && l.space !== undefined ? l.space : 0.5 * size
      glyphs.push({ u, x0: x, x1: x + advance, ix0: x, ix1: x + advance, y: l.y, size, top: l.y + 0.7 * size, bottom: l.y - 0.2 * size, font: l.font ?? 'ABCDEF+CMR10', fill: 0, n, k: glyphs.length, form: !!l.form, ...(u === ' ' ? { blank: true } : {}), ...(l.fid ? { fid: l.fid } : {}) })
      x += advance
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
    // (the copy's one addition to them: each kept run's glyphs by its placeholder's piece, `glyphs.runs`, which part today's `ph`)
    type Glyphs = { ph: [number, number][]; runs?: [number, [number, number][]][] }
    const runsOf = (u: unknown) => (u as { glyphs: Glyphs }).glyphs.runs
    const bare = (u: unknown) => {
      const { runs: _, ...glyphs } = (u as { glyphs: Glyphs }).glyphs
      return { ...(u as object), glyphs }
    }
    // (and the crowded texts' met ink, `met`, which locate's relation reading judges, and the closed paths that hold units alone,
    // `holds`, the container step's (F3), with its counters `stats.boxed` and `stats.interior`: figure-lines.ts)
    type Fig = typeof copy.fig & { met?: unknown; holds?: unknown; stats?: Record<string, number> }
    const { met: _met, holds: _holds, ...figCopy } = copy.fig as Fig
    const { boxed: _boxed, interior: _interior, ...stats } = (figCopy as Fig).stats ?? {}
    expect({ ...copy, fig: { ...figCopy, stats }, ink: copy.ink.map(bare) }).toEqual(today)
    for (const u of copy.ink) {
      const runs = runsOf(u) ?? []
      expect(runs.flatMap(([, gs]) => gs)).toEqual((u as unknown as { glyphs: Glyphs }).glyphs.ph)
      for (const [k] of runs) expect(u.pieces[k]?.t).toBe('ph')
    }
    expect(copy.ink.some((u) => (runsOf(u)?.length ?? 0) > 0)).toBe(true)
    // (and the page makes what the test means it to: a head, notes or orphans, a figure text, contents lines and an entry)
    expect(today.ink.map((u) => u.kind)).toEqual(expect.arrayContaining(['inkheads', 'inkorphan', 'inkcontents', 'inkreferences']))
    expect(today.fig.units.map((u) => u.text)).toEqual(['Accuracy'])
    expect(today.kept.length).toBeGreaterThan(0)
  })
  it('part two lines a paragraph end of TeX’s stands between, where no start of TeX’s is marked after it (2610.22065v1’s reference format)', () => {
    // (acmart's "ACM Reference Format:" is a paragraph of its own, and the reference under it another, begun with no point of
    // TeX's: today's read the two as one paragraph by the starts alone, the heading's line and the reference one unit)
    const lines = [
      { s: 'Body owned text', y: 700 },
      { s: 'Reference Format:', y: 676 },
      { s: 'Ann Lee and Bo Chen. 2027. On tests.', y: 664 },
    ]
    const end = 15 + 17
    const pg = pageOf(lines, { points: [['bs1', 0], ['be1', end + 36]], paras: [['q1', 0]], paraEnds: [['qe2j', end, 2, 1]] })
    const one = (I: Impl) => {
      const own = { glyphs: [pg.glyphs.map((_, k) => (k < 15 ? 'u0' : null))], boxes: [[]] }
      const ledger = I.ledgerOf([pg], own, { units: units.slice(0, 1) })
      return I.inkUnitsOf([pg], ledger, { units: units.slice(0, 1), from: 1 }).map((u) => u.pieces.map((p) => (p.t === 'text' ? (p as unknown as { s: string }).s : '')).join(''))
    }
    expect(one(TODAY)).toEqual(['Reference Format: Ann Lee and Bo Chen. 2027. On tests.'])
    expect(one(T as unknown as Impl)).toEqual(['Reference Format:', 'Ann Lee and Bo Chen. 2027. On tests.'])
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
  it('keep a line TeX set in a display as the formula’s, by its points, whatever its face and wherever it stands (the one change)', () => {
    // (2608.08481v1 p7: displays (7) and (8) in REVTeX's widetext at the page's foot, under the footnote rule, no source unit's;
    // their lines in a text face (\\mathrm), cut into ink units of the foot, the right part of (7) and a line of (8) translated.
    // The marked compile states each display TeX sets (marks.mjs POINTS_TEX, its region `display`): the copy keeps its lines as
    // the formula's, today's reads them by their place and face)
    const pg = pageOf([
      { s: 'Body owned text', y: 700 },
      { s: 'D(l) = 4pi(2l + 1) k R(r) dr', x: 90, y: 80 },
      { s: 'A(m) = Y(t) sum Y(t) cos sin d', x: 90, y: 60 },
      { s: '7', x: 500, y: 80 },
    ], { points: [['bs1', 0], ['be1', 15]], regions: [{ kind: 'display', from: 15, to: 15 + 28 + 30 + 1 }] })
    const cls = (I: Impl) => {
      const own = { glyphs: [pg.glyphs.map((_, k) => (k < 15 ? 'u0' : null))], boxes: [[]] }
      const ledger = I.ledgerOf([pg], own, { units: units.slice(0, 1) }) as { lines: { cls: string }[] }
      return { lines: ledger.lines.map((l) => l.cls), ink: I.inkUnitsOf([pg], ledger, { units: units.slice(0, 1), from: 1 }).length }
    }
    expect(cls(TODAY)).toEqual({ lines: ['notes', 'notes', 'symbols'], ink: 2 })
    expect(cls(T as unknown as Impl)).toEqual({ lines: ['math', 'math', 'math'], ink: 0 })
  })
  it('read a display’s line TeX set in text mode as text, through the rules of place, and a formula’s short text as the formula’s', () => {
    // (the coordinator's ruling of 2026-11-09: words TeX sets in text mode inside a display are text, translated as before —
    // 2610.22299v1's display (1), a sentence in \\text; 2608.25210v2 p10's labels under a brace — while a formula line that holds
    // a short \\text{if} stays the formula's. The marked compile states the text each \\hbox sets in a display's math (`dtext`)
    // and the math opened again in it (`dmath`), a glyph's mode its innermost region's)
    const pg = pageOf([
      { s: 'Body owned text', y: 700 },
      { s: 'any two adjacent vertices have exactly x common neighbors', x: 90, y: 600 },
      { s: 'f(x) = 1 if x > 0', x: 90, y: 560 },
    ], { points: [['bs1', 0], ['be1', 89]], regions: [
      { kind: 'display', from: 15, to: 15 + 57 },
      { kind: 'dtext', from: 15, to: 15 + 57 },
      { kind: 'display', from: 72, to: 72 + 17 },
      { kind: 'dtext', from: 72 + 9, to: 72 + 12 },
    ] })
    const own = { glyphs: [pg.glyphs.map((_, k) => (k < 15 ? 'u0' : null))], boxes: [[]] }
    const ledger = (T as unknown as Impl).ledgerOf([pg], own, { units: units.slice(0, 1) }) as { lines: { cls: string; gs: number[] }[] }
    expect(ledger.lines.map((l) => [l.cls, l.gs.length])).toEqual([['orphan', 57], ['math', 17]])
  })
  it('make each display no unit owns one kept block, whatever its lines’ baselines and extents, its number with it (the kept blocks’ one change)', () => {
    // (1706.03762v7 p4, display (1): "Attention(Q, K, V) = softmax(", the fraction's numerator and denominator, ")V" and its
    // number "(1)" — the ledger's lines, each on its own baseline. The block rule of a listing (each line below the block's
    // lowest and meeting it across) cut the display into three blocks, three hover pieces, and left its number in none. TeX
    // states the display (its region, from its start point to its last end) and sets its number right after its end)
    /** the copy's kept blocks of a page whose first `owned` glyphs and those from `from` on are a unit's: each its glyphs' text */
    const blocks = (pg: ReturnType<typeof pageOf>, owned: (g: number) => boolean) => {
      const own = { glyphs: [pg.glyphs.map((_, g) => (owned(g) ? 'u0' : null))], boxes: [[]] }
      const ledger = (T as unknown as Impl).ledgerOf([pg], own, { units: units.slice(0, 1) })
      const ink = (T as unknown as Impl).inkUnitsOf([pg], ledger, { units: units.slice(0, 1), from: 1 })
      ;(T as unknown as Impl).claimInk(own, ink, [pg])
      const kept = (T as unknown as Impl).keptUnitsOf([pg], ledger, (p, g) => own.glyphs[p - 1]?.[g] ?? null, { from: 1 + ink.length })
      return { ink: ink.length, kept: (kept as { glyphs: { text: [number, number][] } }[]).map((u) => u.glyphs.text.map(([, g]) => (pg.glyphs[g] as G).u).join('')) }
    }
    const one = pageOf([
      { s: 'Body owned text', y: 700 },
      { s: 'Attention(Q, K, V) = softmax(', x: 200, y: 311 },
      { s: 'QK', x: 346, y: 318 },
      { s: 'dk', x: 346, y: 304 },
      { s: ')V', x: 357, y: 311 },
      { s: '(1)', x: 480, y: 311 },
      { s: 'Body owned text again', y: 280 },
    ], { points: [['bs1', 0], ['be1', 74]], regions: [{ kind: 'display', from: 15, to: 50 }] })
    expect(blocks(one, (g) => g < 15 || g >= 53)).toEqual({ ink: 0, kept: ['Attention(Q, K, V) = softmax(QKdk)V(1)'] })
    // (two displays TeX set one under the other, nothing between: a block each, each with its number; by the listing's rule
    // they were one block, their numbers in none)
    const two = pageOf([
      { s: 'Body owned text', y: 700 },
      { s: 'x = a + b', x: 200, y: 650 },
      { s: '(2)', x: 480, y: 650 },
      { s: 'y = c + d', x: 200, y: 635 },
      { s: '(3)', x: 480, y: 635 },
    ], { points: [['bs1', 0], ['be1', 39]], regions: [{ kind: 'display', from: 15, to: 24 }, { kind: 'display', from: 27, to: 36 }] })
    expect(blocks(two, (g) => g < 15)).toEqual({ ink: 0, kept: ['x = a + b(2)', 'y = c + d(3)'] })
    // (a display's number TeX could not set on its last line, set on a line of its own under it: the first ink after its end)
    const under = pageOf([
      { s: 'Body owned text', y: 700 },
      { s: 'z = e + f + g', x: 200, y: 650 },
      { s: '(4)', x: 480, y: 635 },
      { s: 'Body owned text again', y: 600 },
    ], { points: [['bs1', 0], ['be1', 52]], regions: [{ kind: 'display', from: 15, to: 28 }] })
    expect(blocks(under, (g) => g < 15 || g >= 31)).toEqual({ ink: 0, kept: ['z = e + f + g(4)'] })
    // (a stop TeX set at the formula's end on its number's line, after a big delimiter on a baseline of its own: the line its
    // number, though its stop is the formula's, and not the next display's (2608.04322v1 p5's (9) and (10))
    const stop = pageOf([
      { s: 'Body owned text', y: 700 },
      { s: 'w = v', x: 200, y: 650 },
      { s: ')', x: 225, y: 640 },
      { s: '. (5)', x: 230, y: 650 },
      { s: 'u = t', x: 200, y: 630 },
      { s: '(6)', x: 480, y: 630 },
    ], { points: [['bs1', 0], ['be1', 34]], regions: [{ kind: 'display', from: 15, to: 22 }, { kind: 'display', from: 26, to: 31 }] })
    expect(blocks(stop, (g) => g < 15)).toEqual({ ink: 0, kept: ['w = v). (5)', 'u = t(6)'] })
    // (a display whose text TeX set in text mode a unit owns, translated, between its formula's parts: an \underbrace's label,
    // 2608.25210v2 p10 — the parts one block about it, the label its own unit)
    const braced = pageOf([
      { s: 'Body owned text', y: 700 },
      { s: 'a + b', x: 200, y: 650 },
      { s: 'one failure', x: 200, y: 640 },
      { s: '+ c', x: 230, y: 650 },
    ], { points: [['bs1', 0], ['be1', 34]], regions: [{ kind: 'display', from: 15, to: 34 }] })
    expect(blocks(braced, (g) => g < 15 || (g >= 20 && g < 31))).toEqual({ ink: 0, kept: ['a + b+ c'] })
    // (lines of no display keep the listing's rule: a code listing's lines one block, its brace in it)
    const listing = pageOf([
      { s: 'Body owned text', y: 700 },
      { s: 'def f(x):', x: 100, y: 650, font: 'ABCDEF+CMTT10' },
      { s: 'return x', x: 120, y: 638, font: 'ABCDEF+CMTT10' },
      { s: '}', x: 100, y: 626, font: 'ABCDEF+CMTT10' },
    ], { points: [['bs1', 0], ['be1', 33]] })
    expect(blocks(listing, (g) => g < 15)).toEqual({ ink: 0, kept: ['def f(x):return x}'] })
  })
  it('state the glyphs of the label they read out of a unit’s text, those glyphs its text’s still as today’s (the one addition)', () => {
    // (2610.22065v1 p1: an affiliation the class prints from its own lists, its raised "2" no text of the unit's (labelLength);
    // today's left its glyph among the unit's text glyphs alone, so locate, which states a label from the glyphs it is told,
    // stated none, and the mark was erased with the translated text)
    const pg = pageOf([
      { s: 'Body owned text', y: 700 },
      { s: '2', x: 72, y: 691.8, size: 6 },
      { s: 'Department of Physics', x: 76, y: 688 },
    ], { points: [['bs1', 0], ['be1', 37]] })
    type Made = {
      pieces: { t: string; s?: string }[]
      glyphs: { text: [number, number][]; label?: [number, number][]; runs?: [number, [number, number][]][] }
    }
    const one = (I: Impl) => {
      const own = { glyphs: [pg.glyphs.map((_, k) => (k < 15 ? 'u0' : null))], boxes: [[]] }
      const ledger = I.ledgerOf([pg], own, { units: units.slice(0, 1) })
      return I.inkUnitsOf([pg], ledger, { units: units.slice(0, 1), from: 1 }) as unknown as Made[]
    }
    const today = one(TODAY)
    const copy = one(T as unknown as Impl)
    // (the copy's other addition, each kept run's glyphs, `glyphs.runs`, set aside as in the first case)
    expect(copy.map(({ glyphs: { label: _, runs: _r, ...g }, ...u }) => ({ ...u, glyphs: g }))).toEqual(today)
    expect(today.map((u) => u.pieces.map((p) => p.s ?? '').join(''))).toEqual(['Department of Physics'])
    expect(today[0]!.glyphs.label).toBeUndefined()
    expect(copy[0]!.glyphs.label).toEqual([[1, 15]])
    expect(copy[0]!.glyphs.text).toContainEqual([1, 15])
  })
  it('read a glyph TeX set smaller than its line’s text and off its baseline a script, a kept run whatever its face, where today’s read one in a text face as the line’s text', () => {
    // (2610.30854v1 p1's names, an ink unit: `Lifan Jiang$^{1,2}$` under Times sets the marks' digits in the text face, 8.11 pt
    // and 3.98 over the names' 10.96 pt baseline, as Computer Modern sets a formula's digits in CMR7. Today's kept a run only in a
    // math or a typewriter face, so a mark was the unit's text, and its translation drew it flat at the names' size. A glyph set
    // smaller on the baseline (small capitals) or raised at the line's size is no script; a leading mark is the unit's label as
    // before, and a script after a formula's run is that formula's, as today's read C_n²)
    const pg = pageOf([
      { s: 'Journal of Tests', y: 760 },
      { s: 'Body owned text', y: 700 },
      { s: 'Lifan Jiang', x: 72, y: 688 },
      { s: '1,2', x: 127, y: 691.6, size: 7 },
      { s: ', Yibo Zhao and CO', x: 137.5, y: 688 },
      { s: '2', x: 227.5, y: 686, size: 7 },
      { s: ' in ', x: 231, y: 688 },
      { s: 'SMALL', x: 251, y: 688, size: 7 },
      { s: ' and ', x: 268.5, y: 688 },
      { s: 'up', x: 293.5, y: 690 },
      { s: ' here', x: 303.5, y: 688 },
      { s: '2', x: 72, y: 643.8, size: 6 },
      { s: 'Department of Physics', x: 75, y: 640 },
      { s: '3', x: 180, y: 643.8, size: 6 },
      { s: 'of strength ', x: 72, y: 600 },
      { s: 'C', x: 132, y: 600, font: 'ABCDEF+CMMI10' },
      { s: 'n', x: 137, y: 598, size: 7, font: 'ABCDEF+CMMI7' },
      { s: '2', x: 137, y: 603.6, size: 7, font: 'ABCDEF+CMR7' },
      { s: ' here', x: 140.5, y: 600 },
    ], { points: [['bs1', 16], ['be1', 128]] })
    type Made = {
      pieces: { t: string; s?: string; src?: string }[]
      glyphs: { text: [number, number][]; label?: [number, number][]; runs?: [number, [number, number][]][] }
    }
    const one = (I: Impl) => {
      const own = { glyphs: [pg.glyphs.map((_, k) => (k >= 16 && k < 31 ? 'u0' : null))], boxes: [[]] }
      const ledger = I.ledgerOf([pg], own, { units: units.slice(0, 1) })
      return (I.inkUnitsOf([pg], ledger, { units: units.slice(0, 1), from: 1 }) as unknown as Made[]).filter((u) => u.pieces.some((p) => p.t === 'text' && !/Journal/.test(p.s ?? '')))
    }
    const said = (u: Made) => u.pieces.map((p) => (p.t === 'text' ? p.s : p.t === 'ph' ? `<${p.src}>` : ''))
    const today = one(TODAY)
    const copy = one(T as unknown as Impl)
    expect(today.map(said)).toEqual([
      ['Lifan Jiang1,2, Yibo Zhao and CO2 in SMALL and up here'],
      ['Department of Physics3'],
      ['of strength ', '<$Cn2$>', ' here'],
    ])
    // (a run of scripts its source as TeX writes one, raised or lowered: read so by every reader of the source, as a source unit's
    // `$^{1,2}$`; a formula's run holding its scripts, C_n², its characters as before)
    expect(copy.map(said)).toEqual([
      ['Lifan Jiang', '<$^{1,2}$>', ', Yibo Zhao and CO', '<$_{2}$>', ' in SMALL and up here'],
      ['Department of Physics', '<$^{3}$>'],
      ['of strength ', '<$Cn2$>', ' here'],
    ])
    // (each mark its own kept run's glyphs, none of them the text's; the leading mark the label still, its glyph the text's)
    expect(copy[0]!.glyphs.runs).toEqual([[1, [[1, 42], [1, 43], [1, 44]]], [3, [[1, 63]]]])
    for (const g of [42, 43, 44, 63]) expect(copy[0]!.glyphs.text).not.toContainEqual([1, g])
    expect(copy[1]!.glyphs.label).toEqual([[1, 85]])
    expect(copy[1]!.glyphs.text).toContainEqual([1, 85])
    expect(copy[1]!.glyphs.runs).toEqual([[1, [[1, 107]]]])
  })
  it('read a unit’s label as its first line’s leading scripts raised over its baseline, whatever their face, and two scripts at a line’s break as two runs', () => {
    // (2610.40394v1 p1's note "*Equal contribution, †Corresponding authors.": its "*" 7.77 pt on the note's 7.97, raised 0.20 pt, a
    // script, which today's label rule (under 0.85 of the size, raised over 0.2 of it) did not read as the label; a mark in a math
    // face, CMSY's ∗, was a placeholder there. And 2610.20030v1 p1's "Matej Krajnc¹" ending a line and "¹Jožef Stefan Institute"
    // opening the next: TeX sets a script on its line after the atom it belongs to and breaks a formula only after a binary
    // operation or a relation, so the two marks are two runs, never one placeholder whose ink stands on two lines)
    const pg = pageOf([
      { s: 'Journal of Tests', y: 760 },
      { s: 'Body owned text', y: 700 },
      { s: '*', x: 72, y: 688.2, size: 9.75 },
      { s: 'Equal contribution, ', x: 76.875, y: 688 },
      { s: '†', x: 176.875, y: 691, size: 6, font: 'ABCDEF+CMSY6' },
      { s: 'Corresponding authors.', x: 179.875, y: 688 },
      { s: '∗', x: 72, y: 643.6, size: 7, font: 'ABCDEF+CMSY7' },
      { s: 'Corresponding author', x: 75.5, y: 640 },
      { s: 'Matej Krajnc', x: 72, y: 600 },
      { s: '1', x: 132, y: 603.6, size: 7, font: 'ABCDEF+CMR7' },
      { s: '1', x: 72, y: 591.6, size: 6, font: 'ABCDEF+CMR6' },
      { s: 'Jozef Stefan Institute', x: 75, y: 588 },
    ], { points: [['bs1', 16], ['be1', 132]] })
    type Made = { pieces: { t: string; s?: string; src?: string }[]; glyphs: { text: [number, number][]; label?: [number, number][] } }
    const one = (I: Impl) => {
      const own = { glyphs: [pg.glyphs.map((_, k) => (k >= 16 && k < 31 ? 'u0' : null))], boxes: [[]] }
      const ledger = I.ledgerOf([pg], own, { units: units.slice(0, 1) })
      return (I.inkUnitsOf([pg], ledger, { units: units.slice(0, 1), from: 1 }) as unknown as Made[]).filter((u) => u.pieces.some((p) => p.t === 'text' && !/Journal/.test(p.s ?? '')))
    }
    // (the pieces' sources in the front end's Latin-1 view of their UTF-8, read back as the adapter reads them)
    const said = (u: Made) => u.pieces.map((p) => (p.t === 'text' ? P.unicodeOf(p.s) : p.t === 'ph' ? `<${P.unicodeOf(p.src)}>` : ''))
    const today = one(TODAY)
    const copy = one(T as unknown as Impl)
    expect(today.map(said)).toEqual([
      ['*Equal contribution, ', '<$†$>', 'Corresponding authors.'],
      ['<$∗$>', 'Corresponding author'],
      ['Matej Krajnc1 1Jozef Stefan Institute'],
    ])
    expect(today.map((u) => u.glyphs.label)).toEqual([undefined, undefined, undefined])
    expect(copy.map(said)).toEqual([
      ['Equal contribution, ', '<$^{†}$>', 'Corresponding authors.'],
      ['Corresponding author'],
      ['Matej Krajnc', '<$^{1}$>', ' ', '<$^{1}$>', 'Jozef Stefan Institute'],
    ])
    // (a mark of one symbol read by the adapter as a raised symbol, drawn raised as a source unit's `$^{†}$` is; written `$†$`, it
    // was a symbol drawn on the baseline at the line's size)
    expect(classesOf([{ t: 'ph', src: copy[0]!.pieces[1]!.src! }])[0]![1].sym).toEqual(['†', true])
    expect(copy.map((u) => u.glyphs.label)).toEqual([[[1, 31]], [[1, 75]], undefined])
    // (a label's glyphs its text's, as before: claimed and kept where they stand with its line)
    expect(copy[1]!.glyphs.text).toContainEqual([1, 75])
  })
  it('keep an e-mail address in an ink unit a run of its own, as the front end keeps one in a source unit’s text (#28)', () => {
    // (2609.36054v2 p1's note "*Correspondence to: <address> and <address>. The views …", its addresses grey: today's said them as
    // text in colour groups the translator never saw, and they came back black. Kept, each is an element whose ink is the
    // original's; the stop after the second is the sentence's, as the front end reads an address in a source unit's text
    // (latex-front.mjs keepAddresses, its EMAIL_ADDRESS the copy's))
    const note = 'Correspondence to: alan.chan@example.org and bo.writer@example.ac. The views are ours.'
    const pg = pageOf([
      { s: 'Journal of Tests', y: 760 },
      { s: 'Body owned text', y: 700 },
      { s: note, y: 688 },
    ], { points: [['bs1', 16], ['be1', 31 + note.length]] })
    const one = (I: Impl) => {
      const own = { glyphs: [pg.glyphs.map((_, k) => (k >= 16 && k < 31 ? 'u0' : null))], boxes: [[]] }
      const ledger = I.ledgerOf([pg], own, { units: units.slice(0, 1) })
      return I.inkUnitsOf([pg], ledger, { units: units.slice(0, 1), from: 1 }).filter((u) => u.kind === 'inkorphan').map((u) => u.pieces)
    }
    expect(one(TODAY)).toEqual([[{ t: 'text', s: note }]])
    expect(one(T as unknown as Impl)).toEqual([[
      { t: 'text', s: 'Correspondence to: ' },
      { t: 'ph', src: '\\url{alan.chan@example.org}' },
      { t: 'text', s: ' and ' },
      { t: 'ph', src: '\\url{bo.writer@example.ac}' },
      { t: 'text', s: '. The views are ours.' },
    ]])
  })
  it('keep an identifier in an ink unit a run of its own, and a line of identifiers alone no unit, as the front end keeps one (2608.25210v2)', () => {
    // (a token of word characters joined by underscores set in a text face, `llm_equal_human`: today's sent its words, which came
    // back with its last part in Chinese. Kept, it is an element whose ink is the original's; a line of identifiers alone holds no text word, a
    // kept block. The word's characters around it, its stop, are the text's; camelCase and a lone underscore are words)
    const note = 'Ask llm_equal_human first, then `CallbackBase.host_label(result)`, conv5_x and _x and camelCase, e.g. this.'
    const pg = pageOf([
      { s: 'Journal of Tests', y: 760 },
      { s: 'Body owned text', y: 700 },
      { s: note, y: 688 },
      { s: 'response_equal_human x86_64', y: 640 },
    ], { points: [['bs1', 16], ['be1', 31 + note.length + 27]] })
    type Made = { kind: string; pieces: { t: string; s?: string; src?: string }[] }
    const one = (I: Impl) => {
      const own = { glyphs: [pg.glyphs.map((_, k) => (k >= 16 && k < 31 ? 'u0' : null))], boxes: [[]] }
      const ledger = I.ledgerOf([pg], own, { units: units.slice(0, 1) })
      return (I.inkUnitsOf([pg], ledger, { units: units.slice(0, 1), from: 1 }) as unknown as Made[]).filter((u) => u.kind !== 'inkheads')
    }
    const said = (u: Made) => u.pieces.map((p) => (p.t === 'text' ? p.s : p.t === 'ph' ? `<${p.src}>` : ''))
    expect(one(TODAY).map(said).join(' | ')).toContain('llm_equal_human')
    expect(one(T as unknown as Impl).map(said)).toEqual([
      ['Ask ', '<\\url{llm_equal_human}>', ' first, then `', '<\\url{CallbackBase.host_label(result)}>', '`, ', '<\\url{conv5_x}>', ' and _x and camelCase, e.g. this.'],
    ])
    // (the whole token, its edges' sentence punctuation aside, a bracket the token answers its own: lane literal-fixes, the
    // coordinator's of 2026-11-10)
    const ids = (s: string) => identifiersIn(s).map(([a, b]) => s.slice(a, b))
    expect(ids('`CallbackBase.host_label(result)` in')).toEqual(['CallbackBase.host_label(result)'])
    expect(ids('response_equal_human_example and response_equal_llm_example.')).toEqual(['response_equal_human_example', 'response_equal_llm_example'])
    expect(ids('(see conv5_x). [sentence_1], "x86_64", {root_question}')).toEqual(['conv5_x', '[sentence_1]', 'x86_64', '{root_question}'])
    expect(ids('e.g. camelCase __init__ _x x_ a _ b')).toEqual([])
  })
  it('keep a group of local parts before one domain one run, over its words, its faces and its line’s break, as the front end keeps one (2611.00342v1)', () => {
    // (a note "Contact: {…}@…" whose group is several words, and two lines that are addresses alone, a group broken after a
    // comma, its braces in the symbol font's math face as \{ \} set them in text: today's read the local parts as words, sent,
    // and they came back capitalised with full-width commas, 2611.00342v1 p1 under the names toggle. Kept, the group is one
    // element of the note, and the lines of addresses alone no unit, a kept block)
    const note = 'Contact: {alpha, beta-x, gamma}@example.org'
    const pg = pageOf([
      { s: 'Journal of Tests', y: 760 },
      { s: 'Body owned text', y: 700 },
      { s: note, y: 688 },
      { s: '{delta, eps,', y: 640 },
      { s: 'zeta}@example.net, eta@example.com', y: 628 },
    ], { points: [['bs1', 16], ['be1', 31 + note.length + 46]] })
    const brace = (u: string) => pg.glyphs.findIndex((g, k) => k >= 31 + note.length && g.u === u)
    for (const k of [brace('{'), brace('}')]) (pg.glyphs[k] as G).font = 'ABCDEF+CMSY10'
    type Made = { kind: string; pieces: { t: string; s?: string; src?: string }[] }
    const one = (I: Impl) => {
      const own = { glyphs: [pg.glyphs.map((_, k) => (k >= 16 && k < 31 ? 'u0' : null))], boxes: [[]] }
      const ledger = I.ledgerOf([pg], own, { units: units.slice(0, 1) })
      return (I.inkUnitsOf([pg], ledger, { units: units.slice(0, 1), from: 1 }) as unknown as Made[]).filter((u) => u.kind !== 'inkheads')
    }
    const said = (u: Made) => u.pieces.map((p) => (p.t === 'text' ? p.s : p.t === 'ph' ? `<${p.src}>` : ''))
    // (today's: every local part a word of the text)
    expect(one(TODAY).map(said).join(' | ')).toMatch(/alpha, beta-x, gamma.*delta, eps/)
    expect(one(T as unknown as Impl).map(said)).toEqual([['Contact: ', '<\\url{{alpha,beta-x,gamma}@example.org}>']])
  })
  it('mark a kept block of e-mail addresses alone so (`address`), which the lab reads; no other kept block', () => {
    // (the coordinator's ruling of 2026-11-10: the parity reads a unit the prepare keeps as a line of addresses as the original's
    // text, by the prepare's own mark; a listing or a page number kept is no such block)
    const pg = pageOf([
      { s: 'Journal of Tests', y: 760 },
      { s: 'Body owned text', y: 700 },
      { s: '{delta, eps,', y: 640 },
      { s: 'zeta}@example.net, eta@example.com', y: 628 },
      { s: 'int main() {', y: 500, font: 'ABCDEF+CMTT10' },
    ], { points: [['bs1', 16], ['be1', 31 + 46 + 12]] })
    const own = { glyphs: [pg.glyphs.map((_, k) => (k >= 16 && k < 31 ? 'u0' : null))], boxes: [[]] }
    const made = (I: Impl) => {
      const o = { glyphs: own.glyphs.map((r) => [...r]), boxes: [[]] }
      const ledger = I.ledgerOf([pg], o, { units: units.slice(0, 1) })
      const ink = I.inkUnitsOf([pg], ledger, { units: units.slice(0, 1), from: 1 })
      I.claimInk(o, ink, [pg])
      return (I.keptUnitsOf([pg], ledger, (p: number, g: number) => o.glyphs[p - 1]?.[g] ?? null, { from: 1 + ink.length }) as { address?: true; glyphs: { text: [number, number][] } }[]).map((u) => [
        u.glyphs.text.map(([, g]) => pg.glyphs[g]!.u).join(''),
        u.address ?? false,
      ])
    }
    expect(made(T as unknown as Impl)).toEqual([
      ['{delta, eps,zeta}@example.net, eta@example.com', true],
      ['int main() {', false],
    ])
  })
  it('join a line of no text word to the unit its line before belongs to in one of TeX’s paragraphs, and start no unit with one (2609.20976v1)', () => {
    // (JCAP's `E-mail: \the\email@toks`, one paragraph TeX broke before its last address: that line holds an address alone, a
    // kept run and no text word, and was a kept block of its own beside the unit of the line before it, which the author block
    // took; now the unit's next line. Where the compile marks another paragraph between (a `q<n>` point), it stays apart)
    const first = 'E-mail: alan.chan@example.org, bo.writer@example.ac,'
    const second = 'cy.third@example.in'
    const at = 31
    const pageWith = (paras: [string, number][]) =>
      pageOf([
        { s: 'Journal of Tests', y: 760 },
        { s: 'Body owned text', y: 700 },
        { s: first, y: 688 },
        { s: second, y: 676 },
      ], { points: [['bs1', 16], ['be1', at]], paras })
    const one = (pg: ReturnType<typeof pageWith>) => {
      const own = { glyphs: [pg.glyphs.map((_, k) => (k >= 16 && k < 31 ? 'u0' : null))], boxes: [[]] }
      const I = T as unknown as Impl
      const ledger = I.ledgerOf([pg], own, { units: units.slice(0, 1) })
      return I.inkUnitsOf([pg], ledger, { units: units.slice(0, 1), from: 1 }).filter((u) => u.kind === 'inknotes').map((u) => u.pieces)
    }
    const joined = one(pageWith([['q1', at]]))
    expect(joined).toHaveLength(1)
    expect(joined[0]!.at(-1)).toEqual({ t: 'ph', src: `\\url{${second}}` })
    expect(joined[0]!.filter((p) => p.t === 'ph')).toHaveLength(3)
    // (another paragraph begins at the address: the unit ends on the line before, the address no unit's)
    const apart = one(pageWith([['q1', at], ['q2', at + first.length]]))
    expect(apart).toHaveLength(1)
    expect(apart[0]!.filter((p) => p.t === 'ph')).toHaveLength(2)
    // (no paragraph marked: by the lines' places alone it joins nothing)
    expect(one(pageWith([]))[0]!.filter((p) => p.t === 'ph')).toHaveLength(2)
  })
  it('write each TeX special of an ink unit’s math run by the command that sets it in a formula, where today’s strips it: a brace alone no display', () => {
    // (2610.21377v1 p42's `$J_0\in\{0,\dots,J-1\}$`, its closing brace a run of its own between the upright digits, and 2608.06007v1
    // p17's bibliography titles `$\{$Intra-Operator$\}$`: the glyph `{` in the symbol font's math face. Today's strips `$ \ { }`
    // from a run's characters and wrote `$$`, which every reader takes as a display; drawn in its own ink, each was a kept display
    // row in the middle of its line)
    const line = 'An orphan with {x} and {Intra} then A\\B or $ here'
    const pg = pageOf([
      { s: 'Journal of Tests', y: 760 },
      { s: 'Body owned text', y: 700 },
      { s: line, y: 688 },
    ], { points: [['bs1', 16], ['be1', 31 + line.length]] })
    const g = pg.glyphs as G[]
    for (let k = 31; k < 31 + line.length; k++) {
      const u = g[k]!.u as string
      const inMath = /[{}\\$]/.test(u) || ((u === 'x' || u === 'A' || u === 'B') && /[{}\\]/.test(`${g[k - 1]!.u}${g[k + 1]!.u}`))
      if (inMath) g[k]!.font = /[{}\\$]/.test(u) ? 'ABCDEF+CMSY10' : 'ABCDEF+CMMI10'
    }
    const srcs = (I: Impl) => {
      const own = { glyphs: [pg.glyphs.map((_, k) => (k >= 16 && k < 31 ? 'u0' : null))], boxes: [[]] }
      const ledger = I.ledgerOf([pg], own, { units: units.slice(0, 1) })
      return I.inkUnitsOf([pg], ledger, { units: units.slice(0, 1), from: 1 }).filter((u) => u.kind === 'inkorphan').flatMap((u) => u.pieces.filter((p) => p.t === 'ph').map((p) => p.src!))
    }
    expect(srcs(TODAY)).toEqual(['$x$', '$$', '$$', '$AB$', '$$'])
    const copy = srcs(T as unknown as Impl)
    expect(copy).toEqual(['$\\{x\\}$', '$\\{$', '$\\}$', '$A\\backslash B$', '$\\$$'])
    // (and every reader of the source reads each an inline formula: the copy's classOf, the element's kind on the translators'
    // wire; the adapter's classesOf, today's reader's class, the part's El.kind the typesetter draws by; today's wire's display)
    for (const src of copy) {
      expect(T.statedClassOf({ t: 'ph', src })).toBe('math')
      expect(classesOf([{ t: 'ph', src }])[0]![1].cls).not.toBe('display')
      expect(DISPLAY.test(src)).toBe(false)
    }
    expect(classesOf(copy.map((src) => ({ t: 'ph', src }))).map(([, c]) => [c.cls, c.copy])).toEqual([
      ['other', '{x}'],
      ['symbol', '{'],
      ['symbol', '}'],
      // (its copy text as today's tables read it: they know no `\backslash`, so the backslash is not in it, as it was not in the stripped source)
      ['other', expect.any(String)],
      ['symbol', '$'],
    ])
  })
  it('set every line of a justified paragraph inside a figure from its start, where today’s set an indented one from its end (a change)', () => {
    // (2411.13093v4 p18: a prompt in an included figure, a justified paragraph whose entries' first lines are indented by hand.
    // The indented line shares the paragraph's end and not its start; today's took the end column, the most runs', as its
    // edge, and its translation was laid flush against the box's right edge)
    const pg = pageOf([
      { s: 'Body owned text', y: 700 },
      { s: 'The entry of the box indented here', x: 92, y: 640, form: true, fid: 1 },
      { s: 'and its lines go on to the measure end', x: 72, y: 628, form: true, fid: 1 },
      { s: 'set in one block of its prose', x: 72, y: 616, form: true, fid: 1, space: 12.5 },
      { s: 'its last one', x: 72, y: 604, form: true, fid: 1 },
    ])
    const anchors = (I: Impl) => {
      const own = { glyphs: [pg.glyphs.map((_, k) => (k < 15 ? 'u0' : null))], boxes: [[]] }
      return (I.figureUnitsOf([pg], own).units as unknown as { text: string; anchor: string }[]).map((u) => [u.text, u.anchor])
    }
    expect(anchors(TODAY)[0]).toEqual(['The entry of the box indented here', 'end'])
    expect(anchors(T as unknown as Impl)).toEqual([
      ['The entry of the box indented here', 'start'],
      ['and its lines go on to the measure end', 'start'],
      ['set in one block of its prose', 'start'],
      ['its last one', 'start'],
    ])
  })
  it('read a placeholder an ink unit makes as today’s classOf does', () => {
    for (const src of ['$$', '$x$', '$a+b$', '\\url{https://a.b/c}', '\\url{}']) expect(T.statedClassOf({ t: 'ph', src })).toBe(classOf({ t: 'ph', src }))
    expect(T.statedClassOf({ t: 'ph', src: '$x$', kind: 'other' })).toBe(null)
    expect(T.statedClassOf({ t: 'nested' })).toBe(classOf({ t: 'nested' }))
    // (a tie and a forced break, which the adapter states `space` and `break` since lane fig-cut, are none of today's classes)
    expect(T.statedClassOf({ t: 'ph', src: '~', kind: 'space' })).toBe(classOf({ t: 'ph', src: '~' }))
    expect(T.statedClassOf({ t: 'ph', src: '\\\\', kind: 'break' })).toBe(classOf({ t: 'ph', src: '\\\\' }))
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
    // (a colour group: the port states the fill its open names, as the adapter states a source unit's from TeX's log; today's
    // adapter, given no log for an ink unit, stated none)
    const coloured = [{ t: 'text', s: 'Mail ' }, { t: 'open', id: 1, src: '\\textcolor[HTML]{7A7F80}{' }, { t: 'text', s: 'a@b.org' }, { t: 'close', id: 1, src: '}' }]
    expect(P.spansOf(coloured)).toEqual(spansOf(coloured, new Map([[1, 0x7a7f80]])))
    expect(spansOf(coloured)).toEqual([['1', { cmd: 'textcolor' }]])
    for (const s of ['plain', P.latin1View('Física'), 'wide \u4e2d', 3]) expect(P.unicodeOf(s)).toBe(unicodeOf(s))
  })
})
