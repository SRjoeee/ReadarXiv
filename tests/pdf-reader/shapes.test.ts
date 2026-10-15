import { describe, expect, it, vi } from 'vitest'
import { type Anchor, type DocToken, lineRects, sentenceStarts, tokenizeDocument } from '@/pdf-reader/engine/pipeline/anchors.mjs'
import { readLeftPart, writeLeftPart } from '@/pdf-reader/engine/layer-proto/format.mjs'
import { type Box, pageFloats } from '@/pdf-reader/engine/view/floats.mjs'
import { blockOf, layoutOf, pageGeometry, runsOf, sentenceOf } from '@/pdf-reader/engine/view/highlight.mjs'
import { createShapes, leftPageInput, mirror, pdfShapes } from '@/pdf-reader/engine/view/shapes.mjs'
// the gate's own harness (SH1 on the ten papers), here on a paper of the test's
import { cutSide, pagesAgree } from '../../lab/pdf/spikes/highlight-pages.mjs'

// The shapes of the shared reader view (the contract's §2.7, rows SH1–SH4): a side's layout made page by page from the
// layer's wire — the document part from the parts' line rectangles as they come, a page's part from its left part — the
// right's shapes its own layout over its own copies (trap 1), sentences through the same calls once a unit's pairs are in.
// A paper of three pages, 600 × 800, made as highlight.test.ts makes its pages: body text 10 high on lines 12 apart. Page 1
// in two columns, a heading over the left one with its number no unit's (a head); pages 2 and 3 one column, on page 2 a
// table (three rows no unit's) over its caption. Units 3 and 5 run over a page break, and with unit 1 have sentences

type Item = { str: string; transform: number[]; width: number; height: number; hasEOL: boolean; fontName: string }
const item = (str: string, x: number, y: number, { width = str.length * 5, size = 10, eol = false } = {}): Item => ({ str, transform: [size, 0, 0, size, x, y], width, height: size, hasEOL: eol, fontName: 'f' })
const line = (s: string, y: number, x0: number, x1: number) => item(s, x0, y, { width: x1 - x0, eol: true })
const WORDS = 'text text text text text text text text'
const prose = (y: number, n: number, x0: number, x1: number) => Array.from({ length: n }, (_, i) => line(WORDS, y - 12 * i, x0, x1))
/** a row of a table: its cells' words at 160, 260 and 360 */
const row = (y: number) => [item('alpha', 160, y), item('beta', 260, y), item('gamma', 360, y, { eol: true })]
const VIEW = [0, 0, 600, 800]
const PAD = 2.25

