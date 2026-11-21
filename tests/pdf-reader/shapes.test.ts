import { describe, expect, it, vi } from 'vitest'
import { type Anchor, type DocToken, lineRects, sentenceStarts, tokenizeDocument } from '@/pdf-reader/engine/pipeline/anchors.mjs'
import { readLeftPart, UNIT_ID_MAX, writeLeftPart } from '@/pdf-reader/engine/layer-proto/format.mjs'
import { CELL_ID_FROM, CELLS_PAGE, DISPLAY_ID_FROM, isDisplayBlock, isNameOccurrence, isTableCell, NAME_ID_FROM, NAME_OCCURRENCE_MAX, nameOccurrenceId, tableCellId, tableCellPage } from '@/pdf-reader/engine/layer-proto/units.mjs'
import { PAGES_MAX } from '@/pdf-reader/engine/layout/json.mjs'
import { NAME_FLAG } from '@/pdf-reader/engine/layout/file.mjs'
import { type Box, floatOf, pageFloats } from '@/pdf-reader/engine/view/floats.mjs'
import { blockOf, clickOf, type Layout, layoutOf, pageGeometry, runsOf, sentenceOf } from '@/pdf-reader/engine/view/highlight.mjs'
import { createShapes, layerShapes, leftPageInput, mirror, pdfShapes } from '@/pdf-reader/engine/view/shapes.mjs'
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
/** a unit's float as a pane holds it, its pages' floats made as the seam makes them: on a point asked there (no float is
 *  painted, docs/PDF-READER.md §17.1: the seam tells none) */
