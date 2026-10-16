import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { beforeAll, describe, expect, it } from 'vitest'
import { PH_FLAG } from '@/pdf-reader/engine/layout/file.mjs'
import { BUILTIN_RULES, resolveRules } from '@/pdf-reader/engine/rules/layout.mjs'

// The layer's hybrid (layer-proto/tex.mjs): v0's per-unit reading with its parts from the layout file wherever the file
// locates the unit whole; and v0's fallback fixes of step 2 (layer2.mjs). The drawing is measured by the layer gate
// (--engine-kind=proto --proto-tex); these are the parts' rules, on made-up pages.

type L2 = typeof import('@/pdf-reader/engine/layer-proto/layer2.mjs')
type Tex = typeof import('@/pdf-reader/engine/layer-proto/tex.mjs')
let L2: L2
let T: Tex
beforeAll(async () => {
  // layer2.mjs measures with a canvas made when it loads; the test environment's draws nothing (its context is null), and
  // these rules measure nothing but a laid line's ink (lineExtent: 0.7 of the size over its baseline, 0.2 under)
  const g = globalThis as { OffscreenCanvas?: unknown }
  g.OffscreenCanvas = class { getContext() { return { font: '', measureText: (s: string) => ({ width: 50 * s.length, actualBoundingBoxAscent: 70, actualBoundingBoxDescent: 20 }) } } }
  L2 = await import('@/pdf-reader/engine/layer-proto/layer2.mjs')
  T = await import('@/pdf-reader/engine/layer-proto/tex.mjs')
})

const serif = { fam: 'serif', bold: false, italic: false, caps: false, known: false } as never
const math = { fam: 'math', bold: false, italic: true, caps: false, known: false } as never
/** a text item's characters, each half its size wide, from x on baseline yb */
const item = (text: string, x: number, yb: number, size: number, n: number, st = serif) => [...text].map((ch, k) => ({ ch, x0: x + 0.5 * size * k, x1: x + 0.5 * size * (k + 1), yb, size, item: n, ix: x, k, st }))
/** a unit in the layout file as indexLayout reads it: lines (page, x0, x1, baseline, top, bottom, size, font), one frame
 *  a page, its placeholders by k */
const unitOf = (lines: number[][], ph: [number, number, number[]][] = [], labels: number[] = []) => {
  const frames: number[] = []
  lines.forEach((l, j) => { const page = l[0] ?? 0; if (!j || page !== lines[j - 1]?.[0]) frames.push(page, 0, j, 0, -1, 0); frames[frames.length - 3] = (frames[frames.length - 3] ?? 0) + 1 })
  return { lines: Float64Array.from(lines.flat()), frames: Float64Array.from(frames), erase: lines.map(() => new Float64Array(0)), ph: new Map(ph.map(([k, flags, segs]) => [k, { kind: 'math', flags, segs: Float64Array.from(segs) }])), labels: Float64Array.from(labels) } as never
}

describe("the hybrid's test: whether the layout file locates a unit whole", () => {
  const unit = { kind: 'para', src: 'a b', pieces: [{ t: 'text', s: 'x ' }, { t: 'ph', src: '$x$' }, { t: 'ph', src: '\\vspace{1em}' }, { t: 'ph', src: '\\%' }] } as never
  const tr = [[0, 'x '], [1, 1], [1, 2], [1, 3]]
  const line = [1, 10, 100, 100, 107, 98, 10, 0]
  it('maps each translated piece to its source index by the units file, and refuses pieces that are not the same', () => {
    expect(T.kOfPieces(unit, tr)).toEqual([-1, 1, 2, 3])
    expect(T.kOfPieces(unit, tr.slice(1))).toBeNull()
    expect(T.kOfPieces(unit, [[1, 0], ...tr.slice(1)])).toBeNull()
  })
  it('passes a unit whose drawn placeholders are all found, its lines in any order (a display\'s rows the file lists late)', () => {
    const w = T.locatedWhole(unitOf([line], [[1, 0, [1, 20, 100, 25, 107, 98]], [2, 32, []], [3, 0, [1, 40, 100, 45, 107, 98]]]), unit, tr)
    expect(w).toEqual({ ok: true, why: null, kOf: [-1, 1, 2, 3] })
  })
  it('fails a unit the file does not hold, a drawn placeholder LOST, EMPTY or with no row', () => {
    const found = [1, 0, [1, 20, 100, 25, 107, 98]] as [number, number, number[]], sym = [3, 0, [1, 40, 100, 45, 107, 98]] as [number, number, number[]]
    expect(T.locatedWhole(null, unit, tr).why).toBe('unlocated')
    expect(T.locatedWhole(unitOf([line, [1, 10, 100, 110, 117, 108, 10, 0]], [found, sym]), unit, tr).ok).toBe(true)
    expect(T.locatedWhole(unitOf([line], [[1, 32, []], sym]), unit, tr).why).toBe('lost')
    expect(T.locatedWhole(unitOf([line], [[1, 16, []], sym]), unit, tr).why).toBe('empty')
    expect(T.locatedWhole(unitOf([line], [sym]), unit, tr).why).toBe('no row')
    // (a symbol with no row is not asked for: drawn as text, its glyph erased with its line)
    expect(T.locatedWhole(unitOf([line], [found]), unit, tr).ok).toBe(true)
  })
  it('asks a symbol drawn from its source as text to be found only when strict', () => {
    const u = unitOf([line], [[1, 0, [1, 20, 100, 25, 107, 98]], [3, 32, []]])
    expect(T.locatedWhole(u, unit, tr).ok).toBe(true)
    expect(T.locatedWhole(u, unit, tr, { symbols: 'strict' }).why).toBe('lost')
  })
})