const pages: Item[][] = [
  [item('1', 50, 752), item('Introduction', 62, 752, { eol: true }), ...prose(740, 30, 50, 290), ...prose(752, 31, 310, 550)],
  [...prose(740, 14, 50, 550), ...row(560), ...row(548), ...row(536), line('Table 1: a caption of the table', 516, 150, 400), ...prose(496, 16, 50, 550)],
  prose(740, 10, 50, 550),
]
const doc: DocToken[] = tokenizeDocument(pages.map((items, i) => ({ page: i + 1, items, styles: {} })))
/** the tokens of the prose line at height y on page p, between x0 and x1 */
const lineOf = (p: number, x0: number, x1: number, y: number) => doc.flatMap((t, k) => (t.page === p && Math.abs(t.y - y) < 1 && t.x >= x0 && t.x < x1 ? [k] : []))
/** lines `from` to `to` of the prose from y0 down */
const lines = (p: number, x0: number, x1: number, y0: number, from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => lineOf(p, x0, x1, y0 - 12 * (from + i))).flat()
/** the units: id → tokens */
const UNITS = new Map<number, number[]>([
  [0, doc.flatMap((t, k) => (t.t === 'introduction' ? [k] : []))],
  [1, lines(1, 50, 290, 740, 0, 14)],
  [2, [...lines(1, 50, 290, 740, 15, 29), ...lines(1, 310, 550, 752, 0, 9)]],
  [3, [...lines(1, 310, 550, 752, 10, 30), ...lines(2, 50, 550, 740, 0, 5)]],
  [4, doc.flatMap((t, k) => (t.page === 2 && t.y === 516 ? [k] : []))],
  [5, [...lines(2, 50, 550, 740, 6, 13), ...lines(2, 50, 550, 496, 0, 15), ...lines(3, 50, 550, 740, 0, 4)]],
  [6, lines(3, 50, 550, 740, 5, 9)],
])
const KINDS: Record<number, string> = { 0: 'heading', 4: 'caption' }
const kindOf = (id: number) => KINDS[id] ?? 'para'
function nth<T>(xs: readonly T[], i: number): T { const x = xs[i]; if (x === undefined) throw new Error(`no item ${i} of ${xs.length}`); return x }
/** a unit's text, one word a token (the pairs: word i → its i-th token) */
const textOf = (id: number) => (UNITS.get(id) ?? []).map(() => 'text').join(' ')
/** the offsets of the sentences after the first, beginning at those words */
const SENTENCE_WORDS: Record<number, number[]> = { 1: [20, 61], 3: [30, 150, 190], 5: [50, 120, 200, 215] }
/** a layout's own token tables, page by page (an internal of highlight.mjs the test looks into) */
const tablesOf = (layout: object) => (layout as { pt: ({ l: Float32Array } | undefined)[] }).pt
const offsetsOf = (id: number) => (SENTENCE_WORDS[id] ?? []).map(w => 5 * w)
const anchors = new Map<number, Anchor | null>([...UNITS].map(([id, tokens]) => [id, { tokens, rects: lineRects(doc, tokens), coverage: 1, bounded: true, pairs: new Map(tokens.map((k, w) => [w, k])) }]))
const views = pages.map(() => VIEW)
const whole = layoutOf(doc, views, anchors, kindOf)
const wholeStarts = new Map(Object.keys(SENTENCE_WORDS).map(Number).map(id => [id, sentenceStarts(anchors.get(id), textOf(id), offsetsOf(id)) as Int32Array]))
const sentences = (id: number) => ({ text: textOf(id), offsets: offsetsOf(id) })

/** the side made page by page from the cut wire: the parts first, then the pages in `order` */
function built(order: number[], o: { pairs?: boolean } = {}) {
  const { parts, lefts } = cutSide(whole, anchors, views, o.pairs === false ? { pairsOf: () => null } : {})
  const h = createShapes({ kindOf })
  h.addParts(parts)
  for (const p of order) h.addPage(nth(lefts, p))
  return h
}