const floatThere = (s: { layout: Layout; shapes: { hit: (p: number, x: number, y: number, padX: number, startsOf: () => null) => unknown } }, id: number) => {
  for (const p of s.layout.pagesOf.get(id) ?? []) s.shapes.hit(p, 0, 0, PAD, () => null)
  return floatOf(s.layout, id)
}

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

  it('the right\'s floats are the left\'s; what a point lights and what a click levels by are the right\'s own, equal to the left\'s', () => {
    const f = floatThere(left, 4)
    expect(f).toMatchObject({ id: 4, page: 2, kind: 'table' })
    expect(floatThere(right, 4)).toBe(f)
    const run = nth(right.shapes.runs(1), 0), b = blockOf(run, PAD), x = (b.x0 + b.x1) / 2, y = (b.y0 + b.y1) / 2
    const hit = right.shapes.hit(1, x, y, PAD, () => null)
    expect(hit).toMatchObject({ id: 1, s: -1 })
    expect((hit as { run?: object }).run).not.toBe((left.shapes.hit(1, x, y, PAD, () => null) as { run?: object }).run)
    expect(right.shapes.click(1, x, b.y1 - 1, PAD, () => null)).toEqual(left.shapes.click(1, x, b.y1 - 1, PAD, () => null))
    // a point on the table lights its cell, the same on both panes, never the float (the owner, 2026-10-30); its runs the
    // right's own copies (trap 1)
    const t = nth(doc, doc.findIndex(d => d.page === 2 && d.t === 'beta'))
    const lh = left.shapes.hit(2, t.x + 2, t.y + 3, PAD, () => null), rh = right.shapes.hit(2, t.x + 2, t.y + 3, PAD, () => null)
    expect(lh).toMatchObject({ id: rh?.id, s: -1 })
    expect(isTableCell(lh?.id ?? -1)).toBe(true)
    const [lr] = left.shapes.runs(lh!.id), [rr] = right.shapes.runs(lh!.id)
    expect(rr).not.toBe(lr)
    expect(right.shapes.block(rr!, PAD)).toEqual(left.shapes.block(lr!, PAD))
    expect(right.shapes.runs(lh!.id)[0]).toBe(rr)
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

  it('headings light whole, whatever starts they are given; a caption by sentence, as a body unit (the owner, 2026-10-30)', () => {
    const head = nth(h.shapes.runs(0), 0), b = h.shapes.block(head, PAD)
    expect(h.shapes.hit(1, (b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, PAD, () => Int32Array.of(nth(UNITS.get(0) ?? [], 0)))).toMatchObject({ id: 0, s: -1 })
    // (the caption's second word a sentence's start: its first word lights the first sentence, the rest the second)
    const cap = nth(h.shapes.runs(4), 0), first = nth(cap.rows, 0), st = Int32Array.of(nth(UNITS.get(4) ?? [], 1))
    expect(h.shapes.hit(2, cap.x0 + 2, (first.y0 + first.y1) / 2, PAD, () => st)).toMatchObject({ id: 4, s: 0 })
    expect(h.shapes.hit(2, cap.x1 - 2, (first.y0 + first.y1) / 2, PAD, () => st)).toMatchObject({ id: 4, s: 1 })
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
    const f = floatThere(h, 4)
    expect(h.addPage(nth(lefts, 2))).toBe(false)
    expect(nth(h.shapes.runs(5), 0)).toBe(nth(runs, 0))
    h.addParts(parts)
    h.addParts([nth(parts, 1)])
    expect(nth(h.shapes.runs(5), 0)).toBe(nth(runs, 0))
    expect(floatThere(h, 4)).toBe(f)
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
    expect(floatThere(l, 4)).toBeNull()
    expect(warn).toHaveBeenCalledTimes(1)
    // the later part and pages reached the mirror; the bad inputs are gone, so a later part rethrows nothing
    l.addPage(nth(lefts, 3))
    expect(r.shapes.runs(4).length).toBe(1)
    expect(r.shapes.runs(6).length).toBe(1)
    expect(() => l.addParts(parts)).not.toThrow()
    expect(warn).toHaveBeenCalledTimes(1)
    // the page's floats given again, made of good paths
    l.floats(2)
    expect(floatThere(l, 4)).toMatchObject({ id: 4, kind: 'table' })
  })

  it('a part makes no page again in its own task: floats come back on their next use, from the page\'s geometry made then', () => {
    const h = builtLate()
    h.floats(2)
    expect(floatThere(h, 4)).toMatchObject({ id: 4, kind: 'table' })
    h.addParts([late])
    expect(cacheOf(h.layout).size).toBe(0)
    expect(floatThere(h, 4)).toMatchObject({ id: 4, kind: 'table' })
    expect(cacheOf(h.layout).has(2)).toBe(true)
    // the float the whole layout makes of the same page; the unit told late lit from its page's tokens given before
    const W = layoutOf(doc, views, anchors, kindOf), [f] = pageFloats(W, 2)
    // (its shapes, which the point asked made, aside)
    expect({ ...floatThere(h, 4), shapes: undefined }).toEqual(f)
    expect(h.shapes.runs(6)).toEqual(runsOf(whole, 6))
  })

  it('forget lets a page\'s floats and their inputs go: no part makes them again, the caller gives them again on its redraw', () => {
    const h = builtLate()
    h.floats(2)
    expect(floatThere(h, 4)).not.toBeNull()
    h.forget(2)
    expect(floatThere(h, 4)).toBeNull()
    h.addParts([late])
    expect(cacheOf(h.layout).has(2)).toBe(false)
    expect(floatThere(h, 4)).toBeNull()
    h.floats(2)
    expect(floatThere(h, 4)).toMatchObject({ id: 4, kind: 'table' })
  })
})

describe('the mirror beside a float (the right\'s sentences keep from under the left\'s floats)', () => {
  /** floats.test.ts's paper: the paragraph's sentence goes on from page 1 through a display at the head of page 2 (x
   *  60–85) beside a figure (160–300) whose caption is under it; then the paragraph goes on under the caption */
  function besideFloat() {
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
    const W = layoutOf(d, vs, as, kinds)
    const starts = Int32Array.from([at('begins'), at2('more')])
    return { W, as, vs, kinds, starts, ...cutSide(W, as, vs) }
  }
  const FIGURE = { x0: 160, y0: 745, x1: 300, y1: 790 }

  it('a click that is the first lookup makes the page\'s floats as a hit does, on both panes: after their inputs came before the page, and after a part moved the document part', () => {
    const { W, kinds, starts, parts: P, lefts: Ls } = besideFloat(), startsOf = (i: number) => (i === 0 ? starts : null), px = 2
    // the gap right of the display's ink beside the figure: no sentence paints there, so a click there levels by nothing
    const x = 120, y = 762
    pageFloats(W, 2, [FIGURE])
    expect(clickOf(W, 2, x, y, px, startsOf)).toBeNull()
    // the page's floats given before its part; and the rest unit of page 2 told by a later part, which moves the document part
    const held = P.map(p => ({ ...p, left: p.left.filter(([id]) => id !== 1002) })), late = { ...nth(P, 1), left: nth(P, 1).left.filter(([id]) => id === 1002) }
    const l = createShapes({ kindOf: kinds }), m = mirror(l)
    l.addParts(held)
    l.floats(2, [FIGURE])
    l.addPage(nth(Ls, 1))
    l.addPage(nth(Ls, 2))
    expect(l.shapes.click(2, x, y, px, startsOf)).toBeNull()
    expect(m.shapes.click(2, x, y, px, startsOf)).toBeNull()
    l.addParts([late])
    expect(l.shapes.click(2, x, y, px, startsOf)).toBeNull()
    const l2 = createShapes({ kindOf: kinds }), m2 = mirror(l2)
    l2.addParts(held)
    l2.floats(2, [FIGURE])
    l2.addPage(nth(Ls, 1))
    l2.addPage(nth(Ls, 2))
    l2.addParts([late])
    expect(m2.shapes.click(2, x, y, px, startsOf)).toBeNull()
    // and where a sentence does paint, the click levels by its unit there as the whole layout's does
    expect(l.shapes.click(2, 70, 762, px, startsOf)).toEqual(clickOf(W, 2, 70, 762, px, startsOf))
  })

  it('a display beside a figure, inside a sentence from the page before: the right\'s row keeps to its ink as the left\'s does, and what it paints lights what it paints', () => {
    const { kinds, starts, parts: P, lefts: Ls } = besideFloat()
    const l = createShapes({ kindOf: kinds }), m = mirror(l)
    l.addParts(P)
    l.addPage(nth(Ls, 1))
    l.addPage(nth(Ls, 2))
    l.floats(2, [FIGURE])
    const startsOf = (i: number) => (i === 0 ? starts : null), px = 2
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
    expect(floatThere(h, 4)).toBeNull()
    expect(pdfShapes(h.layout).runs(1)).toEqual([])
  })
})

describe('SH5: the right\'s laid pages, from the layer\'s words (layerShapes)', () => {
  /** page 3's words as the layer gives them: the units `painted` drawn from their left tokens moved down `dy` (the translation's
   *  lines), each token its word's index in the unit and its place; the rest of the page's units shown as the original's (`original`) */
  function wordsOf(page: number, painted: number[], dy = 3) {
    const l = nth(cutSide(whole, anchors, views).lefts, page)
    const ks: number[] = [], spans: [number, number[]][] = [], word: number[] = []
    for (const [id, ranges] of l.spans) {
      if (!painted.includes(id)) continue
      const first = ks.length
      for (let j = 0; j < ranges.length; j += 2) for (let t = nth(ranges, j); t < nth(ranges, j) + nth(ranges, j + 1); t++) { word.push(ks.length - first); ks.push(t) }
      spans.push([id, [first, ks.length - first]])
    }
    const f = (a: Float32Array, d = 0) => Float32Array.from(ks, k => nth([...a], k) + d)
    const T = l.table
    return {
      tokens: { n: ks.length, l: f(T.l), r: f(T.r), y: f(T.y, -dy), h: f(T.h), top: f(T.top, -dy), bottom: f(T.bottom, -dy) },
      // (each token's place in its unit's text, 'text text …': its word's)
      word: Int32Array.from(word), at: Int32Array.from(word, w => 5 * w), spans: spans.reverse(), original: l.spans.map(s => s[0]).filter(id => !painted.includes(id)),
    }
  }
  const BASE = 2 ** 16

  it('lays a page once its left part is in: a unit drawn there runs over its words, a unit shown as the original over copies of the left\'s tokens', () => {
    const { parts, lefts } = cutSide(whole, anchors, views)
    const l = createShapes({ kindOf })
    l.addParts(parts)
    for (const p of [1, 2]) l.addPage(nth(lefts, p))
    const r = layerShapes(l)
    expect(r.lay(3, wordsOf(3, [5]))).toBe(true)
    // (no left part of page 3 yet: nothing of it on either pane)
    expect(r.shapes.runs(6)).toEqual([])
    expect(r.laid(3)).toBe(false)
    l.addPage(nth(lefts, 3))
    expect(r.laid(3)).toBe(true)
    const a = l.shapes.runs(5).filter(x => x.page === 3), b = r.shapes.runs(5).filter(x => x.page === 3)
    expect(b.length).toBe(1)
    expect(nth(b, 0).top).toBeCloseTo(nth(a, 0).top - 3, 4)
    expect(nth(b, 0).x0).toBeCloseTo(nth(a, 0).x0, 4)
    // unit 6 is the original's on the laid page: its boxes the left's, from runs and tokens of the right's own (trap 1)
    const c = l.shapes.runs(6), d = r.shapes.runs(6)
    expect(d.length).toBe(c.length)
    for (let i = 0; i < c.length; i++) { expect(nth(d, i)).not.toBe(nth(c, i)); expect(r.shapes.block(nth(d, i), PAD)).toEqual(l.shapes.block(nth(c, i), PAD)) }
    expect(tablesOf(r.layout)[3]?.l).not.toBe(tablesOf(l.layout)[3]?.l)
    expect(nth(d, 0).toks.every(k => k >= 3 * BASE && k < 4 * BASE)).toBe(true)
    // the pages not laid are the left's mirrored
    for (const id of [1, 2, 3]) expect(r.shapes.runs(id).map(x => r.shapes.block(x, PAD))).toEqual(l.shapes.runs(id).map(x => l.shapes.block(x, PAD)))
    expect(r.shapes.runs(1).every((x, i) => x !== l.shapes.runs(1)[i])).toBe(true)
    // what a point lights on the laid page: the right's own run, on its own lines
    const hb = blockOf(nth(b, 0), PAD)
    expect(r.shapes.hit(3, (hb.x0 + hb.x1) / 2, hb.y0 + 0.5, PAD, () => null)).toMatchObject({ id: 5, s: -1 })
    expect(r.lay(3, wordsOf(3, [5]))).toBe(false)
  })

  it('a copy of the left\'s tokens stands on no other unit\'s row on our page: a line our compile moved across the break lights nothing there, never another unit (the drift the line check draws, 2610.30854v1)', () => {
    const { parts, lefts } = cutSide(whole, anchors, views)
    const l = createShapes({ kindOf })
    l.addParts(parts)
    for (const p of [1, 2, 3]) l.addPage(nth(lefts, p))
    // (unit 6's left tokens on page 3, their box: where our page holds unit 5's row in the first case)
    const left3 = nth(lefts, 3), T = left3.table, ranges = left3.spans.find(([id]) => id === 6)?.[1] ?? []
    const ks: number[] = []
    for (let j = 0; j < ranges.length; j += 2) for (let t = nth(ranges, j); t < nth(ranges, j) + nth(ranges, j + 1); t++) ks.push(t)
    const box = [Math.min(...ks.map(k => nth([...T.l], k))) - 1, Math.min(...ks.map(k => nth([...T.bottom], k))) - 1, Math.max(...ks.map(k => nth([...T.r], k))) + 1, Math.max(...ks.map(k => nth([...T.top], k))) + 1]
    const laid = (rows: [number, number[]][]) => { const r = layerShapes(l); r.lay(3, { ...wordsOf(3, [5]), rows } as never); return r.shapes.runs(6).filter(x => x.page === 3) }
    const all = l.shapes.runs(6).filter(x => x.page === 3).length
    expect(all).toBeGreaterThan(0)
    // (no rows told: every copy, as before; on its own row: kept; on another unit's row alone: none)
    expect(laid([]).length).toBe(all)
    expect(laid([[5, box], [6, box]]).length).toBe(all)
    expect(laid([[5, box]])).toEqual([])
    // (a unit whose rows are all on other pages of ours: its text is not on this one, no copy over the space it leaves either;
    // a unit with no rows on a page whose lines moved: none; on a page whose did not, where no other unit's row stands — Devin on #511)
    expect(laid([[6, []]])).toEqual([])
    const drifted = (rows: [number, number[]][], drift: boolean) => { const r = layerShapes(l); r.lay(3, { ...wordsOf(3, [5]), rows, drift } as never); return r.shapes.runs(6).filter(x => x.page === 3) }
    expect(drifted([], true)).toEqual([])
    expect(drifted([], false).length).toBe(all)
  })

  it('a table\'s cell no unit holds on a laid page: the left\'s copy where it stands on no unit\'s row of ours and the page\'s lines did not move; else nothing there, hit nor run', () => {
    const l = built([1, 2, 3])
    l.floats(2)
    const t = nth(doc, doc.findIndex(d => d.page === 2 && d.t === 'beta')), at = [2, t.x + 2, t.y + 3] as const
    const cellOf = (r: ReturnType<typeof layerShapes>) => r.shapes.hit(...at, PAD, () => null)
    const id = cellOf(layerShapes(l))?.id ?? -1
    expect(isTableCell(id)).toBe(true)
    const laid = (o: { rows?: [number, number[]][]; drift?: boolean }) => { const r = layerShapes(l); r.lay(2, { ...wordsOf(2, [3]), ...o } as never); return r }
    // (laid, its rows elsewhere: the copy, hit and run)
    const plain = laid({ rows: [[3, [50, 700, 550, 740]]] })
    expect([plain.laid(2), cellOf(plain)?.id, plain.shapes.runs(id).length]).toEqual([true, id, 1])
    // (our page's lines moved: none; another unit's row over it: none)
    const drift = laid({ rows: [], drift: true }), over = laid({ rows: [[3, [t.x - 5, t.y - 5, t.x + 30, t.y + 15]]] })
    expect([drift.laid(2), over.laid(2)]).toEqual([true, true])
    expect([cellOf(drift), drift.shapes.runs(id), cellOf(over), over.shapes.runs(id)]).toEqual([null, [], null, []])
  })

  it('a laid page whose lines moved (its line map: 1810.04805v2\'s page 16, our table 30 pt higher than arXiv\'s): its table\'s cells and its copies of the left\'s tokens stand where our page sets them, hit and lit there', () => {
    // (our page 2 every line DY above arXiv's: the line map of arXiv's page 2, an entry a line, [our page, x0, x1, bottom, top,
    // arXiv's page, dx, dy]; the right's drawn words of unit 3 DY above the left's too)
    const DY = 24
    const ys = [...new Set(doc.filter(t => t.page === 2).map(t => t.y))]
    const E = Float64Array.from(ys.flatMap(y => {
      const ts = doc.filter(t => t.page === 2 && t.y === y)
      return [2, Math.min(...ts.map(t => t.x)), Math.max(...ts.map(t => t.x + t.w)), y - 2.2 + DY, y + 7.5 + DY, 2, 0, -DY]
    }))
    const { parts, lefts } = cutSide(whole, anchors, views)
    const l = createShapes({ kindOf })
    l.addParts(parts)
    for (const p of [1, 2, 3]) l.addPage(p === 2 ? { ...nth(lefts, 2), lines: E } as never : nth(lefts, p))
    l.floats(2)
    const beta = (y: number) => nth(doc, doc.findIndex(d => d.page === 2 && d.t === 'beta' && d.y === y))
    const first = beta(560), last = beta(536)
    const id = l.shapes.hit(2, first.x + 2, first.y + 3, PAD, () => null)?.id ?? -1, id3 = l.shapes.hit(2, last.x + 2, last.y + 3, PAD, () => null)?.id ?? -1
    expect([isTableCell(id), isTableCell(id3), id === id3]).toEqual([true, true, false])
    const r = layerShapes(l)
    r.lay(2, { ...wordsOf(2, [3], -DY), rows: [[3, [50, 680 - 2.2 + DY, 550, 740 + 7.5 + DY]]] } as never)
    expect(r.laid(2)).toBe(true)
    // (the first row's cell: hit where our page has it, its run there; at arXiv's place of it, our third row stands: its cell)
    expect(r.shapes.hit(2, first.x + 2, first.y + 3 + DY, PAD, () => null)?.id).toBe(id)
    expect(nth(r.shapes.runs(id), 0).top).toBeCloseTo(nth(l.shapes.runs(id), 0).top + DY, 4)
    expect(r.shapes.hit(2, first.x + 2, first.y + 3, PAD, () => null)?.id).toBe(id3)
    expect(nth(r.shapes.runs(id3), 0).top).toBeCloseTo(nth(l.shapes.runs(id3), 0).top + DY, 4)
    // (a page let go of: its floats as our page sets them with it, made again from the left's on the next point asked)
    const floatsIn = () => (r.layout as unknown as { floats?: Map<number, unknown> }).floats?.has(2) ?? false
    expect(floatsIn()).toBe(true)
    r.forget(2)
    expect(floatsIn()).toBe(false)
    expect(r.shapes.hit(2, first.x + 2, first.y + 3 + DY, PAD, () => null)?.id).toBe(id)
    expect(floatsIn()).toBe(true)
    // (unit 5, shown as the original with no boxes of its own on page 2: its copies of the left's tokens where our page sets them)
    const a = l.shapes.runs(5).filter(x => x.page === 2), b = r.shapes.runs(5).filter(x => x.page === 2)
    expect(b.length).toBe(a.length)
    for (let i = 0; i < a.length; i++) expect(nth(b, i).top).toBeCloseTo(nth(a, i).top + DY, 4)
    // (without the map, or with an empty one, the page in place: the left's places, as before)
    for (const lines of [null, new Float64Array(0)]) {
      const l0 = createShapes({ kindOf })
      l0.addParts(parts)
      for (const p of [1, 2, 3]) l0.addPage(p === 2 ? { ...nth(lefts, 2), lines } as never : nth(lefts, p))
      l0.floats(2)
      const r0 = layerShapes(l0)
      r0.lay(2, { ...wordsOf(2, [3], -DY), rows: [[3, [50, 680 - 2.2 + DY, 550, 740 + 7.5 + DY]]] } as never)
      expect(r0.shapes.hit(2, first.x + 2, first.y + 3, PAD, () => null)?.id, `${lines}`).toBe(id)
      expect(nth(r0.shapes.runs(id), 0).top, `${lines}`).toBeCloseTo(nth(l0.shapes.runs(id), 0).top, 4)
    }
    // (the float moves whole, as most of its cells' lines did: one row's line found elsewhere moves none of it apart; the table's
    // lines in place, the prose's moved: the table stays)
    const rowAt = (m: Float64Array, ok: (top: number) => boolean, f: (m: Float64Array, j: number) => void) => { for (let j = 0; j < m.length; j += 8) if (ok(nth([...m], j + 4) - DY)) f(m, j) }
    const second = beta(548)
    const odd = E.slice()
    rowAt(odd, t => t > 550 && t < 560, (m, j) => { m[j + 7] = -DY - 6 })
    const kept = Float64Array.from([...E].filter((_, i) => { const j = i - (i % 8); return !(nth([...E], j + 4) - DY > 530 && nth([...E], j + 4) - DY < 570) }))
    for (const [m, dy] of [[odd, DY], [kept, 0]] as const) {
      const lm = createShapes({ kindOf })
      lm.addParts(parts)
      for (const p of [1, 2, 3]) lm.addPage(p === 2 ? { ...nth(lefts, 2), lines: m } as never : nth(lefts, p))
      lm.floats(2)
      const rm = layerShapes(lm)
      rm.lay(2, { ...wordsOf(2, [3], -DY), rows: [[3, [50, 680 - 2.2 + DY, 550, 740 + 7.5 + DY]]] } as never)
      const id2 = lm.shapes.hit(2, second.x + 2, second.y + 3, PAD, () => null)?.id ?? -1
      expect(isTableCell(id2)).toBe(true)
      expect(nth(rm.shapes.runs(id2), 0).top, `${dy}`).toBeCloseTo(nth(lm.shapes.runs(id2), 0).top + dy, 4)
      expect(rm.shapes.hit(2, second.x + 2, second.y + 3 + dy, PAD, () => null)?.id, `${dy}`).toBe(id2)
    }
    // (the table's lines our page 3's, by the map: none of the float on our page 2, its cells lit on the left alone, never a wrong place)
    const away = E.slice()
    for (let j = 0; j < away.length; j += 8) if (nth([...away], j + 4) - DY > 530 && nth([...away], j + 4) - DY < 570) away[j] = 3
    const l3 = createShapes({ kindOf })
    l3.addParts(parts)
    for (const p of [1, 2, 3]) l3.addPage(p === 2 ? { ...nth(lefts, 2), lines: away } as never : nth(lefts, p))
    l3.floats(2)
    const r3 = layerShapes(l3)
    r3.lay(2, { ...wordsOf(2, [3], -DY), rows: [[3, [50, 680 - 2.2 + DY, 550, 740 + 7.5 + DY]]] } as never)
    expect(l3.shapes.hit(2, first.x + 2, first.y + 3, PAD, () => null)?.id).toBe(id)
    expect([r3.shapes.runs(id), isTableCell(r3.shapes.hit(2, first.x + 2, first.y + 3 + DY, PAD, () => null)?.id ?? -1), isTableCell(r3.shapes.hit(2, first.x + 2, first.y + 3, PAD, () => null)?.id ?? -1)]).toEqual([[], false, false])
  })

  it('a muted page (another target\'s layer kept there) lights and hits nothing, its table\'s cells included; unmuted, as before', () => {
    const l = built([1, 2, 3])
    l.floats(2)
    const r = layerShapes(l)
    const t = nth(doc, doc.findIndex(d => d.page === 2 && d.t === 'beta')), cellAt = () => r.shapes.hit(2, t.x + 2, t.y + 3, PAD, () => null)
    const cell = cellAt()
    expect(isTableCell(cell?.id ?? -1)).toBe(true)
    const [own] = r.shapes.runs(cell!.id)
    // (the hit's run the right's own, as the paint's: never the left's, trap 1)
    expect((cell as { run?: object }).run).toBe(own)
    expect(own).not.toBe(l.shapes.runs(cell!.id)[0])
    const run1 = nth(r.shapes.runs(1), 0), b = blockOf(run1, PAD)
    expect(r.mute(2, true)).toBe(true)
    expect(r.mute(1, true)).toBe(true)
    expect(r.muted()).toEqual([1, 2])
    expect(cellAt()).toBeNull()
    expect(r.shapes.runs(cell!.id)).toEqual([])
    expect(r.shapes.runs(1)).toEqual([])
    expect(r.shapes.hit(1, (b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, PAD, () => null)).toBeNull()
    expect(r.mute(2, false)).toBe(true)
    expect(cellAt()).toEqual(cell)
    expect(r.shapes.runs(cell!.id)).toEqual([own])
  })

  it('gives the right\'s starts of a unit all on laid pages from its words, the left\'s of a unit on none, none of a unit on both', () => {
    const l = built([1, 2, 3]), r = layerShapes(l)
    r.lay(3, wordsOf(3, [6]))
    const n6 = (UNITS.get(6) ?? []).length, text = Array.from({ length: n6 }, () => 'text').join(' ')
    const offsets = [10, 30].map(w => 5 * w)
    const st = r.starts(6, text, offsets, null)
    expect(st && [...st]).toEqual([3 * BASE + 10, 3 * BASE + 30])
    expect(r.shapes.fits(6, st as Int32Array, true)).toBe(true)
    const run = nth(r.shapes.runs(6), 0), first = nth(run.rows, 0), b = blockOf(run, PAD)
    expect(r.shapes.hit(3, b.x0 + 5, (first.y0 + first.y1) / 2, PAD, id => (id === 6 ? st : null))).toMatchObject({ id: 6, s: 0 })
    // unit 5: page 2 shown as the original, page 3 laid: no starts on the right; unit 1, on no laid page: the left's
    expect(r.starts(5, textOf(5), offsetsOf(5), wholeStarts.get(5) ?? null)).toBeNull()
    expect(r.starts(1, textOf(1), offsetsOf(1), wholeStarts.get(1) ?? null)).toBe(wholeStarts.get(1))
    // a start no token carries the word of: none
    expect(r.starts(6, text, [5 * (n6 + 3)].filter(o => o < text.length).concat([text.length - 1]), null)).toBeNull()
  })

  it('a page laid as the left draws it gives the left\'s runs and heads: a unit takes its head from its own first token there (its stream)', () => {
    const l = built([1, 2, 3]), r = layerShapes(l), left = nth(cutSide(whole, anchors, views).lefts, 1), T = left.table
    // every token of page 1 drawn where the left has it, the heading's number (no unit's) among them, each unit's spans the left's
    const copy = (a: Float32Array) => Float32Array.from(a)
    r.lay(1, { tokens: { n: T.n, l: copy(T.l), r: copy(T.r), y: copy(T.y), h: copy(T.h), top: copy(T.top), bottom: copy(T.bottom) }, word: new Int32Array(T.n).fill(-1), spans: left.spans.map(([id, rs]) => [id, [...rs]]), original: [] })
    expect(r.laid(1)).toBe(true)
    expect(pageGeometry(r.layout, 1).heads).toEqual([0])
    for (const id of [0, 1, 2, 3]) expect(r.shapes.runs(id).filter(x => x.page === 1).map(x => r.shapes.block(x, PAD))).toEqual(l.shapes.runs(id).filter(x => x.page === 1).map(x => l.shapes.block(x, PAD)))
  })

  it('reset lays every page again from the words given after it', () => {
    const l = built([1, 2, 3]), r = layerShapes(l)
    r.lay(3, wordsOf(3, [6]))
    const toks = nth(r.shapes.runs(6), 0).toks
    expect(r.starts(6, 'text text', [5], null) && true).toBe(true)
    r.reset()
    expect(r.laid(3)).toBe(false)
    expect(r.shapes.runs(6).map(x => r.shapes.block(x, PAD))).toEqual(l.shapes.runs(6).map(x => l.shapes.block(x, PAD)))
    r.lay(3, wordsOf(3, [6], 5))
    expect(nth(r.shapes.runs(6), 0).toks).toEqual(toks)
    expect(nth(r.shapes.runs(6), 0).top).toBeCloseTo(nth(l.shapes.runs(6), 0).top - 5, 4)
  })
})

describe('a drawing\'s text (a figure\'s labels) no layout holds: its pairing measured not free (the owner, 2026-10-30)', () => {
  it('its left entries and its spans left out, where it stands kept for its float; the mirror and a laid page hold none either; the whole layout the same (SH1)', () => {
    const { parts, lefts } = cutSide(whole, anchors, views)
    const kinds = (id: number) => (id === 6 ? 'inkfigures' : kindOf(id))
    const l = createShapes({ kindOf: kinds })
    l.addParts(parts)
    for (const p of [1, 2, 3]) l.addPage(nth(lefts, p))
    const r = layerShapes(l)
    expect([l.shapes.runs(6), mirror(l).shapes.runs(6), r.shapes.runs(6)]).toEqual([[], [], []])
    expect((l.layout as unknown as { told: Map<number, unknown> }).told.has(6)).toBe(false)
    const drawings = (l.layout as unknown as { drawings?: Map<number, Box[]> }).drawings
    expect(drawings?.get(3)?.length).toBeGreaterThan(0)
    // (every unit as the whole layout of the same kinds has it, the drawing's text none there either)
    const same = layoutOf(doc, views, anchors, kinds)
    expect((same as unknown as { drawings: Map<number, Box[]> }).drawings).toEqual(drawings)
    for (const id of [0, 1, 2, 3, 4, 5, 6]) expect(l.shapes.runs(id).map(x => l.shapes.block(x, PAD))).toEqual(runsOf(same, id).map(x => blockOf(x, PAD)))
  })
})

describe("babel's names light as headings on both panes, under ids no bundle id reaches (2010.11929v2 p9's References, whose Chinese lit nothing)", () => {
  // (a name the layout file locates on page 2 — its occurrence 7, its box over the table's first "alpha", a word no unit holds —
  // carried in a part's layout as the wire carries it: [occurrence, key, page, x0, baseline, x1, top, bottom, size, font, flags,
  // unit, glue, column x0, column x1])
  const OCC = 7, ID = nameOccurrenceId(OCC) as number
  const alpha = doc.findIndex(t => t.page === 2 && t.t === 'alpha')
  const a = nth(doc, alpha)
  const nameRow = (flags = 0) => [OCC, 1, 2, a.x - 1, 560, a.x + a.w + 1, 569, 557, 10, 0, flags, flags & NAME_FLAG.RUN_IN ? 4 : -1, 0, 50, 550]
  const namesPart = (flags = 0) => ({ pages: [2], views: [], left: [], layout: { names: [nameRow(flags)] } })
  const centre = (h: ReturnType<typeof createShapes> | ReturnType<typeof mirror>) => { const b = blockOf(nth(h.shapes.runs(ID), 0), PAD); return [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2] as const }

  it('an occurrence\'s id is past every id a bundle holds, a late chunk\'s included, and below the view\'s Int32 owners', () => {
    expect(NAME_ID_FROM).toBeGreaterThan(UNIT_ID_MAX)
    expect(nameOccurrenceId(0)).toBe(NAME_ID_FROM)
    expect(nameOccurrenceId(NAME_OCCURRENCE_MAX)).toBe(DISPLAY_ID_FROM - 1)
    // (and the displays' range after it, then the tables' cells' to 2^31: none meets another)
    expect([isNameOccurrence(DISPLAY_ID_FROM), isDisplayBlock(DISPLAY_ID_FROM - 1), isDisplayBlock(CELL_ID_FROM), isTableCell(CELL_ID_FROM - 1), tableCellId(PAGES_MAX, CELLS_PAGE - 1)! < 2 ** 31]).toEqual([false, false, false, false, true])
    // (every page the id takes decodes to itself, the last one too: 2^14 − 1 pages past PAGES_MAX, below 2^31)
    for (const [p, k] of [[1, 0], [PAGES_MAX, CELLS_PAGE - 1], [2 ** 14 - 1, CELLS_PAGE - 1]] as const) { const id = tableCellId(p, k)!; expect([isTableCell(id), tableCellPage(id), id < 2 ** 31]).toEqual([true, p, true]) }
    expect([tableCellId(2 ** 14, 0), tableCellId(0, 0), tableCellId(1, CELLS_PAGE)]).toEqual([null, null, null])
    for (const bad of [-1, 1.5, NAME_OCCURRENCE_MAX + 1, Number.NaN]) expect(nameOccurrenceId(bad)).toBeNull()
    expect(isNameOccurrence(UNIT_ID_MAX)).toBe(false)
  })

  it('on the left by its page\'s tokens in its box, as a heading lit whole, whether its row or its page comes first', () => {
    const { parts, lefts } = cutSide(whole, anchors, views)
    for (const rowFirst of [true, false]) {
      const h = createShapes({ kindOf })
      h.addParts(parts)
      if (rowFirst) h.addParts([namesPart() as never])
      for (const p of [1, 2, 3]) h.addPage(nth(lefts, p))
      if (!rowFirst) h.addParts([namesPart() as never])
      const runs = h.shapes.runs(ID)
      expect(runs.map(r => r.page)).toEqual([2])
      expect(nth(runs, 0).toks).toEqual([alpha])
      const [x, y] = centre(h)
      expect(h.shapes.hit(2, x, y, PAD, () => Int32Array.of(alpha))).toMatchObject({ id: ID, s: -1 })
      // (the units as before)
      for (const id of UNITS.keys()) expect(h.shapes.runs(id).map(r => h.shapes.block(r, PAD))).toEqual(runsOf(whole, id).map(r => blockOf(r, PAD)))
      // (and the mirror, the right of a page shown as the original, lights it too, from its own runs)
      const m = mirror(h)
      expect(m.shapes.runs(ID).map(r => m.shapes.block(r, PAD))).toEqual(runs.map(r => h.shapes.block(r, PAD)))
    }
  })

  it('never one that leads a unit (RUN_IN: IEEEtran\'s "Abstract—"), which lights with that unit', () => {
    const { parts, lefts } = cutSide(whole, anchors, views)
    const h = createShapes({ kindOf })
    h.addParts([...parts, namesPart(NAME_FLAG.RUN_IN) as never])
    for (const p of [1, 2, 3]) h.addPage(nth(lefts, p))
    expect(h.shapes.runs(ID)).toEqual([])
  })

  it('apart from every unit of a bundle that grows after the reader opened (a late chunk\'s units after the head\'s)', () => {
    const { parts, lefts } = cutSide(whole, anchors, views)
    const kinds = new Map<number, string>()
    const h = createShapes({ kindOf: id => kinds.get(id) ?? kindOf(id) })
    h.addParts([...parts, namesPart() as never])
    for (const p of [1, 2, 3]) h.addPage(nth(lefts, p))
    // (a unit the late chunk adds, its id the next the bundle had, on the table's second word: told by a later part)
    const late = 7, beta = doc.findIndex(t => t.page === 2 && t.t === 'beta')
    kinds.set(late, 'figure')
    h.addParts([{ pages: [2], views: [], left: [[late, beta, [[2, nth(doc, beta).x, 557, nth(doc, beta).x + nth(doc, beta).w, 569]]]] } as never])
    expect(late).not.toBe(ID)
    expect(nth(h.shapes.runs(ID), 0).toks).toEqual([alpha])
    const [x, y] = centre(h)
    expect(h.shapes.hit(2, x, y, PAD, () => null)).toMatchObject({ id: ID, s: -1 })
  })

  it('on a laid page by the words the layer drew of it under its id, and lit on both panes', () => {
    const { parts, lefts } = cutSide(whole, anchors, views)
    const l = createShapes({ kindOf })
    l.addParts([...parts, namesPart() as never])
    const r = layerShapes(l)
    // (page 2 laid: the name drawn where the original's was, one token, its span under the occurrence's id, as run.mjs writes it)
    const T = { n: 1, l: Float32Array.of(a.x), r: Float32Array.of(a.x + 20), y: Float32Array.of(560), h: Float32Array.of(10), top: Float32Array.of(568.8), bottom: Float32Array.of(558.8) }
    expect(r.lay(2, { tokens: T, word: Int32Array.of(-1), at: Int32Array.of(-1), spans: [[ID, [0, 1]]], original: [] } as never)).toBe(true)
    for (const p of [1, 2, 3]) l.addPage(nth(lefts, p))
    expect(r.laid(2)).toBe(true)
    const runs = r.shapes.runs(ID)
    expect(runs.map(x => x.page)).toEqual([2])
    const b = blockOf(nth(runs, 0), PAD)
    expect(r.shapes.hit(2, (b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, PAD, () => null)).toMatchObject({ id: ID, s: -1 })
    // (its first token there its stream, though the name was told after the page laid)
    expect(nth(runs, 0).toks).toEqual([2 * 2 ** 16])
    expect(l.shapes.runs(ID).map(x => x.page)).toEqual([2])
  })

  it('on a laid page where the layer left it the original\'s (no word, unfit): lit and hit there as the left\'s, whenever its row came (Codex and Devin on #493)', () => {
    const { parts, lefts } = cutSide(whole, anchors, views)
    // (page 2 laid with nothing drawn of the name: its id among the page's units shown as the original, as run.mjs freezes it)
    const kept = { tokens: { n: 0, l: new Float32Array(0), r: new Float32Array(0), y: new Float32Array(0), h: new Float32Array(0), top: new Float32Array(0), bottom: new Float32Array(0) }, word: new Int32Array(0), at: new Int32Array(0), spans: [], original: [ID] }
    for (const rowFirst of [true, false]) {
      const l = createShapes({ kindOf })
      l.addParts(parts)
      if (rowFirst) l.addParts([namesPart() as never])
      const r = layerShapes(l)
      for (const p of [1, 2, 3]) l.addPage(nth(lefts, p))
      expect(r.lay(2, kept as never)).toBe(true)
      expect(r.laid(2)).toBe(true)
      if (!rowFirst) l.addParts([namesPart() as never])
      const left = l.shapes.runs(ID).map(x => l.shapes.block(x, PAD)), right = r.shapes.runs(ID).map(x => r.shapes.block(x, PAD))
      expect(right).toEqual(left)
      expect(right.length).toBe(1)
      const b = nth(right, 0)
      expect(r.shapes.hit(2, (b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, PAD, () => null)).toMatchObject({ id: ID, s: -1 })
      // (a unit of the page's that the layer did not keep stays unlit where nothing of the drawing is: the mirror's units no answer)
      const u4 = nth(l.shapes.runs(4), 0), c = l.shapes.block(u4, PAD)
      expect(r.shapes.hit(2, (c.x0 + c.x1) / 2, (c.y0 + c.y1) / 2, PAD, () => null)?.id).not.toBe(4)
    }
  })
})

describe('a table\'s cell unit the left part does not locate is told by its layout lines, and pairs on both panes (the release sweep of ba433da8)', () => {
  // (production locates few cells on arXiv's PDF, their text too short for the anchors: 7 of 2010.11929v2's 165, 2 of
  // 2610.35877v1's 71; while a cell lit its whole table nothing showed it, and since #513 its pane's words were a cell of their
  // own on the left, a page's id, and nothing on the right, which tells the units the left tells)
  const beta = doc.findIndex(t => t.page === 2 && t.t === 'beta' && Math.abs(t.y - 560) < 1)
  const B = nth(doc, beta)
  const kinds = (id: number) => (id === 9 ? 'cell' : kindOf(id))
  /** the parts as the wire carries them, the part of page 2 with the layout's lines of cell 9 (page, x0, x1, baseline, top,
   *  bottom, size, font), which its left does not hold */
  function side() {
    const { parts, lefts } = cutSide(whole, anchors, views)
    const withLines = parts.map(p => (p.pages[0] <= 2 && p.pages[1] >= 2 ? { ...p, layout: { names: [], lines: [[9, [2, B.x, B.x + B.w, B.y, B.top, B.bottom, 10, 0]]] } } : p))
    const l = createShapes({ kindOf: kinds })
    l.addParts(withLines as never)
    for (const p of [1, 2, 3]) l.addPage(nth(lefts, p))
    l.floats(2)
    return { l, left2: nth(lefts, 2) }
  }
  const at = [2, B.x + 2, (B.top + B.bottom) / 2] as const

  it('the left: the tokens of its page in its lines\' boxes, its id under the pointer, never a cell of the page\'s', () => {
    const { l } = side()
    expect(l.shapes.hit(...at, PAD, () => null)?.id).toBe(9)
    expect(l.shapes.runs(9).map(r => r.page)).toEqual([2])
    // (the mirror too: the right where its page shows the original)
    const m = mirror(l)
    expect([m.shapes.hit(...at, PAD, () => null)?.id, m.shapes.runs(9).length]).toEqual([9, 1])
  })

  it('its lines come after its page (a part late): told then, on the left and on a mirror made before (Codex on #515, its doubt checked)', () => {
    const { parts, lefts } = cutSide(whole, anchors, views)
    const l = createShapes({ kindOf: kinds }), m = mirror(l)
    l.addParts(parts)
    for (const p of [1, 2, 3]) l.addPage(nth(lefts, p))
    l.floats(2)
    expect(isTableCell(l.shapes.hit(...at, PAD, () => null)?.id ?? -1)).toBe(true)
    l.addParts([{ pages: [2, 2], views: [], left: [], layout: { names: [], lines: [[9, [2, B.x, B.x + B.w, B.y, B.top, B.bottom, 10, 0]]] } }] as never)
    expect([l.shapes.hit(...at, PAD, () => null)?.id, m.shapes.hit(...at, PAD, () => null)?.id, m.shapes.runs(9).length]).toEqual([9, 9, 1])
  })

  it('a left part refused tells none of its cells; the good one that comes later tells them', () => {
    const { parts, lefts } = cutSide(whole, anchors, views)
    const withLines = parts.map(p => (p.pages[0] <= 2 && p.pages[1] >= 2 ? { ...p, layout: { names: [], lines: [[9, [2, B.x, B.x + B.w, B.y, B.top, B.bottom, 10, 0]]] } } : p))
    const warn = vi.fn(), l = createShapes({ kindOf: kinds, warn })
    l.addParts(withLines as never)
    l.addPage(nth(lefts, 1))
    expect(l.addPage({ ...nth(lefts, 2), first: nth(lefts, 2).first - 5 })).toBe(false)
    expect(l.shapes.runs(9)).toEqual([])
    expect(l.addPage(nth(lefts, 2))).toBe(true)
    l.floats(2)
    expect([l.shapes.hit(...at, PAD, () => null)?.id, l.shapes.runs(9).length]).toEqual([9, 1])
  })

  it('its lines come after its page, and a mirror is made after them, a page laid after them: both hold the cell\'s tokens (cloud Codex on #515)', () => {
    const { parts, lefts } = cutSide(whole, anchors, views)
    const l = createShapes({ kindOf: kinds })
    l.addParts(parts)
    for (const p of [1, 2, 3]) l.addPage(nth(lefts, p))
    l.floats(2)
    l.addParts([{ pages: [2, 2], views: [], left: [], layout: { names: [], lines: [[9, [2, B.x, B.x + B.w, B.y, B.top, B.bottom, 10, 0]]] } }] as never)
    const left = l.shapes.runs(9).map(r => r.toks?.length ?? r.rows.length)
    const m = mirror(l)
    expect([m.shapes.runs(9).length, m.shapes.hit(...at, PAD, () => null)?.id]).toEqual([1, 9])
    expect(m.shapes.block(nth(m.shapes.runs(9), 0), PAD)).toEqual(l.shapes.block(nth(l.shapes.runs(9), 0), PAD))
    // (page 2 laid after, every unit there the original's, the cell too: its copies of the left's tokens)
    const r = layerShapes(l), left2 = nth(lefts, 2)
    r.lay(2, { tokens: { n: 0, l: new Float32Array(), r: new Float32Array(), y: new Float32Array(), h: new Float32Array(), top: new Float32Array(), bottom: new Float32Array() }, word: new Int32Array(), at: new Int32Array(), spans: [], original: [...left2.spans.map(s => s[0]), 9] } as never)
    expect(r.laid(2)).toBe(true)
    expect([r.shapes.runs(9).length, r.shapes.hit(...at, PAD, () => null)?.id]).toEqual([1, 9])
    expect(left).toEqual(l.shapes.runs(9).map(x => x.toks?.length ?? x.rows.length))
  })

  it('a cell whose lines run onto the next page keeps its words on both pages (Devin on #515)', () => {
    // (unit 6 left out of the side, its words on page 3 free: cell 9 the beta of page 2 and the first word of page 3's lines 5-9)
    const a6 = new Map([...anchors].filter(([id]) => id !== 6)), w6 = layoutOf(doc, views, a6, kinds)
    const c3 = nth(doc, nth(UNITS.get(6) ?? [], 0))
    const { parts, lefts } = cutSide(w6, a6, views)
    const lines9 = [2, B.x, B.x + B.w, B.y, B.top, B.bottom, 10, 0, 3, c3.x, c3.x + c3.w, c3.y, c3.top, c3.bottom, 10, 0]
    const withLines = parts.map((p, i) => (i === 0 ? { ...p, layout: { names: [], lines: [[9, lines9]] } } : p))
    for (const order of [[1, 2, 3], [3, 2, 1]]) {
      const l = createShapes({ kindOf: kinds })
      l.addParts(withLines as never)
      for (const p of order) l.addPage(nth(lefts, p))
      expect(l.shapes.runs(9).map(r => r.page).sort()).toEqual([2, 3])
      const m = mirror(l)
      expect(m.shapes.runs(9).map(r => r.page).sort()).toEqual([2, 3])
    }
  })

  it('every other unit keeps its runs on both panes, though the cell\'s lines would vote its page into two columns (2610.22195v1 p18)', () => {
    // (cell 9 with eight lines a third of the page wide besides its own, four in each half of page 2: long lines the column vote counts;
    // on the page's own rows, so that the page is in place, the cell told by its boxes)
    const wide = [0, 1, 2, 3].flatMap(i => [[2, 60, 260, 436 - 12 * i, 443.5 - 12 * i, 433.8 - 12 * i, 10, 0], [2, 330, 530, 436 - 12 * i, 443.5 - 12 * i, 433.8 - 12 * i, 10, 0]]).flat()
    const { parts, lefts } = cutSide(whole, anchors, views)
    const withLines = parts.map(p => (p.pages[0] <= 2 && p.pages[1] >= 2 ? { ...p, layout: { names: [], lines: [[9, [2, B.x, B.x + B.w, B.y, B.top, B.bottom, 10, 0, ...wide]]] } } : p))
    const l = createShapes({ kindOf: kinds }), m = mirror(l)
    l.addParts(withLines as never)
    for (const p of [1, 2, 3]) l.addPage(nth(lefts, p))
    expect(l.shapes.runs(9).length).toBeGreaterThan(0)
    const plain = built([1, 2, 3])
    for (const id of [0, 1, 2, 3, 4, 5, 6]) {
      expect(l.shapes.runs(id).map(r => blockOf(r, PAD))).toEqual(plain.shapes.runs(id).map(r => blockOf(r, PAD)))
      expect(m.shapes.runs(id).map(r => blockOf(r, PAD))).toEqual(plain.shapes.runs(id).map(r => blockOf(r, PAD)))
    }
  })

  it('the right on a laid page: the words the layer drew of it, its id under the pointer, so either pane lights both', () => {
    const { l, left2 } = side()
    const r = layerShapes(l)
    // (page 2 laid with the cell's word drawn, its token the left's copied 3 lower, the other units the original's)
    const k = beta - left2.first, T = left2.table, f = (a: Float32Array, d = 0) => Float32Array.from([nth([...a], k) + d])
    r.lay(2, { tokens: { n: 1, l: f(T.l), r: f(T.r), y: f(T.y, -3), h: f(T.h), top: f(T.top, -3), bottom: f(T.bottom, -3) }, word: Int32Array.from([0]), at: Int32Array.from([0]), spans: [[9, [0, 1]]], original: left2.spans.map(s => s[0]) } as never)
    expect(r.laid(2)).toBe(true)
    expect(r.shapes.hit(2, B.x + 2, (B.top + B.bottom) / 2 - 3, PAD, () => null)?.id).toBe(9)
    expect(r.shapes.runs(9).length).toBe(1)
  })
})