describe('a displayed formula the held lines cover (D4 step 1)', () => {
  // a unit of text, a display, text: lines 0 and 1 its text, 2 and 3 the display's rows (held: no source word), 4 text
  const L = (y: number) => [1, 10, 200, y, y + 7, y - 2, 10, 0]
  const lines = [L(500), L(488), L(470), L(458), L(440)]
  const held = (lu: object, h: number[]) => ({ ...lu, held: h }) as never
  const display = '\\begin{equation}x=1\\end{equation}'
  const unit = (...p: object[]) => ({ kind: 'para', src: 'a b c', pieces: p }) as never
  const text = (s: string) => ({ t: 'text', s }), ph = (src: string) => ({ t: 'ph', src })
  const tr = [[0, 'a'], [1, 1], [0, 'c']]
  it('pairs each inner display group with a held run in order, and covers a LOST one with it', () => {
    const lu = held(unitOf(lines, [[1, 32, []]]), [2, 3])
    const u = unit(text('a b '), ph(display), text(' c'))
    expect([...T.displayCover(lu, u, [-1, 1, -1])]).toEqual([[1, [2, 3]]])
    expect(T.locatedWhole(lu, u, tr, { held: true }).ok).toBe(true)
    // (without the file's lines, as the hybrid's 'ph' reads a unit, nothing is held: LOST as before)
    expect(T.locatedWhole(lu, u, tr).why).toBe('lost')
  })
  it('covers no display at an edge of the unit, nor where runs and groups do not pair or a found display is off its run', () => {
    const tr2 = [[0, 'a'], [1, 1], [0, 'c'], [1, 3]]
    // a LOST display after the unit's last words: no text line after it
    expect(T.locatedWhole(held(unitOf(lines, [[1, 0, [1, 50, 470, 80, 477, 456]], [3, 32, []]]), [2, 3]), unit(text('a '), ph(display), text(' c '), ph(display)), tr2, { held: true }).why).toBe('lost')
    // two runs for one display (or a held line that is no display's)
    const two = held(unitOf(lines, [[1, 32, []]]), [1, 3])
    expect(T.displayCover(two, unit(text('a '), ph(display), text(' c')), [-1, 1, -1]).size).toBe(0)
    // a found display beside the LOST one, its segments on no held line: the pairing is not the file's
    const pieces = [text('a '), ph(display), text(' b '), ph(display), text(' c')], kOf = [-1, 1, -1, 3, -1]
    const off = held(unitOf([L(500), L(488), L(470), L(458), L(440), L(428)], [[1, 0, [1, 50, 500, 80, 507, 498]], [3, 32, []]]), [2, 4])
    expect(T.displayCover(off, unit(...pieces), kOf).size).toBe(0)
    const on = held(unitOf([L(500), L(488), L(470), L(458), L(440), L(428)], [[1, 0, [1, 50, 470, 80, 477, 468]], [3, 32, []]]), [2, 4])
    expect([...T.displayCover(on, unit(...pieces), kOf)]).toEqual([[1, [2]], [3, [4]]])
  })
  // a unit of text, a LOST display, the source's "with", a found display, text, and a found display after its last line
  // (2307.16209 page 59, unit 198): lines 0 and 1 text, 2 the first display's row (held), 3 "with", 4 the second's row
  // (held), 5 text; the third display at 400, on no line of the unit
  const p59 = () => held(unitOf([L(500), L(488), L(470), L(458), L(440), L(428)], [[1, 32, []], [3, 0, [1, 50, 440, 80, 447, 438]], [5, 0, [1, 50, 400, 80, 407, 398]]]), [2, 4])
  const kOf6 = [-1, 1, -1, 3, -1, 5]
  it("groups the displays by TeX's file in the source's order, not by the translation's pieces (2307.16209 page 59)", () => {
    // the translation sets nothing between the first two displays, where the source has "with": read from its pieces they
    // were one group, paired with the first run and refuted by the second display's segments, and the unit fell to v0
    const u = unit(text('x '), ph(display), text(' '), ph(display), text(' y '), ph(display))
    const tr6 = [[0, 'x '], [1, 1], [0, ' '], [1, 3], [0, ' y '], [1, 5]]
    expect([...T.displayCover(p59(), u, kOf6)]).toEqual([[1, [2]], [3, [4]]])
    expect(T.locatedWhole(p59(), u, tr6, { held: true }).ok).toBe(true)
    // (whatever the translation sets around them: its words moved after the last display, or the displays in another order)
    const moved = unit(text('x '), ph(display), ph(display), ph(display), text(' y'))
    expect([...T.displayCover(p59(), moved, [-1, 1, 3, 5, -1])]).toEqual([[1, [2]], [2, [4]]])
    const swapped = unit(text('x '), ph(display), text(' y '), ph(display), ph(display))
    expect(new Map(T.displayCover(p59(), swapped, [-1, 3, -1, 1, 5]))).toEqual(new Map([[3, [2]], [1, [4]]]))
    // (a LOST display the file says lies after the unit's last line takes no run, left as the original's ink: OUTSIDE)
    const outside = held(unitOf([L(500), L(488), L(470), L(458)], [[1, 32, []], [3, PH_FLAG.LOST | PH_FLAG.OUTSIDE, []]]), [2])
    expect([...T.displayCover(outside, unit(text('x '), ph(display), text(' y '), ph(display), text(' z')), [-1, 1, -1, 3, -1])]).toEqual([[1, [2]]])
    // (a display the file holds no row for: nothing)
    expect(T.displayCover(p59(), u, [-1, 1, -1, 7, -1, 5]).size).toBe(0)
  })
  it("draws page 59's text in its blocks: before the first display, none on the line between, the rest after the second", () => {
    const u = { kind: 'para', src: 'a b c with d', pieces: [text('p '), ph(display), text(' '), ph(display), text(' q '), ph(display)] } as never
    const lu = p59()
    const t = T.texRects(lu)
    const page = [...item('a b', 10, 500, 10, 0), ...item('c', 10, 488, 10, 1), ...item('x=1', 60, 470, 10, 2, math), ...item('with', 10, 458, 10, 3), ...item('y=2', 60, 440, 10, 4, math), ...item('d', 10, 428, 10, 5), ...item('z=3', 60, 400, 10, 6, math)]
    const prep = L2.prepareUnit(u, t.rects as never, [page as never], new Map() as never, null, T.texParts(lu, kOf6, { use: 'lines', lines: t }) as never)
    expect(prep.unproven).toBeUndefined()
    const r1 = prep.get(1), r3 = prep.get(3)
    expect([r1?.mode, r3?.mode]).toEqual(['kept', 'kept'])
    const blocks = L2.blocks2(t.rects as never, [[0, 0, 612, 792]], new Set(prep.keep), prep.lineInfo, prep.regionOf, prep.referenced)
    expect(blocks.map(b => [b.B, b.after])).toEqual([[[500, 488], 0], [[458], 1], [[428], 2]])
    const word = (n: number) => ({ s: 'x'.repeat(n), cls: 'latin', w100: 50 * n, st: {} })
    const P = { ...resolveRules(BUILTIN_RULES, 'de').params, borrow: 0 }
    const l = L2.layoutUnit2([word(30), { blockTo: r1?.region, w100: 0 }, { blockTo: r3?.region, w100: 0 }, word(30)] as never, blocks as never, 10, P as never)
    expect(l.lines.map(x => [x.baseline, x.items.filter(it => it.t.s).length])).toEqual([[500, 1], [428, 1]])
  })
  it('places a leading LOST display on the run before the first found one, and none where no run is left before it', () => {
    // lines 0 text, 1 the first display's row (held), 2 text, 3 the second's (held, found), 4 text
    const lead = held(unitOf([L(500), L(488), L(470), L(458), L(440)], [[1, 32, []], [3, 0, [1, 50, 458, 80, 465, 456]]]), [1, 3])
    const u = unit(text('a '), ph(display), text(' b '), ph(display), text(' c'))
    expect([...T.displayCover(lead, u, [-1, 1, -1, 3, -1])]).toEqual([[1, [1]], [3, [3]]])
    // a display that opens the unit, its rows before its first line (no line of it): LOST, no run before the found one's
    const head = held(unitOf([L(500), L(488), L(470), L(458)], [[0, 32, []], [2, 0, [1, 50, 470, 80, 477, 468]]]), [2])
    const opens = unit(ph(display), text(' a b '), ph(display), text(' c'))
    expect(T.displayCover(head, opens, [0, -1, 2, -1]).size).toBe(0)
    expect(T.locatedWhole(head, opens, [[1, 0], [0, ' a b '], [1, 2], [0, ' c']], { held: true }).why).toBe('lost')
    // (which the maker writes OUTSIDE where it stands before the unit's start mark: then off the lines, the other its run's)
    const flagged = held(unitOf([L(500), L(488), L(470), L(458)], [[0, PH_FLAG.LOST | PH_FLAG.OUTSIDE, []], [2, 0, [1, 50, 470, 80, 477, 468]]]), [2])
    expect([...T.displayCover(flagged, opens, [0, -1, 2, -1])]).toEqual([[2, [2]]])
  })
  it("refuses a found display over two runs, and counts no run of an inline placeholder's rows (a fraction's line)", () => {
    const u = unit(text('a '), ph(display), text(' b '), ph(display), text(' c'))
    const kOf = [-1, 1, -1, 3, -1]
    const twoRuns = held(unitOf([L(500), L(488), L(470), L(458), L(440), L(428)], [[1, 0, [1, 50, 470, 80, 477, 468, 1, 50, 440, 80, 447, 438]], [3, 32, []]]), [2, 4])
    expect(T.displayCover(twoRuns, u, kOf).size).toBe(0)
    // line 1 the numerator of an inline fraction on line 0, held (no source word); lines 3 the LOST display's row
    const frac = held(unitOf([L(500), L(488), L(470), L(458), L(446)], [[1, 0, [1, 60, 500, 80, 510, 485]], [3, 32, []]]), [1, 3])
    const withFrac = unit(text('a '), ph('$\\frac{x}{y}$'), text(' b '), ph(display), text(' c'))
    expect([...T.displayCover(frac, withFrac, kOf)]).toEqual([[3, [3]]])
    expect(T.locatedWhole(frac, withFrac, [[0, 'a '], [1, 1], [0, ' b '], [1, 3], [0, ' c']], { held: true }).ok).toBe(true)
  })
  it('places a LOST display between the found ones by the order, a found one off the unit\'s lines taking no run', () => {
    // a found display at a column's foot, on no line of the unit (2307.16209 unit 162), then the LOST one between text lines
    const foot = held(unitOf([L(500), L(488), L(470), L(458)], [[1, 0, [1, 50, 60, 80, 70, 50]], [3, 32, []]]), [2])
    expect([...T.displayCover(foot, unit(text('a '), ph(display), text(' b '), ph(display), text(' c')), [-1, 1, -1, 3, -1])]).toEqual([[3, [2]]])
    // the found groups not in the runs' order, or a run no group takes: nothing
    const order = held(unitOf([L(500), L(488), L(470), L(458), L(440), L(428)], [[1, 0, [1, 50, 440, 80, 447, 438]], [3, 0, [1, 50, 470, 80, 477, 468]]]), [2, 4])
    expect(T.displayCover(order, unit(text('a '), ph(display), text(' b '), ph(display), text(' c')), [-1, 1, -1, 3, -1]).size).toBe(0)
    expect(T.displayCover(p59(), unit(text('a '), ph(display), text(' b'), ph(display), text(' c ')), [-1, 3, -1, 5, -1]).size).toBe(0)
  })
  it('takes two LOST displays with source text between as one group or two by the runs, and neither where those say neither', () => {
    // the source's pieces k0 to k4 (text, display, text, display, text): the text between the displays is the source's,
    // which the file does not hold: white space (one group, one run) or a line of TeX's (two groups, a text line between
    // two runs)
    const u = unit(text('a '), ph(display), text(' b '), ph(display), text(' c'))
    const kOf = [-1, 1, -1, 3, -1]
    const one = held(unitOf([L(500), L(488), L(470), L(458), L(440)], [[1, 32, []], [3, 32, []]]), [2, 3])
    expect([...T.displayCover(one, u, kOf)]).toEqual([[1, [2, 3]], [3, [2, 3]]])
    const two = held(unitOf([L(500), L(488), L(470), L(458), L(440), L(428)], [[1, 32, []], [3, 32, []]]), [2, 4])
    expect([...T.displayCover(two, u, kOf)]).toEqual([[1, [2]], [3, [4]]])
    // (two displays next in the source, no piece between them, are one group whatever the runs)
    const next = (h: number[]) => held(unitOf([L(500), L(488), L(470), L(458), L(440), L(428)], [[1, 32, []], [2, 32, []]]), h)
    const adjacent = unit(text('a '), ph(display), ph(display), text(' c'))
    expect([...T.displayCover(next([2, 3]), adjacent, [-1, 1, 2, -1])]).toEqual([[1, [2, 3]], [2, [2, 3]]])
    expect(T.displayCover(next([2, 4]), adjacent, [-1, 1, 2, -1]).size).toBe(0)
    // three, two runs: which two share one the count does not say
    const three = held(unitOf([L(500), L(488), L(470), L(458), L(440), L(428)], [[1, 32, []], [3, 32, []], [5, 32, []]]), [2, 4])
    expect(T.displayCover(three, unit(text('a '), ph(display), text(' '), ph(display), text(' '), ph(display), text(' c')), [-1, 1, -1, 3, -1, 5, -1]).size).toBe(0)
  })
  it("reads it as kept, a break: the text before it on the lines above it, the text after below, none on its rows", () => {
    const lu = held(unitOf(lines, [[1, 32, []]]), [2, 3])
    const u = { kind: 'para', src: 'a b c d', pieces: [text('\u7532 '), ph(display), text(' \u4E59')] } as never
    const t = T.texRects(lu)
    const page = [...item('a b', 10, 500, 10, 0), ...item('c', 10, 488, 10, 1), ...item('x=1', 60, 470, 10, 2, math), ...item('(1)', 180, 458, 10, 3), ...item('d', 10, 440, 10, 4)]
    const prep = L2.prepareUnit(u, t.rects as never, [page as never], new Map() as never, null, T.texParts(lu, [-1, 1, -1], { use: 'lines', lines: t }) as never)
    const r = prep.get(1)
    expect(r?.mode).toBe('kept')
    expect(prep.referenced.has(r?.region as number)).toBe(true)
    const blocks = L2.blocks2(t.rects as never, [[0, 0, 612, 792]], new Set(prep.keep), prep.lineInfo, prep.regionOf, prep.referenced)
    expect(blocks.map(b => [b.B, b.after])).toEqual([[[500, 488], 0], [[440], 1]])
    // (the held display's rows are lines of the file between them: two flows, TeX's rule does not run across it)
    expect(blocks.map(b => b.flow)).toEqual([0, 1])
    const word = (n: number) => ({ s: 'x'.repeat(n), cls: 'latin', w100: 50 * n, st: {} })
    const P = { ...resolveRules(BUILTIN_RULES, 'de').params, borrow: 0 }
    const l = L2.layoutUnit2([word(30), { space: true, w100: 25 }, word(30), { blockTo: r?.region, w100: 0 }, word(30)] as never, blocks as never, 10, P as never)
    expect(l.clipped).toBe(false)
    expect(l.lines.map(x => [x.baseline, x.items.filter(it => it.t.s).length])).toEqual([[500, 1], [488, 1], [440, 1]])
    // (refused whole where the text before it does not fit above it, as a unit is: never run on past it in order)
    expect(L2.layoutUnit2([word(30), { space: true, w100: 25 }, word(30), { space: true, w100: 25 }, word(30), { blockTo: r?.region, w100: 0 }, word(30)] as never, blocks as never, 10, { ...P, floor: 1, order: [] } as never).clipped).toBe(true)
  })
})