describe('SH1: the layout made page by page equals the one made whole', () => {
  it('the paper is what the rows test: two columns, a head, units over a page break, sentences found', () => {
    expect(runsOf(whole, 3).map(r => r.page)).toEqual([1, 2])
    expect(runsOf(whole, 5).map(r => r.page)).toEqual([2, 2, 3])
    expect(pageGeometry(whole, 1).heads).toEqual([0])
    for (const st of wholeStarts.values()) expect(st).toBeInstanceOf(Int32Array)
  })

  it('in every page\'s geometry and every sentence shape, the pages interleaved with the parts in any order', () => {
    for (const seed of [1, 2, 3, 7, 11]) {
      const r = pagesAgree(whole, anchors, views, kindOf, { starts: wholeStarts, sentences, seed })
      expect(r.differ).toEqual([])
      expect(r.runs).toBeGreaterThan(8)
      expect(r.sentences).toBeGreaterThan(10)
    }
  })

  it('in reverse page order, the parts all in first', () => {
    const h = built([3, 2, 1])
    for (let p = 1; p <= 3; p++) expect(pageGeometry(h.layout, p).runs).toEqual(pageGeometry(whole, p).runs)
    for (const [id, st] of wholeStarts) {
      const got = h.starts(id, textOf(id), offsetsOf(id))
      expect(got).toEqual(st)
      const a = runsOf(whole, id), b = runsOf(h.layout, id)
      for (let r = 0; r < a.length; r++) for (let s = 0; s <= st.length; s++) expect(sentenceOf(h.layout, nth(b, r), got as Int32Array, s, PAD)).toEqual(sentenceOf(whole, nth(a, r), st, s, PAD))
    }
  })

  it('the check sees a difference: a page\'s left part one token short of the whole', () => {
    const { parts, lefts } = cutSide(whole, anchors, views)
    const h = createShapes({ kindOf })
    h.addParts(parts)
    const left = nth(lefts, 2)
    // unit 5's last token on the page (the end of its last line there) left out
    h.addPage({ ...left, spans: left.spans.map(([id, r]) => [id, id === 5 ? [...r.slice(0, -1), nth(r, r.length - 1) - 1] : r]) })
    expect(pageGeometry(h.layout, 2).runs).not.toEqual(pageGeometry(whole, 2).runs)
  })

  it('a page\'s geometry made before a later part moves the document part is made again by it', () => {
    // page 1 one paragraph around two displays, none of its lines as long as the measure; page 3, odd too, prose from 50
    // to 300: page 1's text edges are the odd pages', which come with page 3's part
    const ps = [[line('the unit starts here', 700, 50, 180), item('x = y', 140, 676), item('a + b', 150, 652), line('and it ends with some more words here', 628, 50, 298)], prose(700, 20, 70, 320), prose(700, 20, 50, 300)]
    const d = tokenizeDocument(ps.map((items, i) => ({ page: i + 1, items, styles: {} })))
    const units = [1, 2, 3].map(p => d.flatMap((t, k) => (t.page === p ? [k] : [])))
    const as = new Map<number, Anchor | null>(units.map((tokens, id) => [id, { tokens, rects: lineRects(d, tokens), coverage: 1, bounded: true }]))
    const vs = ps.map(() => VIEW), W = layoutOf(d, vs, as, () => 'para')
    const { parts, lefts } = cutSide(W, as, vs)
    const h = createShapes({ kindOf: () => 'para' })
    h.addParts([nth(parts, 0)])
    h.addPage(nth(lefts, 1))
    const early = nth(pageGeometry(h.layout, 1).runs, 0)
    expect([early.x0, early.x1]).not.toEqual([50, 300])
    h.addParts(parts.slice(1))
    const late = nth(pageGeometry(h.layout, 1).runs, 0)
    expect([late.x0, late.x1]).toEqual([50, 300])
    expect(pageGeometry(h.layout, 1).runs).toEqual(pageGeometry(W, 1).runs)
  })

  it('reads the left part the wire carries (writeLeftPart, readLeftPart): its tokens to a thousandth of a unit', async () => {
    const { lefts } = cutSide(whole, anchors, views)
    const paper = { id: '2608.00001', version: 1 }, page = 3, l = nth(lefts, page)
    const coded = (xs: Float32Array) => { const out: number[] = []; let prev = 0; for (const x of xs) { const q = Math.round(x * 1000); out.push(q - prev); prev = q } return out }
    const tokens = { perPage: [l.table.n], l: coded(l.table.l), r: coded(l.table.r), y: coded(l.table.y), h: coded(l.table.h), top: coded(l.table.top), bottom: coded(l.table.bottom) }
    const w = await writeLeftPart({ paper, page, first: l.first, tokens, spans: l.spans, pairs: l.pairs })
    const streams = new Map([...anchors].map(([id, a]) => [id, a?.tokens[0]]))
    const read = await readLeftPart(w.bytes, { ref: w.ref as typeof w.ref & { page: number }, streamOf: id => streams.get(id) })
    const input = leftPageInput(read)
    expect(input.page).toBe(3)
    expect(input.first).toBe(l.first)
    expect(input.spans.map(([id, ts]) => [id, [...ts]])).toEqual([[5, anchors.get(5)?.tokens.filter(k => doc[k]?.page === 3)], [6, anchors.get(6)?.tokens]])
    expect([...(input.pairs.find(([id]) => id === 6)?.[1] ?? [])].slice(0, 3)).toEqual([0, 1, 2])
    const { parts } = cutSide(whole, anchors, views)
    const h = createShapes({ kindOf })
    h.addParts(parts)
    h.addPage(read)
    const a = pageGeometry(whole, 3).runs, b = pageGeometry(h.layout, 3).runs
    expect(b.map(r => r.id)).toEqual(a.map(r => r.id))
    for (let i = 0; i < a.length; i++) for (const f of ['x0', 'x1', 'top', 'bottom'] as const) expect(Math.abs(nth(b, i)[f] - nth(a, i)[f])).toBeLessThan(0.002)
  })
})

describe('SH2 (trap 1): the right\'s shapes are its own layout over its own copies', () => {
  const left = built([1, 2, 3])
  left.floats(2)
  const right = mirror(left)

  it('a mirrored unit\'s boxes equal the left\'s, from distinct run objects and over distinct token tables', () => {
    for (const id of UNITS.keys()) {
      const a = left.shapes.runs(id), b = right.shapes.runs(id)
      expect(b.length).toBe(a.length)
      for (let i = 0; i < a.length; i++) {
        expect(nth(b, i)).not.toBe(nth(a, i))
        expect(right.shapes.block(nth(b, i), PAD)).toEqual(left.shapes.block(nth(a, i), PAD))
      }
    }
    const st = nth([...wholeStarts.values()], 1)
    const a = left.shapes.runs(3), b = right.shapes.runs(3)
    for (let s = 0; s <= st.length; s++) expect(right.shapes.sentence(nth(b, 0), st, s, PAD)).toEqual(left.shapes.sentence(nth(a, 0), st, s, PAD))
    expect(right.layout).not.toBe(left.layout)
    expect(tablesOf(right.layout)[2]?.l).not.toBe(tablesOf(left.layout)[2]?.l)
    expect(tablesOf(right.layout)[2]?.l).toEqual(tablesOf(left.layout)[2]?.l)
  })

  it('lighting a unit on the right leaves the left\'s element in place (the paint keeps what it drew by run)', () => {
    // the paint's keeping, as lighting.mjs has it: what each run was drawn as, by the run, put back (appended) when the
    // same is lit again; each pane its own layer
    const paintOn = (drawn: WeakMap<object, HTMLElement>) => (layer: HTMLElement, shapes: { runs(id: number): readonly object[] }, id: number) => {
      for (const run of shapes.runs(id)) {
        let el = drawn.get(run)
        if (!el) { el = document.createElement('div'); drawn.set(run, el) }
        layer.append(el)
      }
    }
    const paint = paintOn(new WeakMap())
    const L = document.createElement('div'), R = document.createElement('div')
    paint(L, left.shapes, 5)
    const mine = [...L.children]
    paint(R, right.shapes, 5)
    expect([...L.children]).toEqual(mine)
    expect(L.children.length).toBe(3)
    expect(R.children.length).toBe(3)
    // the trap itself: shapes that hand the right the left's runs move the left's elements out of its pane
    const L2 = document.createElement('div'), R2 = document.createElement('div'), paint2 = paintOn(new WeakMap())
    paint2(L2, left.shapes, 5)
    paint2(R2, { runs: id => left.shapes.runs(id) }, 5)
    expect(L2.children.length).toBe(0)
  })

  it('follows the left: a page the left is given later is the right\'s too, as its own copy', () => {
    const { parts, lefts } = cutSide(whole, anchors, views)
    const l = createShapes({ kindOf })
    const r = mirror(l)
    l.addParts(parts)
    expect(r.shapes.runs(6)).toEqual([])
    l.addPage(nth(lefts, 3))
    expect(r.shapes.runs(6).length).toBe(1)
    expect(r.shapes.runs(6).map(run => r.shapes.block(run, PAD))).toEqual(l.shapes.runs(6).map(run => l.shapes.block(run, PAD)))
    expect(tablesOf(r.layout)[3]?.l).not.toBe(tablesOf(l.layout)[3]?.l)
    r.dispose()
    l.addPage(nth(lefts, 1))
    expect(l.shapes.runs(1).length).toBe(1)
    expect(r.shapes.runs(1)).toEqual([])
  })

  it('a page\'s geometry let go (the view\'s window, §3.2) is made again on its next use, equal, from new runs', () => {
    const h = built([1, 2, 3]), m = mirror(h)
    const a = h.shapes.runs(3), b = m.shapes.runs(3)
    h.forget(2)
    m.forget(2)
    expect(nth(h.shapes.runs(3), 1)).not.toBe(nth(a, 1))
    expect(nth(h.shapes.runs(3), 0)).toBe(nth(a, 0))
    expect(h.shapes.runs(3)).toEqual(a)
    expect(nth(m.shapes.runs(3), 1)).not.toBe(nth(b, 1))
    expect(m.shapes.runs(3)).toEqual(b)
  })

  it('a float passes through; what a point lights and what a click levels by are the right\'s own, equal to the left\'s', () => {
    const f = left.shapes.float(4)
    expect(f).toMatchObject({ id: 4, page: 2, kind: 'table' })
    expect(right.shapes.float(4)).toBe(f)
    expect(right.shapes.floatShapes(f as NonNullable<typeof f>, PAD)).toBe(left.shapes.floatShapes(f as NonNullable<typeof f>, PAD))
    const run = nth(right.shapes.runs(1), 0), b = blockOf(run, PAD), x = (b.x0 + b.x1) / 2, y = (b.y0 + b.y1) / 2
    const hit = right.shapes.hit(1, x, y, PAD, () => null)
    expect(hit).toMatchObject({ id: 1, s: -1 })
    expect((hit as { run?: object }).run).not.toBe((left.shapes.hit(1, x, y, PAD, () => null) as { run?: object }).run)
    expect(right.shapes.click(1, x, b.y1 - 1, PAD, () => null)).toEqual(left.shapes.click(1, x, b.y1 - 1, PAD, () => null))
    // a point on the table lights its float on both, the same float
    const s = nth(right.shapes.floatShapes(f as NonNullable<typeof f>, PAD), 0)
    expect(right.shapes.hit(2, (s.x0 + s.x1) / 2, (s.y0 + s.y1) / 2, PAD, () => null)).toMatchObject({ id: 4, s: -1, float: f })
  })
})