describe("the file's lines as v0's rectangles", () => {
  it('each across its ink, in an anchors band from its exact baseline, up to the pages shown', () => {
    const { rects, exact, lineOf } = T.texRects(unitOf([[1, 10, 200, 100, 109.5, 89, 10, 0], [1, 10, 150, 88, 95, 85, 10, 0], [2, 10, 200, 700, 707, 697, 10, 0]]), 1)
    expect(rects).toEqual([[1, 10, 97.85, 200, 106.83], [1, 10, 85.85, 150, 94.83]])
    const second = rects[1] as (typeof rects)[number]
    expect(exact.get(second)).toEqual({ baseline: 88, size: 10, top: 95, bottom: 85 })
    expect(lineOf.get(second)).toBe(1)
  })
  it("owns the page's characters by their baselines, scripts and all, within the line's ink", () => {
    const rects = [[1, 10, 97.85, 40, 106.83], [1, 10, 85.85, 40, 94.83]] as never as number[][]
    const exact = new Map([[rects[0], { baseline: 100, size: 10 }], [rects[1], { baseline: 88, size: 10 }]])
    const page = [...item('ab', 10, 100, 10, 0), ...item('2', 20, 103.6, 7, 1), ...item('cd', 10, 88, 10, 2), ...item('z', 60, 100, 10, 3)]
    const uc = L2.charsOfUnit2(rects as never, [page as never], new Map(), exact as never)
    const on = (r: number) => uc.filter(c => !c.sep && !c.space && (c as { rect: number[] }).rect[1] === rects[r]?.[2]).map(c => c.ch).join('')
    expect(on(0)).toBe('ab2')
    expect(on(1)).toBe('cd')
  })
})

describe("a placeholder's rendering by its segments", () => {
  const uc = (): never => {
    // the line above holds a space over the formula's last glyphs; the formula's big operator stands on that line in v0's
    // reading (its origin above its glyph)
    const above = item('q x', 30, 112, 10, 0).map(c => ({ ...c, page: 1, rect: [10, 109.85, 60, 118.83] }))
    const sum = { ...item('P', 20, 106.5, 10, 1, math)[0], page: 1, rect: [10, 109.85, 60, 118.83] }
    const sep = { ch: ' ', page: 1, x0: 60, x1: 60, yb: 109.85, size: 0, rect: [10, 109.85, 60, 118.83], sep: true }
    const f = item('q=k', 25, 100, 10, 2, math).map(c => ({ ...c, page: 1, rect: [10, 97.85, 60, 106.83] }))
    const after = item(' and', 40, 100, 10, 3).map(c => ({ ...c, page: 1, rect: [10, 97.85, 60, 106.83] }))
    return [...above.slice(0, 1), sum, ...above.slice(1), sep, ...f, ...after] as never
  }
  it("takes the unit's characters inside them on their line, and the breaks between them, never the line above's spaces", () => {
    const g = T.renderingOf(Float64Array.from([1, 19.5, 100, 40.5, 108, 97]), uc(), false)
    expect(g?.chars.map(c => c.ch).join('')).toBe('Pq=k')
    expect(g?.box).toEqual({ x0: 19.5, x1: 40.5, top: 108, bottom: 97, baseline: 100, lines: 1 })
  })
  it('a display anywhere in its rows; none found is none, but for a display, whose rows the unit may not hold', () => {
    expect(T.renderingOf(Float64Array.from([1, 70, 100, 80, 108, 97]), uc(), false)).toBeNull()
    expect(T.renderingOf(Float64Array.from([1, 70, 100, 80, 108, 97]), uc(), true)?.chars).toEqual([])
  })
})

describe("v0's reading with the file's renderings", () => {
  // "Each value ² is squared here": a superscript alone, raised 3.6 pt over the line's baseline
  const page = [...item('Each value', 10, 100, 10, 0), ...item('2', 62, 103.6, 7, 1), ...item('is squared here', 70, 100, 10, 2)]
  const unit = { kind: 'para', src: 'Each value is squared here', pieces: [{ t: 'text', s: '\u6BCF\u4E2A\u503C ' }, { t: 'ph', src: '$^{2}$' }, { t: 'text', s: ' \u5E73\u65B9' }] } as never
  const rect = [1, 10, 97.85, 145, 106.83]
  it("crops a formula across its ink and on its line's baseline, so that its raise is kept, and within its glyphs' boxes", () => {
    const lu = unitOf([[1, 10, 145, 100, 108, 97, 10, 0]], [[1, 0, [1, 61.8, 100, 65.6, 107.5, 101]]])
    const parts = T.texParts(lu, [-1, 1, -1], { use: 'ph' })
    const tex = L2.prepareUnit(unit, [rect.slice()] as never, [page as never], new Map() as never, null, parts as never).get(1)
    expect(tex?.mode).toBe('crop')
    expect(tex?.baseline).toBe(100)
    expect(tex?.crop?.[0]).toBeCloseTo(61.4)
    expect(tex?.crop?.[3]).toBeCloseTo(107.8)
    // v0's own (step 3): on its line's measured baseline too, a crop all script having no glyph of the line's size; by its
    // characters' own baseline, as before, the superscript was set on the line's and lost its raise
    const v0 = L2.prepareUnit(unit, [rect.slice()] as never, [page as never], new Map() as never).get(1)
    expect(v0?.mode).toBe('crop')
    expect(v0?.baseline).toBe(100)
  })
  it("sets a crop by its segment's box and its line's baseline, never by its glyphs' origins (a radical's is its bar)", () => {
    // "scaled by √d": the text layer gives √ its origin at its bar, 7.7 pt over the line's baseline, and d on the line
    const pg = [...item('scaled by', 10, 100, 10, 0), { ...item('\u221A', 52, 107.7, 10, 1, math)[0] }, ...item('d', 58, 100, 10, 2, math), ...item(' here', 64, 100, 10, 3)]
    const u = { kind: 'para', src: 'scaled by here', pieces: [{ t: 'text', s: '\u7F29\u653E ' }, { t: 'ph', src: '$\\sqrt{d}$' }, { t: 'text', s: ' \u8FD9\u91CC' }] } as never
    const lu = unitOf([[1, 10, 90, 100, 108, 97, 10, 0]], [[1, 0, [1, 51.8, 100, 63.4, 108.6, 97.6]]])
    const r = L2.prepareUnit(u, [rect.slice()] as never, [pg as never], new Map() as never, null, T.texParts(lu, [-1, 1, -1], { use: 'ph' }) as never).get(1)
    expect(r?.mode).toBe('crop')
    expect(r?.baseline).toBe(100)
    for (const [i, v] of [51.4, 97.3, 63.8, 108.9].entries()) expect(r?.crop?.[i]).toBeCloseTo(v, 6)
  })
  it("takes a gap's piece no placeholder took for the unit's text where the file knows each placeholder's ink", () => {
    // "Each value 2 old is squared here": three letters the alignment does not take (a hyphenated word's tail), beside
    // the superscript the file's segment holds
    const pg = [...item('Each value', 10, 100, 10, 0), ...item('2', 62, 103.6, 7, 1), ...item('old', 70, 100, 10, 2), ...item('is squared here', 88, 100, 10, 3)]
    const keys = pg.filter(c => /[old]/.test(c.ch) && c.item === 2).map(c => `1|${c.item}|${c.k}`)
    const lu = unitOf([[1, 10, 160, 100, 108, 97, 10, 0]], [[1, 0, [1, 61.8, 100, 65.6, 107.5, 101]]])
    const line = [[1, 10, 97.85, 160, 106.83]]
    const t = T.texRects(lu)
    const withFile = L2.prepareUnit(unit, t.rects as never, [pg.map(c => ({ ...c, page: 1 })) as never], new Map() as never, null, T.texParts(lu, [-1, 1, -1], { use: 'lines', lines: t }) as never)
    expect(withFile.inkKnown).toBe(true)
    expect(keys.map(k => withFile.cat.get(k))).toEqual(['acc', 'acc', 'acc'])
    // (v0's own reading knows no rendering's ink: a short piece none took is a rendering, kept where it stands)
    const own = L2.prepareUnit(unit, line as never, [pg.map(c => ({ ...c, page: 1 })) as never], new Map() as never)
    expect(own.inkKnown).toBe(false)
    expect(keys.map(k => own.cat.get(k))).toEqual(['orphan', 'orphan', 'orphan'])
    // (the file's placeholders over v0's own lines, use 'ph': the unit's characters are v0's rectangles', and the premise
    // that the segments reach every placeholder's ink is not proven)
    const onlyPh = L2.prepareUnit(unit, line as never, [pg.map(c => ({ ...c, page: 1 })) as never], new Map() as never, null, T.texParts(lu, [-1, 1, -1], { use: 'ph' }) as never)
    expect(onlyPh.inkKnown).toBe(false)
  })
  it("grows a crop v0 reads over the ink it touches, and one cut from the file's segment never", () => {
    const toDev = (x: number, y: number): [number, number] => [x * 2, (200 - y) * 2]
    const ink = { w: 100, h: 100, ink: new Uint8Array(100 * 100).fill(1), factor: 4 }
    // another formula's subscript just over the crop's top
    const above = [{ ...item('i', 22, 109.4, 7, 9, math)[0] }]
    const grow = (box: boolean) => {
      const r = { crop: [20, 98, 30, 108], gap: { chars: [], ...(box ? { box: { x0: 20, x1: 30, baseline: 100, lines: 1 } } : {}) } }
      L2.growCrop(r as never, ink, toDev, 2, above as never)
      return r.crop[3]
    }
    expect(grow(false)).toBeGreaterThan(108)
    expect(grow(true)).toBe(108)
  })
})

describe("each crop the hybrid draws cut from its placeholder's own ink", () => {
  const page = [...item('Each value', 10, 100, 10, 0), ...item('2', 62, 103.6, 7, 1), ...item('is squared here', 70, 100, 10, 2)]
  const unit = { kind: 'para', src: 'Each value is squared here', pieces: [{ t: 'text', s: '\u6BCF\u4E2A\u503C ' }, { t: 'ph', src: '$^{2}$' }, { t: 'text', s: ' \u5E73\u65B9' }] } as never
  const rect = [1, 10, 97.85, 145, 106.83]
  const read = (lu: never | null, kOf: number[] | null) => L2.prepareUnit(unit, [rect.slice()] as never, [page as never], new Map() as never, null, { proof: T.proofOf(lu, kOf) } as never)
  it("v0's crop takes the segment of its placeholder's row that it meets, and that segment's baseline", () => {
    const r = read(unitOf([[1, 10, 145, 100, 108, 97, 10, 0]], [[1, 0, [1, 61.8, 100, 65.6, 107.5, 101]]]), [-1, 1, -1])
    expect(r.unproven).toBeUndefined()
    for (const [i, v] of [61.4, 100.7, 66, 107.8].entries()) expect(r.get(1)?.crop?.[i]).toBeCloseTo(v, 6)
    expect(r.get(1)?.baseline).toBe(100)
    expect((r.get(1)?.gap as { box?: unknown })?.box).toBeTruthy()
  })
  it("a rendering in its own brackets, the translation setting its own, keeps the segment's box clipped between them", () => {
    // "(x+y)" on the page, the source's own round brackets inside the translation's: its crop is the segment's ink
    // between the brackets, on the segment's baseline, never estimated from the text layer's characters
    const pg = [...item('see', 10, 100, 10, 0), ...item('(x+y)', 60, 100, 10, 1, math), ...item('here', 90, 100, 10, 2)]
    const u = { kind: 'para', src: 'see here', pieces: [{ t: 'text', s: '\u5F0F\uFF08' }, { t: 'ph', src: '$(x+y)$' }, { t: 'text', s: '\uFF09\u6240\u793A' }] } as never
    const lu = unitOf([[1, 10, 145, 100, 108, 97, 10, 0]], [[1, 0, [1, 60, 100, 85, 108, 97]]])
    const r = L2.prepareUnit(u, [rect.slice()] as never, [pg as never], new Map() as never, null, T.texParts(lu, [-1, 1, -1], { use: 'ph' }) as never)
    expect(r.unproven).toBeUndefined()
    expect(r.get(1)).toMatchObject({ mode: 'crop', baseline: 100 })
    for (const [i, v] of [64.6, 96.7, 80.4, 108.3].entries()) expect(r.get(1)?.crop?.[i]).toBeCloseTo(v, 6)
    expect((r.get(1)?.gap as { box?: unknown; unbracketed?: boolean })).toMatchObject({ unbracketed: true, box: { x0: 65, x1: 80, top: 108, bottom: 97 } })
  })
  it('a crop no segment proves: its row LOST, its segment elsewhere, its unit not in the file, its pieces not the file\'s', () => {
    const line = [1, 10, 145, 100, 108, 97, 10, 0]
    expect(read(unitOf([line], [[1, 32, []]]), [-1, 1, -1]).unproven).toBe(1)
    expect(read(unitOf([line], [[1, 0, [1, 120, 100, 130, 107.5, 101]]]), [-1, 1, -1]).unproven).toBe(1)
    expect(read(null, null).unproven).toBe(1)
    expect(read(unitOf([line], [[1, 0, [1, 61.8, 100, 65.6, 107.5, 101]]]), null).unproven).toBe(1)
  })
})

describe('every rendering proven by the file, or the unit the original\'s (proofOf, the safe rule)', () => {
  const page = [...item('as shown in', 10, 100, 10, 0), ...item('[12]', 70, 100, 10, 1), ...item('before', 95, 100, 10, 2)]
  const cite = { kind: 'para', src: 'as shown in before', pieces: [{ t: 'text', s: '\u5982 ' }, { t: 'ph', src: '\\cite{smith2019}' }, { t: 'text', s: ' \u6240\u793A' }] } as never
  const rect = [1, 10, 97.85, 125, 106.83]
  const line = [1, 10, 125, 100, 108, 97, 10, 0]
  const read = (lu: never | null, kOf: number[] | null, unit = cite) => L2.prepareUnit(unit, [rect.slice()] as never, [page as never], new Map() as never, null, { proof: T.proofOf(lu, kOf) } as never)
  it("v0's page text of a placeholder is proven where its characters stand in its row's segments", () => {
    const r = read(unitOf([line], [[1, 0, [1, 70, 100, 90, 108, 97]]]), [-1, 1, -1])
    expect(r.get(1)?.mode).toBe('orig-text')
    expect(r.unproven).toBeUndefined()
  })
  it('and not where they stand elsewhere, its row is LOST, or the unit is not in the file', () => {
    expect(read(unitOf([line], [[1, 0, [1, 100, 100, 120, 108, 97]]]), [-1, 1, -1]).unproven).toBe(1)
    expect(read(unitOf([line], [[1, 32, []]]), [-1, 1, -1]).unproven).toBe(1)
    expect(read(null, null).unproven).toBe(1)
  })
  it("a rendering from its source (a citation found nowhere) is no proof; TeX's own nothing and a text symbol are", () => {
    const none = { kind: 'para', src: 'as shown in before', pieces: [{ t: 'text', s: '\u5982 ' }, { t: 'ph', src: '\\cite{nobody}' }, { t: 'text', s: ' ' }, { t: 'ph', src: '\\%' }, { t: 'ph', src: '~' }] } as never
    const bare = [...item('as shown in', 10, 100, 10, 0), ...item('before', 95, 100, 10, 2)]
    const r = L2.prepareUnit(none, [rect.slice()] as never, [bare as never], new Map() as never, null, { proof: T.proofOf(null, null) } as never)
    expect(r.get(1)?.mode).toBe('source')
    expect(r.unproven).toBe(1)
    const sym = { kind: 'para', src: 'as shown', pieces: [{ t: 'text', s: '\u5982 ' }, { t: 'ph', src: '\\%' }, { t: 'ph', src: '~' }] } as never
    expect(L2.prepareUnit(sym, [rect.slice()] as never, [bare as never], new Map() as never, null, { proof: T.proofOf(null, null) } as never).unproven).toBeUndefined()
  })
})