describe('SH3: sentences through the same calls', () => {
  const h = built([1, 2, 3])
  const st = wholeStarts.get(1) as Int32Array
  const run = nth(h.shapes.runs(1), 0), b = h.shapes.block(run, PAD), first = nth(run.rows, 0)
  // a point on the unit's first row, in its first sentence
  const x = b.x0 + 20, y = (first.y0 + first.y1) / 2

  it('a stub startsOf gives sentence shapes: the hit names a sentence, its shape is rows of its own', () => {
    const hit = h.shapes.hit(1, x, y, PAD, id => (id === 1 ? st : null))
    expect(hit).toMatchObject({ id: 1, s: 0 })
    const shape = h.shapes.sentence(run, st, 1, PAD)
    expect(shape.length).toBeGreaterThan(0)
    expect(shape).not.toEqual([b])
    expect(h.shapes.fits(1, st, true)).toBe(true)
  })

  it('null gives whole units: the hit names the unit (s -1), and its block is what paints', () => {
    expect(h.shapes.hit(1, x, y, PAD, () => null)).toMatchObject({ id: 1, s: -1 })
  })

  it('the left\'s starts come once the unit\'s pairs are in, on every page it is on: before, none (it lights whole)', () => {
    const none = built([1, 2, 3], { pairs: false })
    expect(none.starts(3, textOf(3), offsetsOf(3))).toBeNull()
    const half = built([1])
    expect(half.starts(1, textOf(1), offsetsOf(1))).toEqual(wholeStarts.get(1))
    expect(half.starts(3, textOf(3), offsetsOf(3))).toBeNull()
    expect(half.shapes.fits(3, wholeStarts.get(3) as Int32Array, true)).toBe(false)
    const all = built([1, 3, 2])
    expect(all.starts(3, textOf(3), offsetsOf(3))).toEqual(wholeStarts.get(3))
  })

  it('headings and captions light whole, whatever starts they are given', () => {
    const cap = nth(h.shapes.runs(4), 0), c = h.shapes.block(cap, PAD)
    expect(h.shapes.hit(2, (c.x0 + c.x1) / 2, (c.y0 + c.y1) / 2, PAD, () => Int32Array.of(nth(UNITS.get(4) ?? [], 2)))).toMatchObject({ id: 4, s: -1 })
  })

  it('a unit short of a page lights whole where a point lights it, whatever starts it is given', () => {
    const half = built([1]), st = wholeStarts.get(3) as Int32Array
    const r = nth(half.shapes.runs(3), 0), top = nth(r.rows, 0)
    expect(half.shapes.hit(1, r.x0 + 20, (top.y0 + top.y1) / 2, PAD, () => st)).toMatchObject({ id: 3, s: -1 })
  })
})