describe('a display group and a piece outside the unit\'s lines (JOINED, OUTSIDE: LAYOUT 6)', () => {
  // a unit of text, two displays with nothing between them, text: lines 0 and 1 its text, 2 and 3 the displays' rows
  // (held), 4 text; the first display's segments hold the group's ink, the second is JOINED
  const L = (y: number) => [1, 10, 200, y, y + 7, y - 2, 10, 0]
  const lines = [L(500), L(488), L(470), L(458), L(440)]
  const text = (s: string) => ({ t: 'text', s }), ph = (src: string) => ({ t: 'ph', src })
  const D = '\\begin{equation}x=1\\end{equation}', E = '\\begin{equation}y=2\\end{equation}'
  const u = { kind: 'para', src: 'a b c d', pieces: [text('\u7532 '), ph(D), text(' '), ph(E), text(' \u4E59')] } as never
  const tr = [[0, '\u7532 '], [1, 1], [0, ' '], [1, 3], [0, ' \u4E59']]
  const kOf = [-1, 1, -1, 3, -1]
  const fileUnit = (second: number, first = [1, 50, 470, 80, 477, 456]) => {
    const lu = unitOf(lines, [[1, 0, first], [3, second, []]]) as { ph: Map<number, { kind: string }> }
    for (const k of [1, 3]) { const row = lu.ph.get(k); if (row) row.kind = 'display' }
    return { ...lu, held: [2, 3] } as never
  }
  it('a JOINED display is located with its group, which a LOST one is not', () => {
    expect(T.locatedWhole(fileUnit(PH_FLAG.JOINED), u, tr, { held: true }).ok).toBe(true)
    expect(T.locatedWhole(fileUnit(PH_FLAG.JOINED), u, tr).ok).toBe(true)
    // the control: the later display LOST, not JOINED. Without the file's held lines it is not located; with them neither:
    // after a found display, one the maker did not JOIN has a point of its own, so it is a group of its own (whatever
    // the translation sets between them), and the one run is the found display's (displayCover, D4 step 1)
    expect(T.locatedWhole(fileUnit(PH_FLAG.LOST), u, tr).why).toBe('lost')
    expect(T.locatedWhole(fileUnit(PH_FLAG.LOST), u, tr, { held: true }).why).toBe('lost')
  })
  it('reads as its group: kept, the same region as the first, a break the text after them starts below', () => {
    const lu = fileUnit(PH_FLAG.JOINED)
    const t = T.texRects(lu)
    const page = [...item('a b', 10, 500, 10, 0), ...item('c', 10, 488, 10, 1), ...item('x=1', 60, 470, 10, 2, math), ...item('y=2', 60, 458, 10, 3, math), ...item('d', 10, 440, 10, 4)]
    const prep = L2.prepareUnit(u, t.rects as never, [page as never], new Map() as never, null, T.texParts(lu, kOf, { use: 'lines', lines: t }) as never)
    expect(prep.unproven).toBeUndefined()
    const r1 = prep.get(1), r3 = prep.get(3)
    expect([r1?.mode, r3?.mode]).toEqual(['kept', 'kept'])
    expect(r3?.region).toBe(r1?.region)
    const blocks = L2.blocks2(t.rects as never, [[0, 0, 612, 792]], new Set(prep.keep), prep.lineInfo, prep.regionOf, prep.referenced)
    expect(blocks.map(b => [b.B, b.after])).toEqual([[[500, 488], 0], [[440], 1]])
  })
  it('a LOST piece outside the unit\'s lines is located with the file\'s lines alone, and drawn as nothing', () => {
    const head = { kind: 'para', src: 'a b c', pieces: [ph('\\url{http://x.org}'), text(' a b c')] } as never
    const lu = unitOf([L(500)], [[0, PH_FLAG.LOST | PH_FLAG.OUTSIDE, []]]) as never
    expect(T.locatedWhole(lu, head, [[1, 0], [0, ' a b c']], { held: true }).ok).toBe(true)
    expect(T.locatedWhole(lu, head, [[1, 0], [0, ' a b c']]).why).toBe('lost')
    const t = T.texRects(lu)
    const prep = L2.prepareUnit(head, t.rects as never, [item('a b c', 60, 500, 10, 0) as never], new Map() as never, null, T.texParts(lu, [0, -1], { use: 'lines', lines: t }) as never)
    expect(prep.get(0)).toMatchObject({ mode: 'none', text: '' })
    expect(prep.unproven).toBeUndefined()
  })
})

describe("a piece past the pages shown, a source's own proof, and fix 4 (the LOST round's review, 2026-10-15)", () => {
  const L = (y: number) => [1, 10, 200, y, y + 7, y - 2, 10, 0]
  const text = (s: string) => ({ t: 'text', s }), ph = (src: string) => ({ t: 'ph', src })
  const D = '\\begin{equation}x=1\\end{equation}'
  const BASE = { fam: 'serif', bold: false, italic: false, caps: false, design: 'times', known: true }
  const DESIGNS = { serif: 'times', sans: 'helvetica', mono: 'courier' }
  const P = { ...resolveRules(BUILTIN_RULES, 'zh').params, autospace: 0, compressMax: -1, hyphen: 0 }
  const drawn = (u: never, prep: never) => L2.tokensOf2(u, prep, 'zh', BASE as never, DESIGNS as never, P as never, null, () => 0).filter(t => typeof t.s === 'string').map(t => t.s).join('')
  it('a found row whose segments all lie past the pages shown is proven, drawn as its page text, never "?"', () => {
    const u = { kind: 'para', src: 'in Section here', pieces: [text('\u5728\u7B2C '), ph('\\ref{sec:x}'), text(' \u8282')] } as never
    const lu = unitOf([[1, 10, 145, 100, 108, 97, 10, 0]], [[1, 0, [13, 181.41, 568.58, 196.87, 575.95, 568.43]]]) as { ph: Map<number, { text?: string }> }
    const row = lu.ph.get(1)
    if (row) row.text = 'C.1'
    const read = (shown: number) => L2.prepareUnit(u, [[1, 10, 97.85, 145, 106.83]] as never, [item('in here', 10, 100, 10, 0) as never], new Map() as never, null, { proof: T.proofOf(lu as never, [-1, 1, -1], shown) } as never)
    const r = read(12)
    expect(r.unproven).toBeUndefined()
    expect(r.get(1)).toMatchObject({ mode: 'source', text: 'C.1' })
    // with its page shown, not so: its characters are read there, and here none is
    expect(read(13).unproven).toBe(1)
  })
  it('a piece the file draws as nothing (OUTSIDE) is never handed a guessed rendering by the second chance', () => {
    const head = { kind: 'para', src: 'alpha beta gamma', pieces: [ph(D), text(' alpha beta gamma')] } as never
    const lu = unitOf([L(500)], [[0, PH_FLAG.LOST | PH_FLAG.OUTSIDE, []]]) as { ph: Map<number, { kind: string }> }
    const row = lu.ph.get(0)
    if (row) row.kind = 'display'
    const t = T.texRects(lu as never)
    // a run of the line no source word takes, the display's own text: what the second chance would hand it (kept, a
    // guess, and the unit then unproven)
    const prep = L2.prepareUnit(head, t.rects as never, [[...item('alpha beta gamma', 12, 500, 10, 0), ...item('x=1', 120, 500, 10, 9, math)] as never], new Map() as never, null, T.texParts(lu as never, [0, -1], { use: 'lines', lines: t }) as never)
    expect(prep.get(0)).toMatchObject({ mode: 'none', inPlace: true })
    expect(prep.unproven).toBeUndefined()
  })
  it("fix 4: a mark that may not start a line opening the text after a display is dropped, unless the original's line opens with one", () => {
    const lines = [L(500), L(488), L(470), L(458), L(440)]
    const lu = { ...(unitOf(lines, [[1, 0, [1, 50, 470, 80, 477, 456]]]) as object), held: [2, 3] } as unknown as { ph: Map<number, { kind: string }> }
    const row = lu.ph.get(1)
    if (row) row.kind = 'display'
    const t = T.texRects(lu as never)
    const u = { kind: 'para', src: 'a b c d', pieces: [text('\u7532 '), ph(D), text('\uFF0C\u4E59')] } as never
    const page = (after: string) => [...item('a b', 10, 500, 10, 0), ...item('c', 10, 488, 10, 1), ...item('x=1', 60, 470, 10, 2, math), ...item('(1)', 180, 458, 10, 3), ...item(after, 10, 440, 10, 4)]
    const prep = (after: string) => L2.prepareUnit(u, t.rects as never, [page(after) as never], new Map() as never, null, T.texParts(lu as never, [-1, 1, -1], { use: 'lines', lines: t }) as never)
    expect(drawn(u, prep('where d') as never)).toBe('\u7532\u4E59')
    // the original's own line after the display opens with a comma: kept
    expect(drawn(u, prep(', where d') as never)).toBe('\u7532\uFF0C\u4E59')
  })
})

describe("page text no Unicode stands for, and a held line's own mark (the LOST round's images, 2026-10-15)", () => {
  const L = (y: number) => [1, 10, 200, y, y + 7, y - 2, 10, 0]
  const text = (s: string) => ({ t: 'text', s }), ph = (src: string) => ({ t: 'ph', src })
  const BASE = { fam: 'serif', bold: false, italic: false, caps: false, design: 'times', known: true }
  const DESIGNS = { serif: 'times', sans: 'helvetica', mono: 'courier' }
  const P = { ...resolveRules(BUILTIN_RULES, 'zh').params, autospace: 0, compressMax: -1, hyphen: 0 }
  const drawn = (u: never, prep: never) => L2.tokensOf2(u, prep, 'zh', BASE as never, DESIGNS as never, P as never, null, () => 0).filter(t => typeof t.s === 'string').map(t => t.s).join('')
  it("reads the characters a font's own map gives its glyphs, and marks a character it maps none to", () => {
    const set = L2.mappedOf({ _map: ['a', undefined, '\uFB01', '\u{1D454}'] })
    // (each as written and as the text layer normalises it: the ligature's letters, the math italic's g)
    expect([...(set ?? [])].sort()).toEqual(['a', 'f', 'g', 'i', '\uFB01', '\u{1D454}'].sort())
    expect(L2.mappedOf({ firstChar: 0, lastChar: 255 })).toBeNull()
    expect(L2.mappedOf(undefined)).toBeNull()
    const f8 = new Set(['g', '='])
    expect(['g', ' ', '=', '\u00CD'].map(ch => L2.unmapped(ch, f8))).toEqual([false, false, false, true])
    // a font with no map to read: only a character no Unicode stands for (private use, replacement, control)
    expect(['a', '\uE001', '\uFFFD', '\u0001', ' '].map(ch => L2.unmapped(ch, null))).toEqual([false, true, true, true, false])
  })
  it("reads each font's map from the pinned PDF.js opened with PDF_OPTIONS (its private `_map`), and refuses a font exported without it", async () => {
    // the CC0 sample paper's page 1, its fonts as PDF.js's commonObjs holds them once the page's operators are read
    const { PDF_OPTIONS } = await import('@/pdf-reader/engine/layer-proto/run.mjs')
    const data = new Uint8Array(readFileSync(join(process.cwd(), 'tests/fixtures/pdf/sample-1/sample-1.pdf')))
    const fontsOf = async (options: object) => {
      const task = getDocument({ data: data.slice(), verbosity: 0, ...options })
      try {
        const page = await (await task.promise).getPage(1)
        const ops = await page.getOperatorList()
        const names = new Set<string>()
        ops.fnArray.forEach((fn, i) => { if (fn === OPS.setFont) names.add(String((ops.argsArray[i] as unknown[])[0])) })
        return [...names].map(n => page.commonObjs.get(n) as { name: string; isType3Font: boolean })
      } finally {
        await task.destroy()
      }
    }
    const fonts = await fontsOf(PDF_OPTIONS)
    expect(fonts.length).toBeGreaterThan(3)
    for (const f of fonts) {
      expect(f.isType3Font).toBe(false)
      expect(L2.fontMappedOf(f)?.size, f.name).toBeGreaterThan(0)
    }
    // (CMR10's map gives its letters, CMMI10's the math italic's)
    expect(L2.fontMappedOf(fonts.find(f => /CMR10$/.test(f.name)))?.has('a')).toBe(true)
    // the same document opened without the font's extra properties: no map exported, which is refused, not read as none
    const bare = await fontsOf({ ...PDF_OPTIONS, fontExtraProperties: false })
    expect(bare.length).toBe(fonts.length)
    for (const f of bare) expect(() => L2.fontMappedOf(f)).toThrow(/PDF_OPTIONS/)
    // a Type3 font, an error PDF.js resolved in a font's place, none: no map to read
    expect(L2.fontMappedOf({ isType3Font: true })).toBeNull()
    expect(L2.fontMappedOf('Error: a font that did not load')).toBeNull()
    expect(L2.fontMappedOf(null)).toBeNull()
  })
  it('page text of a placeholder with a character no Unicode stands for is no proof, its segments the file\'s own or not', () => {
    // a formula TeX broke over two lines (two segments: drawn as its page text), its sum sign read by its code
    const u = { kind: 'para', src: 'a b c d', pieces: [text('\u7532 '), ph("$g(z')=\\sum_n g_n$"), text(' \u4E59')] } as never
    const lu = unitOf([L(500), L(488)], [[1, 0, [1, 150, 500, 200, 507, 498, 1, 10, 488, 40, 495, 486]]]) as never
    const t = T.texRects(lu)
    const page = (sum: { nu?: boolean }) => [...item('a b', 10, 500, 10, 0), ...item('g=', 150, 500, 10, 1, math), ...item('\u00CD', 10, 488, 10, 2, math).map(c => ({ ...c, ...sum })), ...item('gn', 20, 488, 10, 3, math), ...item('c d', 50, 488, 10, 4)]
    const read = (sum: { nu?: boolean }) => L2.prepareUnit(u, t.rects as never, [page(sum) as never], new Map() as never, null, T.texParts(lu, [-1, 1, -1], { use: 'lines', lines: t }) as never)
    expect(read({}).get(1)?.mode).toBe('orig-text')
    expect(read({}).unproven).toBeUndefined()
    expect(read({ nu: true }).unproven).toBe(1)
    // and v0's page text proven by the segments alike
    expect(L2.prepareUnit(u, t.rects as never, [page({ nu: true }) as never], new Map() as never, null, { proof: T.proofOf(lu, [-1, 1, -1]) } as never).unproven).toBe(1)
  })
  it("a mark after a placeholder kept on its held line, where that line shows the original's own, is not drawn again", () => {
    // footnote 1 of 1512.03385: "… and \url{…}." with the URL's line kept (held), its full stop with it
    const u = { kind: 'footnote', src: 'a b', pieces: [text('\u7532 '), ph('\\url{http://x.org/y}'), text('\u3002')] } as never
    const lu = { ...(unitOf([L(500), L(488)], [[1, 0, [1, 10, 488, 80, 495, 486]]]) as object), held: [1] } as never
    const t = T.texRects(lu)
    const prep = (line: string) => L2.prepareUnit(u, t.rects as never, [[...item('a b', 10, 500, 10, 0), ...item(line, 10, 488, 10, 1)] as never], new Map() as never, null, T.texParts(lu, [-1, 1, -1], { use: 'lines', lines: t }) as never)
    const shown = prep('http://x.org/y.')
    expect(shown.get(1)).toMatchObject({ mode: 'kept', heldAfter: '.' })
    expect(drawn(u, shown as never)).toBe('\u7532')
    // the held line shows no mark after it: the translation's is drawn
    expect(drawn(u, prep('http://x.org/y') as never)).toBe('\u7532\u3002')
    // as many dropped as the held line shows: one, so the translation's closing quote after its full stop is drawn
    const quoted = { ...(u as object), pieces: [text('\u7532 '), ph('\\url{http://x.org/y}'), text('\u3002\u300D')] } as never
    const one = L2.prepareUnit(quoted, t.rects as never, [[...item('a b', 10, 500, 10, 0), ...item('http://x.org/y.', 10, 488, 10, 1)] as never], new Map() as never, null, T.texParts(lu, [-1, 1, -1], { use: 'lines', lines: t }) as never)
    expect(one.get(1)).toMatchObject({ heldAfter: '.', heldMarks: 1 })
    expect(drawn(quoted, one as never)).toBe('\u7532\u300D')
    // two the held line shows (".)"): both of the translation's
    const two = L2.prepareUnit(quoted, t.rects as never, [[...item('a b', 10, 500, 10, 0), ...item('http://x.org/y.)', 10, 488, 10, 1)] as never], new Map() as never, null, T.texParts(lu, [-1, 1, -1], { use: 'lines', lines: t }) as never)
    expect(two.get(1)).toMatchObject({ heldMarks: 2 })
    expect(drawn(quoted, two as never)).toBe('\u7532')
  })
})

describe("a formula of no letter or digit is no text symbol: proven as any formula is (the controller's ruling of 2026-10-15)", () => {
  // the review's three probes, each drawn from its source as a symbol before ("Σ_α^β", "∫_(-∞)^∞", "α/β")
  const PROBES = ['$\\sum_{\\alpha}^{\\beta}$', '$\\int_{-\\infty}^{\\infty}$', '$\\frac{\\alpha}{\\beta}$']
  const text = (s: string) => ({ t: 'text', s }), ph = (src: string) => ({ t: 'ph', src })
  it('a text symbol is one grapheme drawn with none of the marks of a formula\'s structure; the probes are formulas', () => {
    expect(PROBES.map(s => L2.phClass2(s).cls)).toEqual(['symbol', 'symbol', 'symbol'])
    expect(PROBES.map(s => [L2.textSymbol(s), L2.phClassProven(s).cls])).toEqual([[false, 'other'], [false, 'other'], [false, 'other']])
    // (a text source's one grapheme is that character, \\_ the maker's TEXT symbol too)
    expect(['\\%', '\\_', '$\\times$', '$^\\dagger$', '$\\alpha$', '$\\leq$'].map(s => [L2.textSymbol(s), L2.phClassProven(s).cls])).toEqual(Array(6).fill([true, 'symbol']))
    expect(['$\\alpha\\beta$', '$^{\\dagger\\ddagger}$', '$\\nabla_\\theta$', '$/$'].map(L2.textSymbol)).toEqual([false, false, false, false])
    // (any other class as it was)
    expect(['$x_i$', '\\cite{a}', '~'].map(s => L2.phClassProven(s).cls)).toEqual(['other', 'cite', 'space'])
  })
  const line = [1, 10, 145, 100, 108, 97, 10, 0]
  const rect = [1, 10, 97.85, 145, 106.83]
  const page = [...item('as shown', 10, 100, 10, 0), ...item('\u03A3\u03B1\u03B2', 60, 100, 10, 1, math), ...item('here', 90, 100, 10, 2)]
  for (const src of PROBES) {
    const unit = { kind: 'para', src: 'as shown here', pieces: [text('\u5982 '), ph(src), text(' \u6240\u793A')] } as never
    const read = (parts: object | null) => L2.prepareUnit(unit, [rect.slice()] as never, [page as never], new Map() as never, null, parts as never)
    it(`${src}: drawn only where the file proves its ink, else its unit the original's`, () => {
      const tr = [[0, '\u5982 '], [1, 1], [0, ' \u6240\u793A']], kOf = [-1, 1, -1]
      const found = unitOf([line], [[1, 0, [1, 60, 100, 75, 108, 97]]]), lost = unitOf([line], [[1, PH_FLAG.LOST, []]])
      // v0 alone (no proof): a symbol from its source, as before
      expect(read(null).get(1)?.mode).toBe('symbol')
      // the file locates the unit whole only where it finds the formula (it is asked for, as any formula is)
      expect(T.locatedWhole(found, unit, tr).ok).toBe(true)
      expect(T.locatedWhole(lost, unit, tr).why).toBe('lost')
      // then its rendering is the segment's own ink: a crop cut from it, proven
      const whole = read(T.texParts(found, kOf, { use: 'ph' }))
      expect(whole.unproven).toBeUndefined()
      expect(whole.get(1)).toMatchObject({ mode: 'crop', crop: [59.6, 96.7, 75.4, 108.3], baseline: 100 })
      // v0's own reading under the proof, no file, the row LOST, or found: none proves it (v0 reads no word in symbols
      // alone, so it would draw the source's text): the unit the original's
      for (const lu of [null, lost, found]) expect(read({ proof: T.proofOf(lu, lu ? kOf : null) }).unproven).toBe(1)
    })
  }
  it('a text symbol stays exempt: drawn from its source under the proof with no file, and asked for by no file', () => {
    for (const [src, drawn] of [['$\\times$', '\u00D7'], ['\\_', '_']] as const) {
      const unit = { kind: 'para', src: 'as shown here', pieces: [text('\u5982 '), ph(src), text(' \u6240\u793A')] } as never
      const r = L2.prepareUnit(unit, [rect.slice()] as never, [page as never], new Map() as never, null, { proof: T.proofOf(null, null) } as never)
      expect(r.unproven, src).toBeUndefined()
      expect(r.get(1), src).toMatchObject({ mode: 'symbol', text: drawn })
      // (its row LOST: the unit still located whole, the symbol's glyph its line's)
      expect(T.locatedWhole(unitOf([line], [[1, PH_FLAG.LOST, []]]), unit, [[0, '\u5982 '], [1, 1], [0, ' \u6240\u793A']]).ok, src).toBe(true)
    }
  })
})