describe('the feed: pages and parts told again, a left part malformed, floats on the layer path', () => {
  /** a layout's kept page geometries (an internal of highlight.mjs the test looks into) */
  const cacheOf = (layout: object) => (layout as { cache: Map<number, unknown> }).cache
  const { parts, lefts } = cutSide(whole, anchors, views)

  /** the parts with unit 6 (page 3) held back, and a part that tells it alone, later: a part that moves the document part */
  const held = parts.map(p => ({ ...p, left: p.left.filter(([id]) => id !== 6) }))
  const late = { ...nth(parts, 1), left: nth(parts, 1).left.filter(([id]) => id === 6) }
  function builtLate() {
    const h = createShapes({ kindOf })
    h.addParts(held)
    for (const p of [1, 2, 3]) h.addPage(nth(lefts, p))
    return h
  }

  it('a page given again changes nothing (false); a part told again changes nothing either: every page\'s runs and floats kept, the same objects, the mirror told nothing', () => {
    const h = built([1, 2, 3]), m = mirror(h), runs = h.shapes.runs(5), mine = m.shapes.runs(5)
    h.floats(2)
    const f = h.shapes.float(4)
    expect(h.addPage(nth(lefts, 2))).toBe(false)
    expect(nth(h.shapes.runs(5), 0)).toBe(nth(runs, 0))
    h.addParts(parts)
    h.addParts([nth(parts, 1)])
    expect(nth(h.shapes.runs(5), 0)).toBe(nth(runs, 0))
    expect(h.shapes.float(4)).toBe(f)
    expect(nth(m.shapes.runs(5), 0)).toBe(nth(mine, 0))
  })

  it('a malformed left part goes to the refusal: one warning, nothing thrown, a good one taken after', () => {
    const warn = vi.fn(), h = createShapes({ kindOf, warn })
    h.addParts(parts)
    expect(() => h.addPage({ ...nth(lefts, 3), spans: undefined as never })).not.toThrow()
    expect(h.has(3)).toBe(false)
    expect(warn).toHaveBeenCalledTimes(1)
    expect(h.addPage(nth(lefts, 3))).toBe(true)
    expect(h.shapes.runs(6).length).toBe(1)
  })

  it('a page whose floats throw: one warning, nothing thrown into the feed or the paint, the mirror told every part and page', () => {
    const warn = vi.fn(), l = createShapes({ kindOf, warn }), r = mirror(l)
    l.addParts([nth(parts, 0)])
    l.addPage(nth(lefts, 1))
    // paths no float can be made of (a rule that is no box), given before the page's part
    const bad = { rules: [null as unknown as Box & { v: boolean }] }
    expect(() => l.floats(2, [], bad)).not.toThrow()
    expect(() => l.addParts(parts.slice(1))).not.toThrow()
    expect(() => l.addPage(nth(lefts, 2))).not.toThrow()
    const cap = nth(l.shapes.runs(4), 0), c = blockOf(cap, PAD), x = (c.x0 + c.x1) / 2, y = (c.y0 + c.y1) / 2
    expect(() => l.shapes.hit(2, x, y, PAD, () => null)).not.toThrow()
    expect(() => r.shapes.hit(2, x, y, PAD, () => null)).not.toThrow()
    expect(l.shapes.float(4)).toBeNull()
    expect(warn).toHaveBeenCalledTimes(1)
    // the later part and pages reached the mirror; the bad inputs are gone, so a later part rethrows nothing
    l.addPage(nth(lefts, 3))
    expect(r.shapes.runs(4).length).toBe(1)
    expect(r.shapes.runs(6).length).toBe(1)
    expect(() => l.addParts(parts)).not.toThrow()
    expect(warn).toHaveBeenCalledTimes(1)
    // the page's floats given again, made of good paths
    l.floats(2)
    expect(l.shapes.float(4)).toMatchObject({ id: 4, kind: 'table' })
  })

  it('a part makes no page again in its own task: floats come back on their next use, from the page\'s geometry made then', () => {
    const h = builtLate()
    h.floats(2)
    expect(h.shapes.float(4)).toMatchObject({ id: 4, kind: 'table' })
    h.addParts([late])
    expect(cacheOf(h.layout).size).toBe(0)
    expect(h.shapes.float(4)).toMatchObject({ id: 4, kind: 'table' })
    expect(cacheOf(h.layout).has(2)).toBe(true)
    // the float the whole layout makes of the same page; the unit told late lit from its page's tokens given before
    const W = layoutOf(doc, views, anchors, kindOf), [f] = pageFloats(W, 2)
    expect(h.shapes.float(4)).toEqual(f)
    expect(h.shapes.runs(6)).toEqual(runsOf(whole, 6))
  })

  it('forget lets a page\'s floats and their inputs go: no part makes them again, the caller gives them again on its redraw', () => {
    const h = builtLate()
    h.floats(2)
    expect(h.shapes.float(4)).not.toBeNull()
    h.forget(2)
    expect(h.shapes.float(4)).toBeNull()
    h.addParts([late])
    expect(h.shapes.float(4)).toBeNull()
    expect(cacheOf(h.layout).has(2)).toBe(false)
    h.floats(2)
    expect(h.shapes.float(4)).toMatchObject({ id: 4, kind: 'table' })
  })
})