describe('the state units share, which a unit the file locates teaches as v0 does', () => {
  it("a citation found by its segments is learnt for the paper: a unit laid after it draws the same key's citation not found", () => {
    const page = [...item('as shown in', 10, 100, 10, 0), ...item('[12]', 70, 100, 10, 1), ...item('before', 95, 100, 10, 2)]
    const unit = { kind: 'para', src: 'as shown in before', pieces: [{ t: 'text', s: '\u5982 ' }, { t: 'ph', src: '\\cite{smith2019}' }, { t: 'text', s: ' \u6240\u793A' }] } as never
    const lu = unitOf([[1, 10, 125, 100, 108, 97, 10, 0]], [[1, 0, [1, 70, 100, 90, 108, 97]]])
    const citeMap = new Map() as never as Map<string, string>
    const r = L2.prepareUnit(unit, [[1, 10, 97.85, 125, 106.83]] as never, [page as never], citeMap as never, null, T.texParts(lu, [-1, 1, -1], { use: 'ph' }) as never).get(1)
    expect(r?.mode).toBe('orig-text')
    expect(r?.text).toBe('[12]')
    expect(citeMap.get('smith2019')).toBe('12')
    // a later unit whose citation of the same key is nowhere found draws it from what was learnt
    const later = { kind: 'para', src: 'again', pieces: [{ t: 'text', s: '\u518D ' }, { t: 'ph', src: '\\cite{smith2019}' }] } as never
    const again = L2.prepareUnit(later, [[1, 10, 85.85, 60, 94.83]] as never, [item('again', 10, 88, 10, 3) as never], citeMap as never).get(1)
    expect(again).toMatchObject({ mode: 'cite-map', text: '[12]' })
  })
})

describe("the file's baselines in v0's blocks", () => {
  it('an evenly set block of file baselines takes its mean gap, which their rounding to a hundredth does not move', () => {
    const rects = [0, 1, 2, 3].map(i => [1, 10, 97.85 - 11.955 * i, 200, 106.83 - 11.955 * i])
    const B = [100, 88.05, 76.09, 64.14]
    const info = new Map(rects.map((r, i) => [`${r[0]}|${r.slice(1).join()}`, { baseline: B[i], size: 10, exact: true, file: true }]))
    expect(L2.blocks2(rects as never, [[0, 0, 612, 792]], null, info as never)[0]?.pitch0).toBeCloseTo((100 - 64.14) / 3, 6)
  })
})

describe('the erase of a line of several boxes', () => {
  it('erases each, the last to its block\'s edge where the line is not the block\'s last', () => {
    const blocks = [{ page: 1, x1: 300, rects: [[1, 10, 98, 200, 107], [1, 10, 86, 150, 95]] }]
    const extents = new Map([['1,10,98,200,107', [[10, 98, 60, 107], [80, 98, 200, 107]]]])
    const ops = L2.unitOps({ lines: [], scale: 1 } as never, blocks as never, 1, { px: (x: number, y: number) => [x, -y], k: 1, hasSource: () => false, pxOf: () => (x: number, y: number) => [x, -y], extents: extents as never })
    const boxes = ops.filter(o => o.op === 'erase').map(o => (o as { box: number[] }).box)
    expect(boxes.length).toBe(3)
    const [first, second] = boxes as [number[], number[]]
    expect(first[0]).toBeCloseTo(9.7)
    expect((first[0] ?? 0) + (first[2] ?? 0)).toBeCloseTo(61.8)
    expect((second[0] ?? 0) + (second[2] ?? 0)).toBeCloseTo(301.8)
  })
})