describe('the mirror beside a float (the right\'s sentences keep from under the left\'s floats)', () => {
  it('a display beside a figure, inside a sentence from the page before: the right\'s row keeps to its ink as the left\'s does, and what it paints lights what it paints', () => {
    // floats.test.ts's paper: the paragraph's sentence goes on from page 1 through a display at the head of page 2 (x
    // 60–85) beside a figure (160–300) whose caption is under it; then the paragraph goes on under the caption
    const ps = [
      [...prose(780, 20, 50, 300), line('alpha beta gamma delta and words go on', 496, 50, 300), line('a sentence begins here and goes', 484, 50, 300), item('x = y', 150, 466, { eol: true })],
      [item('i = a', 60, 760, { eol: true }), line('Figure 1: the chart', 733, 160, 300), line('then the end. More words go here', 715, 50, 300), line('and here the unit ends now', 703, 50, 300), ...prose(680, 20, 50, 300)],
    ]
    const d = tokenizeDocument(ps.map((items, i) => ({ page: i + 1, items, styles: {} })))
    const at = (t: string, from = 0) => d.findIndex((w, k) => k >= from && w.t === t), p2 = d.findIndex(w => w.page === 2), at2 = (t: string) => at(t, p2)
    const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i)
    const unit = [...range(at('alpha'), at2('a')), ...range(at2('then'), at2('now'))], cap = range(at2('figure'), at2('chart'))
    const used = new Set([...unit, ...cap])
    const rest = [1, 2].map(p => [1000 + p, d.flatMap((t, k) => (t.page === p && t.t === 'text' && !used.has(k) ? [k] : []))] as [number, number[]])
    const as = new Map<number, Anchor | null>([[0, unit] as [number, number[]], [1, cap] as [number, number[]], ...rest].map(([id, tokens]) => [id, { tokens, rects: lineRects(d, tokens), coverage: 1, bounded: true }]))
    const kinds = (id: number) => (id === 1 ? 'caption' : 'para'), vs = ps.map(() => VIEW)
    const { parts: P, lefts: Ls } = cutSide(layoutOf(d, vs, as, kinds), as, vs)
    const l = createShapes({ kindOf: kinds }), m = mirror(l)
    l.addParts(P)
    l.addPage(nth(Ls, 1))
    l.addPage(nth(Ls, 2))
    l.floats(2, [{ x0: 160, y0: 745, x1: 300, y1: 790 }])
    const starts = Int32Array.from([at('begins'), at2('more')]), startsOf = (i: number) => (i === 0 ? starts : null), px = 2
    const display = (sh: typeof l.shapes) => nth(sh.runs(0).filter(r => r.page === 2 && r.rows.length === 1), 0)
    const left = l.shapes.sentence(display(l.shapes), starts, 1, px)
    expect(nth(left, 0).x1).toBeLessThan(100)
    expect(m.shapes.sentence(display(m.shapes), starts, 1, px)).toEqual(left)
    // on the right, what is painted lights what is painted: the sentence on its row, the figure beside it
    const shapes = [0, 1, 2].map(s => m.shapes.runs(0).filter(r => r.page === 2).flatMap(r => m.shapes.sentence(r, starts, s, px)))
    const bad: string[] = []
    for (let x = 40.25; x < 320; x += 1.5) for (let y = 690.25; y < 790; y += 1.5) {
      const ins = shapes.flatMap((rs, s) => (rs.some(r => x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1) ? [s] : []))
      const h = m.shapes.hit(2, x, y, px, startsOf), mine = h?.id === 0 ? h.s : null
      if (ins.length > 1 || (ins.length ? mine !== ins[0] : mine !== null)) bad.push(`${x},${y}: ${ins} ${JSON.stringify(h && { id: h.id, s: h.s })}`)
    }
    expect(bad.slice(0, 5)).toEqual([])
  })
})