describe("TeX's own lines, kept and broken (the 2608.16117 survey's fixes 2 and 3, 2026-10-15)", () => {
  const text = (s: string) => ({ t: 'text', s }), ph = (src: string) => ({ t: 'ph', src })
  const key = (r: number[]) => `${r[0]}|${r.slice(1).join()}`
  it('fix 2: a unit on the file\'s lines keeps its held lines alone, its author-year citation line its own text', () => {
    // "delta (Kim Lee Park Choi Han 2016)": seven words, one the source's, the rest the citation's rendering. On v0's
    // lines the alignment keeps that line as another unit's (four words or more, under a fifth of them the source's)
    const lines = [[1, 10, 200, 500, 507, 498, 10, 0], [1, 10, 200, 488, 495, 486, 10, 0], [1, 10, 200, 476, 483, 474, 10, 0]]
    const lu = unitOf(lines, [[1, 0, [1, 40, 488, 180, 495, 486]]]) as { ph: Map<number, { kind: string }> }
    const row = lu.ph.get(1)
    if (row) row.kind = 'cite'
    const u = { kind: 'para', src: 'alpha beta gamma delta epsilon zeta eta', pieces: [text('\u7532\u4E59\u4E19\u4E01 '), ph('\\citep{kim,lee,park,choi,han}'), text(' \u620A\u5DF1\u5E9A')] } as never
    const page = [...item('alpha beta gamma', 10, 500, 10, 0), ...item('delta (Kim Lee Park Choi Han 2016)', 10, 488, 10, 1), ...item('epsilon zeta eta', 10, 476, 10, 2)]
    const t = T.texRects(lu as never)
    const citeLine = key(t.rects[1] as number[])
    const tex = L2.prepareUnit(u, t.rects as never, [page as never], new Map() as never, null, T.texParts(lu as never, [-1, 1, -1], { use: 'lines', lines: t }) as never)
    expect(tex.keep ?? []).not.toContain(citeLine)
    expect(tex.get(1)?.mode).not.toBe('kept')
    // the control: on v0's own lines (a unit the file does not locate whole) the rule stays, the anchors' rectangle may be
    // over another unit's line
    const v0 = L2.prepareUnit(u, t.rects.map(r => [...r]) as never, [page as never], new Map() as never)
    expect(v0.keep).toContain(citeLine)
  })

  // a paragraph, `\\ \\`, a paragraph: lines 0 and 1 the first (1 ended short at the forced break), the blank line, 2 and 3
  // the second; and `\\ \\` after the unit's last words, which ends no line of it
  const L = (y: number, x1 = 200) => [1, 10, x1, y, y + 7, y - 2, 10, 0]
  const lines = [L(500), L(488, 90), L(464), L(452, 120)]
  const BR = '\\\\'
  const unit = (...p: object[]) => ({ kind: 'para', src: 'a b c d', pieces: p }) as never
  const u = unit(text('\u7532'), ph(BR), ph(BR), text(' \u4E59'), ph(BR), ph(BR), text('\n'))
  it("fix 3: pairs each forced break between two visible pieces with a line TeX ended short, in order, never one at an edge", () => {
    // (with TeX's room after it, in the unit's pitches: the gap to the next line, 24, over the pitch, 12, less one, the
    // empty line the second `\\` sets)
    expect([...T.forcedBreaks(unitOf(lines) as never, u)]).toEqual([[1, { next: 2, room: 1 }], [2, { next: 2, room: 1 }]])
    // a break before a display ends no line of the text: the display does
    const D = '\\begin{equation}x=1\\end{equation}'
    expect(T.forcedBreaks(unitOf(lines) as never, unit(text('\u7532'), ph(BR), ph(D), text(' \u4E59'))).size).toBe(0)
  })
  it('pairs nothing where the breaks and the short lines are not as many, nor where a found piece stands across its break', () => {
    // no line ended short (the break at a line's end), and two for one break (a ragged unit)
    expect(T.forcedBreaks(unitOf([L(500), L(488), L(464), L(452, 120)]) as never, u).size).toBe(0)
    expect(T.forcedBreaks(unitOf([L(500, 150), L(488, 90), L(464), L(452, 120)]) as never, u).size).toBe(0)
    // a citation the translation sets after the break, whose segments the file puts on line 0, before it
    const cited = unit(text('\u7532'), ph(BR), text(' \u4E59'), ph('\\cite{x}'), text('\u4E19'))
    const kOf = [-1, -1, -1, 3, -1]
    expect(T.forcedBreaks(unitOf(lines, [[3, 0, [1, 60, 500, 80, 507, 498]]]) as never, cited, kOf).size).toBe(0)
    expect([...T.forcedBreaks(unitOf(lines, [[3, 0, [1, 60, 464, 80, 471, 462]]]) as never, cited, kOf)]).toEqual([[1, { next: 2, room: 1 }]])
  })
  it('pairs nothing in a unit in two columns of one page, nor at a short line that is a display\'s row (#367 review)', () => {
    // two columns of page 1: the left one's line 1 ends short, as the break's line would
    const two = { ...(unitOf([L(500), L(488, 90), [1, 320, 520, 500, 507, 498, 10, 0], [1, 320, 520, 488, 495, 486, 10, 0]]) as object), frames: Float64Array.from([1, 0, 0, 2, -1, 0, 1, 1, 2, 2, 500, 0]) }
    const one = unit(text('\u7532'), ph(BR), text(' \u4E59'))
    expect([...T.forcedBreaks(unitOf([L(500), L(488, 90), L(464), L(452)]) as never, one)]).toEqual([[1, { next: 2, room: 1 }]])
    expect(T.forcedBreaks(two as never, one).size).toBe(0)
    // a display's row the file does not hold, short of the measure: no line a forced break ends
    const row = unitOf([L(500), L(488, 90), L(464), L(452, 120)], [[7, 0, [1, 40, 488, 90, 495, 486]]]) as { ph: Map<number, { kind: string }> }
    const d = row.ph.get(7)
    if (d) d.kind = 'display'
    expect(T.forcedBreaks(row as never, one).size).toBe(0)
  })
  // the unit laid on the file's lines (a line of 190 pt holds 38 characters at size 10): its parts, its blocks, its tokens,
  // and its layout at its fit or at one state (`at`)
  const BASE = { fam: 'serif', bold: false, italic: false, caps: false, design: 'times', known: true }
  const DESIGNS = { serif: 'times', sans: 'helvetica', mono: 'courier' }
  const P = { ...resolveRules(BUILTIN_RULES, 'zh').params, autospace: 0, compressMax: -1, hyphen: 0, borrow: 0 }
  const laid = (rows: number[][], pieces: object[]) => {
    const lu = unitOf(rows)
    const t = T.texRects(lu)
    const pages = Math.max(...rows.map(r => r[0] ?? 1))
    // (each line's page text one letter of the source's at its start)
    const charsByPage = Array.from({ length: pages }, (_, p) => rows.flatMap((r, j) => (r[0] === p + 1 ? item(String.fromCharCode(97 + j), 10, r[3] ?? 0, 10, j) : [])))
    const u = { kind: 'para', src: rows.map((_, j) => String.fromCharCode(97 + j)).join(' '), pieces } as never
    const prep = L2.prepareUnit(u, t.rects as never, charsByPage as never, new Map() as never, null, T.texParts(lu, pieces.map(() => -1), { use: 'lines', lines: t }) as never)
    const blocks = L2.blocks2(t.rects as never, Array.from({ length: pages }, () => [0, 0, 612, 792]), prep.keep?.length ? new Set(prep.keep) : null, prep.lineInfo, prep.regionOf, prep.referenced, null, prep.breakAt, prep.joinAt)
    const tokens = L2.tokensOf2(u, prep, 'zh', BASE as never, DESIGNS as never, P as never, null, () => 50)
    const lines = (l: { lines: { page: number; baseline: number; items: { t: { s?: string } }[] }[] }) => l.lines.filter(x => x.items.some(it => it.t.s)).map(x => [x.page, Math.round(x.baseline * 100) / 100, x.items.map(it => it.t.s ?? '').join('')])
    const at = (lead: number) => L2.layoutAt(tokens, blocks as never, 10, P as never, { lead, track: 0, trackLatin: 0, compress: 0, borrow: 0, scale: 1, knob: 'none' } as never)
    return { prep, blocks, tokens, lines, at, fit: () => L2.layoutUnit2(tokens, blocks as never, 10, P as never) }
  }
  /** n CJK characters from `from` */
  const cjk = (n: number, from: number) => Array.from({ length: n }, (_, i) => String.fromCharCode(from + i)).join('')
  const A = cjk(1, 0x7532), Bc = cjk(1, 0x4e59)

  it("breaks the text there, in one frame: the laid line ends, and TeX's room after the break is one empty line of the drawing's, its grid unbroken", () => {
    // `\\ \\` after line 1 (ended short), the original's empty line, four lines of the second paragraph: a frame whose
    // second paragraph's translation leaves its slots to spare
    const rows = [L(500), L(488, 90), L(464), L(452), L(440), L(428, 120)]
    const z = laid(rows, [text(A), ph(BR), ph(BR), text(` ${Bc}`), ph(BR), ph(BR), text('\n')])
    expect(z.prep.get(1)).toMatchObject({ mode: 'none', brk: true, room: 1 })
    // (no region of its own: the break is no kept place the text jumps to; the edge break a space, as before)
    expect(z.prep.get(1)?.region).toBeUndefined()
    expect(z.prep.breakAt?.size).toBe(0)
    expect(z.prep.get(4)?.brk).toBeUndefined()
    // the rows on both sides of the gap one block: the file's own baselines, its pitch the paragraph's, its foot kept
    expect(z.blocks.map(b => [b.B, b.after, b.pitch0])).toEqual([[[500, 488, 464, 452, 440, 428], 0, 12]])
    expect(z.tokens.map(x => ((x as { newline?: number }).newline !== undefined ? '/' : x.blockTo !== undefined ? '|' : x.space ? '_' : x.s)).join('')).toBe(`${A}/_${Bc}`)
    // at the script's leading (1.3, a pitch of 15.6): the second paragraph two lines under the first's last, the room the
    // translation does not use at the unit's end, no band before a line pinned to TeX's (464)
    const l = z.fit()
    expect(l.clipped).toBe(false)
    expect(z.lines(l)).toEqual([[1, 500, A], [1, 468.8, Bc]])
    // on the original's own pitch: the same, one empty line; and where the first paragraph takes the original's two lines,
    // the second starts on TeX's own line after the break
    expect(z.lines(z.at(1))).toEqual([[1, 500, A], [1, 476, Bc]])
    const two = laid(rows, [text(cjk(39, 0x4e00)), ph(BR), ph(BR), text(` ${Bc}`)])
    expect(two.lines(two.at(1)).map(x => x[1])).toEqual([500, 488, 464])
  })

  it('a lone `\\\\` leaves no room: the text after it on the next line', () => {
    const rows = [L(500), L(488, 90), L(476), L(464), L(452, 120)]
    const z = laid(rows, [text(A), ph(BR), text(` ${Bc}`)])
    expect([...T.forcedBreaks(unitOf(rows) as never, { kind: 'para', src: '', pieces: [text(A), ph(BR), text(` ${Bc}`)] } as never)]).toEqual([[1, { next: 2, room: 0 }]])
    expect(z.lines(z.fit())).toEqual([[1, 500, A], [1, 484.4, Bc]])
  })

  it("a lone `\\\\` before a tall line: the gap TeX's \\lineskip opened is no room of the break's (#383 review)", () => {
    // line 2 is tall (14 over its baseline): TeX set it the short line's depth, its height and \lineskip (1) under it, 17
    // where the pitch is 12 (the file's boxes, as blocks2 reads a tall line's opening)
    const rows = [L(500), L(488, 90), [1, 10, 200, 471, 485, 469, 10, 0], L(459), L(447, 120)]
    const one = { kind: 'para', src: '', pieces: [text(A), ph(BR), text(` ${Bc}`)] } as never
    expect([...T.forcedBreaks(unitOf(rows) as never, one, null, [1, 0])]).toEqual([[1, { next: 2, room: 0 }]])
    // with no values for TeX's rule, all of the gap beyond the pitch
    expect([...T.forcedBreaks(unitOf(rows) as never, one)]).toEqual([[1, { next: 2, room: 0.417 }]])
  })

  it("`\\vspace{0.3cm}\\\\`: TeX's room is the glue it set, 0.63 of a pitch, kept at the drawing's pitch", () => {
    // 0.3 cm, 8.54 pt, at a pitch of 13.6: line 2 is 1.63 pitches under line 1 (here 12 \u00D7 1.63 = 19.56)
    const rows = [L(500), L(488, 90), L(468.44), L(456.44), L(444.44, 120)]
    const pieces = [text(A), ph('\\vspace{0.3cm}'), ph(BR), text(` ${Bc}`)]
    expect([...T.forcedBreaks(unitOf(rows) as never, { kind: 'para', src: '', pieces } as never)]).toEqual([[2, { next: 2, room: 0.63 }]])
    const z = laid(rows, pieces)
    const got = z.lines(z.fit())
    expect(got.map(x => x[2])).toEqual([A, Bc])
    // (1.63 drawn pitches of 15.6 under the first line)
    expect(got[1]?.[1]).toBeCloseTo(500 - 1.63 * 15.6, 2)
  })

  it("a break whose next line opens another frame keeps the pin: the text after it starts on that frame's line TeX set", () => {
    // line 2, page 1's last, ends short; the text after the break is on page 2's first (TeX drops glue at a frame's head)
    const P2 = (y: number, x1 = 200) => [2, 10, x1, y, y + 7, y - 2, 10, 0]
    const rows = [L(500), L(488), L(476, 90), P2(500), P2(488, 120)]
    const pieces = [text(A), ph(BR), text(` ${Bc}`)]
    expect([...T.forcedBreaks(unitOf(rows) as never, { kind: 'para', src: '', pieces } as never)]).toEqual([[1, { next: 3, room: null }]])
    const z = laid(rows, pieces)
    expect(z.prep.get(1)).toMatchObject({ brk: true })
    expect(z.prep.get(1)?.region).toBeDefined()
    expect(z.prep.joinAt?.size).toBe(0)
    expect(z.lines(z.fit())).toEqual([[1, 500, A], [2, 500, Bc]])
  })

  it("2608.16117's unit 8: three paragraphs, `\\\\ \\\\` in two frames, one leading for the unit and its unused room at its end", () => {
    // TeX: S1 on page 1's four lines and page 2's first two (the second ended short), the empty line, S2 on six lines and
    // page 3's first two (ended short), the empty line, S3 on three
    const at = (page: number) => (y: number, x1 = 200) => [page, 10, x1, y, y + 7, y - 2, 10, 0]
    const [p1, p2, p3] = [at(1), at(2), at(3)]
    const rows = [p1(500), p1(488), p1(476), p1(464), p2(500), p2(488, 90), p2(464), p2(452), p2(440), p2(428), p2(416), p2(404), p3(500), p3(488, 90), p3(464), p3(452), p3(440, 120)]
    // the translation: S1 four lines of 40 characters, S2 six, S3 three; with the two empty lines, fifteen slots
    const [S1, S2, S3] = [cjk(150, 0x4e00), cjk(220, 0x5000), cjk(100, 0x5200)]
    const z = laid(rows, [text(S1), ph(BR), ph(BR), text(S2), ph(BR), ph(BR), text(S3)])
    expect(z.blocks.map(b => [b.page, b.B.length])).toEqual([[1, 4], [2, 8], [3, 5]])
    const l = z.fit()
    expect(l.clipped).toBe(false)
    // one leading, 1.25 (a pitch of 15): every line on its frame's grid from its first line, an empty slot after each break
    expect(l.state.lead).toBe(1.25)
    const got = z.lines(l)
    const of = (s: string) => (x: (string | number)[]) => s.includes(String(x[2]).slice(0, 1))
    expect(got.filter(of(S1)).map(x => [x[0], x[1]])).toEqual([[1, 500], [1, 485], [1, 470], [2, 500]])
    expect(got.filter(of(S2)).map(x => [x[0], x[1]])).toEqual([[2, 470], [2, 455], [2, 440], [2, 425], [2, 410], [3, 500]])
    // S3 two lines under S2's last, not at TeX's line after the break (464) under a band of S2's unused room
    expect(got.filter(of(S3)).map(x => [x[0], x[1]])).toEqual([[3, 470], [3, 455], [3, 440]])
  })
})