describe('SH4: an empty or refused left part', () => {
  it('an empty left part gives no shapes on its page and throws nothing; the other pages are lit', async () => {
    const { parts, lefts } = cutSide(whole, anchors, views)
    const paper = { id: '2608.00001', version: 1 }
    const empty = await writeLeftPart({ paper, page: 2, first: nth(lefts, 2).first, tokens: { perPage: [0], l: [], r: [], y: [], h: [], top: [], bottom: [] }, spans: [], pairs: [] })
    const read = await readLeftPart(empty.bytes, { ref: empty.ref as typeof empty.ref & { page: number }, streamOf: () => 0 })
    const h = createShapes({ kindOf })
    h.addParts(parts)
    h.addPage(nth(lefts, 1))
    expect(() => h.addPage(read)).not.toThrow()
    h.addPage(nth(lefts, 3))
    expect(h.shapes.runs(5).map(r => r.page)).toEqual([3])
    expect(h.shapes.runs(4)).toEqual([])
    expect(h.shapes.hit(2, 300, 700, PAD, () => null)).toBeNull()
    expect(h.starts(5, textOf(5), offsetsOf(5))).toBeNull()
    expect(h.shapes.runs(1).length).toBe(1)
  })

  it('a refused left part: no shapes on its page, one warning however often it is told, no throw; a later one is taken', () => {
    const warn = vi.fn()
    const { parts, lefts } = cutSide(whole, anchors, views)
    const h = createShapes({ kindOf, warn })
    h.addParts(parts)
    h.addPage(nth(lefts, 1))
    expect(() => h.refuse(2, new Error('the left part refused'))).not.toThrow()
    h.refuse(2, new Error('the left part refused'))
    expect(warn).toHaveBeenCalledTimes(1)
    expect(h.shapes.runs(4)).toEqual([])
    expect(h.shapes.runs(1).length).toBe(1)
    h.refuse(3, new Error('the left part refused'))
    expect(warn).toHaveBeenCalledTimes(2)
    h.addPage(nth(lefts, 2))
    expect(h.shapes.runs(4).length).toBe(1)
  })

  it('a left part whose tokens overlap another page\'s is refused with one warning, its page left without shapes', () => {
    const warn = vi.fn()
    const { parts, lefts } = cutSide(whole, anchors, views)
    const h = createShapes({ kindOf, warn })
    h.addParts(parts)
    h.addPage(nth(lefts, 1))
    expect(() => h.addPage({ ...nth(lefts, 2), first: nth(lefts, 2).first - 5 })).not.toThrow()
    expect(warn).toHaveBeenCalledTimes(1)
    expect(h.shapes.runs(4)).toEqual([])
    expect(h.shapes.runs(1).length).toBe(1)
  })

  it('no part yet: nothing lights, nothing throws', () => {
    const h = createShapes({ kindOf })
    expect(h.shapes.runs(1)).toEqual([])
    expect(h.shapes.hit(1, 100, 700, PAD, () => null)).toBeNull()
    expect(h.shapes.click(1, 100, 700, PAD, () => null)).toBeNull()
    expect(h.shapes.float(4)).toBeNull()
    expect(pdfShapes(h.layout).runs(1)).toEqual([])
  })
})
