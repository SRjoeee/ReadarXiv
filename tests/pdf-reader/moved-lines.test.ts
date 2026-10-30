import { describe, expect, it } from 'vitest'
import { displayBlockId } from '@/pdf-reader/engine/layer-proto/units.mjs'
import { LINES_MAX, MOVED_STRIDE, readLeftPart, writeLeftPart } from '@/pdf-reader/engine/layer-proto/format.mjs'
import { LABEL_KINDS, PH_FLAG, PH_KINDS } from '@/pdf-reader/engine/layout/file.mjs'
import { type Anchor, type DocToken, lineRects, tokenizeDocument } from '@/pdf-reader/engine/pipeline/anchors.mjs'
import { MAP_FOUND, movedLinesOf } from '@/pdf-reader/engine/pipeline/moved-lines.mjs'
import { blockOf, layoutOf } from '@/pdf-reader/engine/view/highlight.mjs'
import { createShapes, mirror } from '@/pdf-reader/engine/view/shapes.mjs'
import { cutSide } from '../../lab/pdf/spikes/highlight-pages.mjs'

// A moved page (M2 of the unified light; the owner's ruling of 2026-10-30): our compile set the page otherwise than arXiv's (another
// TeX Live's glue, a line carried over a break: 1810.04805v2's page 16, its lines 3 to 27 pt off), so the maker's boxes of our page
// stand beside arXiv's lines and the left lit only what the anchors located. The line check's pairs, shipped in the left part
// (pipeline/moved-lines.mjs, BUNDLE 12), carry each box onto arXiv's page by the line it stands on, and the page is told by its boxes
// as a page in place is.

// ---------------------------------------------------------------- the producer: the line map of the line check
describe('movedLinesOf: our lines that stand elsewhere on arXiv\'s page', () => {
  const tok = (page: number, x: number, y: number, t = 'w'): DocToken => ({ t, page, x, y, w: 40, h: 10, top: y + 8, bottom: y - 2 })
  type Partner = { page: number; dx: number; dy: number } | null
  const ours: DocToken[] = [], lineAt: Partner[] = []
  const line = (page: number, x: number, y: number, p: Partner) => { ours.push(tok(page, x, y)); lineAt.push(p) }
  // (page 1: two lines in place. Page 2: a column of 30 lines, the first 10 pt off, the next two of no partner, the rest 30 pt off,
  // and a line in the other column of no partner and no neighbour found: 28 of 31 found. Page 3: a line arXiv sets on page 4,
  // whose line stands in place; page 5: one arXiv sets on page 6, where our compile set none. Page 7: four lines the check found
  // no partner for, their words arXiv's but rebroken)
  line(1, 50, 700, { page: 1, dx: 0, dy: 0 }); line(1, 50, 688, { page: 1, dx: 0.2, dy: 0 })
  for (let i = 0; i < 30; i++) line(2, 50, 700 - 10 * i, i === 1 || i === 2 ? null : { page: 2, dx: 0.5, dy: i === 0 ? -10 : -30 })
  line(2, 400, 500, null)
  line(3, 50, 100, { page: 4, dx: 0, dy: 600 }); line(4, 50, 500, { page: 4, dx: 0, dy: 0 }); line(5, 50, 100, { page: 6, dx: 0, dy: 600 })
  for (let i = 0; i < 4; i++) line(7, 50, 700 - 20 * i, null)
  const check = { lineAt, inPlace: Uint8Array.from(lineAt.map((p, l) => (p && p.page === ours[l]!.page && Math.abs(p.dx) <= 0.5 && Math.abs(p.dy) <= 0.5 ? 1 : 0))), tokenLine: Int32Array.from(ours.map((_, k) => k)) }
  const map = movedLinesOf(check, ours)
  const entries = (q: number) => { const e = map.get(q) ?? []; return Array.from({ length: e.length / MOVED_STRIDE }, (_, j) => e.slice(j * MOVED_STRIDE, (j + 1) * MOVED_STRIDE)) }
  const dyOf = (q: number, y: number) => entries(q).find(e => e[3] === y - 2)?.[7]

  it('a page in place has an empty list; a moved line its offset, a line of no partner its column\'s nearest found line\'s', () => {
    expect(map.get(1)).toEqual([])
    expect(entries(2).length).toBe(30)
    expect(entries(2)[0]).toEqual([2, 50, 90, 698, 708, 2, 0.5, -10])
    expect(dyOf(2, 690)).toBe(-10)
    // (the second line of no partner is nearer the line 30 pt off than the one 10 pt off: never the offset its neighbour took)
    expect(dyOf(2, 680)).toBe(-30)
    expect(entries(2).some(e => e[1] === 400)).toBe(false)
  })
  it('a line carried onto another page is on both pages\' lists where that page has one; on its own alone where it has none', () => {
    expect(entries(3)).toEqual([[3, 50, 90, 98, 108, 4, 0, 600]])
    expect(entries(4)).toEqual(entries(3))
    expect(entries(5)).toEqual([[5, 50, 90, 98, 108, 6, 0, 600]])
    expect(map.has(6)).toBe(false)
  })
  it('a page whose lines the check did not find has none: its words arXiv\'s, its lines rebroken (judged by its tokens)', () => {
    expect(map.has(7)).toBe(false)
  })
  it('no line check, no map', () => {
    expect(movedLinesOf(null, ours).size).toBe(0)
  })
  it('a page past the check\'s work, or not drawn, has none', () => {
    const pages = [1, 2, 3, 4, 5, 7].map(page => ({ page, drawable: page !== 3 }))
    const m = movedLinesOf({ ...check, pages, over: [2] }, ours)
    expect([...m.keys()].sort()).toEqual([1, 4, 5])
    expect(m.get(4)).toEqual([])
  })
  it(`a page has a list where ${MAP_FOUND * 100} % of its lines found a partner, and none under`, () => {
    const at = (n: number, found: number) => {
      const o = Array.from({ length: n }, (_, i) => tok(1, 50, 700 - 12 * i))
      return movedLinesOf({ lineAt: o.map((_, i) => (i < found ? { page: 1, dx: 0, dy: 0 } : null)), inPlace: Uint8Array.from(o.map((_, i) => (i < found ? 1 : 0))), tokenLine: Int32Array.from(o.map((_, k) => k)) }, o).has(1)
    }
    expect(at(10, 9)).toBe(true)
    expect(at(10, 8)).toBe(false)
  })
})

// ---------------------------------------------------------------- the wire: a left part's `lines` (BUNDLE 12)
describe('a left part\'s line map on the wire', () => {
  const PAPER = { id: '2610.00001', version: 1 }
  const tokens = { perPage: [1], l: [50000], r: [40000], y: [700000], h: [10000], top: [708000], bottom: [698000] }
  const E = [1, 50, 550, 735.8, 745.5, 1, 0, -40]
  const left = async (o: object) => writeLeftPart({ paper: PAPER, page: 1, first: 0, tokens, spans: [], pairs: [], ...o })
  const read = (w: { bytes: Uint8Array; ref: unknown }) => readLeftPart(w.bytes, { ref: w.ref as never, streamOf: () => undefined })
  it('written where the page has one, read back as written; none written, none read', async () => {
    const w = await left({ lines: E })
    expect(Array.from((await read(w)).lines!)).toEqual(E)
    const none = await left({})
    expect(new TextDecoder().decode(none.bytes)).not.toContain('"lines"')
    expect((await read(none)).lines).toBeNull()
    // (a page checked where none of its lines moved: an empty map, read as one)
    expect(Array.from((await read(await left({ lines: [] }))).lines!)).toEqual([])
  })
  it('refused where it is no map: an entry short, a page of none, a box out of order, more than LINES_MAX entries', async () => {
    const edit = async (lines: unknown) => {
      const w = await left({ lines: E })
      const text = new TextDecoder().decode(w.bytes).replace(JSON.stringify(E), JSON.stringify(lines))
      const bytes = new TextEncoder().encode(text)
      const { createHash } = await import('node:crypto')
      return readLeftPart(bytes, { ref: { ...(w.ref as object), sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length } as never, streamOf: () => undefined })
    }
    for (const bad of [E.slice(0, 7), [0, ...E.slice(1)], [1, 550, 50, ...E.slice(3)], Array.from({ length: (LINES_MAX + 1) * MOVED_STRIDE }, (_, k) => E[k % MOVED_STRIDE])]) await expect(edit(bad)).rejects.toThrow()
  })
  it('a left part of 11 is read, with no line map; one of 11 with a line map is refused', async () => {
    const { createHash } = await import('node:crypto')
    const as11 = async (lines: boolean) => {
      const w = await left(lines ? { lines: E } : {})
      const bytes = new TextEncoder().encode(new TextDecoder().decode(w.bytes).replace('"bundle":"12"', '"bundle":"11"'))
      return readLeftPart(bytes, { ref: { ...(w.ref as object), sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length } as never, streamOf: () => undefined })
    }
    expect((await as11(false)).lines).toBeNull()
    await expect(as11(true)).rejects.toThrow()
  })
})

// ---------------------------------------------------------------- the reader: a moved page told by its boxes carried
type Item = { str: string; transform: number[]; width: number; height: number; hasEOL: boolean; fontName: string }
const item = (str: string, x: number, y: number, width = str.length * 5, eol = false, page = 1): Item & { page: number } => ({ str, transform: [10, 0, 0, 10, x, y], width, height: 10, hasEOL: eol, fontName: 'f', page })
const WORDS = 'text text text text text text text text'
/** arXiv's pages 1 and 2: page 1 a paragraph, a display "x = y (1)", a paragraph the left does not locate (y 600, 588), a heading
 *  whose number is a mark (y 760); page 2 a line arXiv sets at its head that our compile kept on page 1 (y 750) */
const P1: Item[] = [item('Introduction', 62, 760, 60, true), item(WORDS, 50, 740, 500, true), item(WORDS, 50, 728, 500, true), item('x', 250, 700, 10), item('=', 265, 700, 10), item('y', 280, 700, 10), item('(1)', 535, 700, 15, true), item(WORDS, 50, 600, 500, true), item(WORDS, 50, 588, 500, true)]
const P2: Item[] = [item('carried over the break', 50, 750, 200, true, 2), item(WORDS, 50, 700, 500, true, 2)]
const doc: DocToken[] = tokenizeDocument([{ page: 1, items: P1, styles: {} }, { page: 2, items: P2, styles: {} }])
const at = (p: number, y: number) => doc.flatMap((t, k) => (t.page === p && Math.abs(t.y - y) < 1 ? [k] : []))
const DISPLAY = at(1, 700)
const UNITS = new Map<number, number[]>([[0, at(1, 760)], [1, [...at(1, 740), ...at(1, 728), ...DISPLAY]], [5, at(2, 700)]])
const kindOf = (id: number) => (id === 0 ? 'heading' : 'para')
const anchorOf = (tokens: number[]): Anchor => ({ tokens, rects: lineRects(doc, tokens), coverage: 1, bounded: true, pairs: new Map(tokens.filter(k => !DISPLAY.includes(k)).map((k, w) => [w, k])) })
const anchors = new Map<number, Anchor | null>([...UNITS].map(([id, ts]) => [id, anchorOf(ts)]))
const views = [[0, 0, 600, 800], [0, 0, 600, 800]]
const whole = layoutOf(doc, views, anchors, kindOf)
const PAD = 2.25, DK = PH_KINDS.indexOf('display'), LN = LABEL_KINDS.indexOf('number')
const DID = displayBlockId(1, 0)!
const mid = (y: number) => y + 2.65
/** a line of the layout file (page, x0, x1, baseline, top, bottom, size, font) at arXiv's place moved up by `dy` on our page */
const row = (p: number, x0: number, x1: number, y: number, dy: number) => [p, x0, x1, y + dy, y + 7.5 + dy, y - 2.2 + dy, 10, 0]
/** our page's inventory, every line `dy` above arXiv's; unit 3 (not located) at y 600 and 588, unit 4 (not located) the line our
 *  compile kept at page 1's foot (y 60) that arXiv sets at page 2's head (y 750) */
const layoutOf2 = (dy: number) => ({
  names: [],
  lines: [
    [0, row(1, 62, 122, 760, dy)],
    [1, [...row(1, 50, 550, 740, dy), ...row(1, 50, 550, 728, dy), ...row(1, 250, 550, 700, dy)]],
    [3, [...row(1, 50, 550, 600, dy), ...row(1, 50, 550, 588, dy)]],
    [4, row(1, 50, 250, 60, 0)],
  ],
  ph: [[1, 3, DK, PH_FLAG.NUMBERED, 1, 250, 700 + dy, 550, 707.5 + dy, 697.8 + dy]],
  labels: [[0, LN, 1, 50, 760 + dy, 58, 767.5 + dy, 757.8 + dy]],
})
/** the line map of our page 1 as the producer makes it: each of its lines `dy` off (its box, of its tokens: the heading's from its
 *  text, its number a mark; then -dy), and unit 4's line onto page 2 */
const mapOf = (dy: number, q: number) => {
  const out: number[] = []
  for (const y of [760, 740, 728, 700, 600, 588]) if (q === 1) out.push(1, y === 760 ? 62 : y === 700 ? 250 : 50, y === 760 ? 122 : 550, y - 2.2 + dy, y + 7.5 + dy, 1, 0, -dy)
  out.push(1, 50, 250, 57.8, 67.5, 2, 0, 690)
  return Float64Array.from(out)
}
type Step = 'parts' | 'A' | 'B' | 1 | 2
/** the left made of the parts (both, 'parts'; the first, which holds the layout, 'A'; the second, 'B') and the two pages' left
 *  parts in the order `steps` gives them, and a mirror of it made first */
function sideIn(dy: number, steps: Step[]) {
  const { parts, lefts } = cutSide(whole, anchors, views)
  const l = createShapes({ kindOf: id => (id === 4 || id === 3 ? 'para' : kindOf(id)) }), m = mirror(l)
  const lay = parts.map((p, i) => ({ ...p, layout: i === 0 ? layoutOf2(dy) : null }))
  for (const s of steps) if (s === 'parts') l.addParts(lay as never); else if (s === 'A' || s === 'B') l.addParts([lay[s === 'A' ? 0 : 1]] as never); else l.addPage({ ...lefts[s]!, lines: mapOf(dy, s) } as never)
  return { l, m }
}
function side(dy: number, mapped: boolean, partsFirst = true) {
  const { parts, lefts } = cutSide(whole, anchors, views)
  const l = createShapes({ kindOf: id => (id === 4 || id === 3 ? 'para' : kindOf(id)) }), m = mirror(l)
  const lay = parts.map((p, i) => ({ ...p, layout: i === 0 ? layoutOf2(dy) : null }))
  const page = (q: number) => ({ ...lefts[q]!, lines: mapped ? mapOf(dy, q) : null })
  if (partsFirst) { l.addParts(lay as never); l.addPage(page(1) as never); l.addPage(page(2) as never) } else { l.addParts(parts as never); l.addPage(page(1) as never); l.addPage(page(2) as never); l.addParts([{ pages: [1, 2], views: [], left: [], layout: layoutOf2(dy) }] as never) }
  return { l, m }
}

describe('the reader: a moved page\'s boxes carried onto arXiv\'s page by the line map (view/shapes.mjs)', () => {
  it('lit as a page in place: the display a block of its own, the unit the left does not locate by its lines, the heading\'s number', () => {
    for (const partsFirst of [true, false]) {
      const { l, m } = side(40, true, partsFirst)
      for (const S of [l, m]) {
        expect(S.shapes.hit(1, 300, mid(700), PAD, () => null)?.id, `display, ${partsFirst}`).toBe(DID)
        expect(S.shapes.hit(1, 300, mid(600), PAD, () => null)?.id, `unlocated, ${partsFirst}`).toBe(3)
        expect(S.shapes.hit(1, 54, mid(760), PAD, () => null)?.id, `label, ${partsFirst}`).toBe(0)
        // (the number, a mark beside the heading's words, which the map's line does not reach: carried with its heading's line,
        // nothing left where our page sets it)
        expect(S.shapes.hit(1, 54, mid(800), PAD, () => null), `label left behind, ${partsFirst}`).toBeNull()
      }
    }
  })
  it('a line our compile kept on page 1 that arXiv sets on page 2 lights on page 2, and nowhere on page 1', () => {
    const { l } = side(40, true)
    expect(l.shapes.hit(2, 100, mid(750), PAD, () => null)?.id).toBe(4)
    expect(l.shapes.hit(1, 100, mid(60), PAD, () => null)).toBeNull()
    expect(l.shapes.runs(4).every(r => r.page === 2)).toBe(true)
  })
  it('a block\'s rectangles on the moved page are its carried boxes: a click finds the line under it, never our page\'s', () => {
    for (const partsFirst of [true, false]) {
      const { l, m } = side(40, true, partsFirst)
      for (const S of [l, m]) {
        const at = (y: number) => S.shapes.click(1, 300, mid(y), PAD, () => null)
        expect(at(600), `first line, ${partsFirst}`).toMatchObject({ id: 3, line: 0 })
        expect(at(588), `second line, ${partsFirst}`).toMatchObject({ id: 3, line: 1 })
        expect(at(588)!.f, `within the line, ${partsFirst}`).toBeGreaterThan(0.2)
        expect(at(588)!.f).toBeLessThan(0.8)
        // (unit 4's line left page 1 for page 2: its rectangle there, none on page 1)
        expect((S.layout as unknown as { anchors: Map<number, { rects: { page: number }[] }> }).anchors.get(4)?.rects.map(r => r.page), `unit 4, ${partsFirst}`).toEqual([2])
      }
    }
  })
  it('whatever order the parts and the pages come in, each pane lights and clicks alike (and as the mirror)', () => {
    // (every order of the two parts and the two pages, and the parts together: a page opened before the boxes its neighbour brings)
    const perms = (xs: Step[]): Step[][] => (xs.length ? xs.flatMap((x, i) => perms([...xs.slice(0, i), ...xs.slice(i + 1)]).map(r => [x, ...r])) : [[]])
    const orders: Step[][] = [['parts', 1, 2], ['parts', 2, 1], [1, 'parts', 2], [2, 'parts', 1], [1, 2, 'parts'], [2, 1, 'parts'], ...perms(['A', 'B', 1, 2])]
    const read = (S: { shapes: ReturnType<typeof sideIn>['m']['shapes'] }) => {
      const out: unknown[] = []
      for (const id of [0, 1, 3, 4, DID]) out.push(id, S.shapes.runs(id).map(r => { const b = blockOf(r, PAD); return [r.page, ...[b.x0, b.x1, b.y0, b.y1].map(v => Math.round(v * 100) / 100)] }))
      for (const [p, y] of [[1, 760], [1, 740], [1, 700], [1, 600], [1, 588], [1, 100], [2, 750], [2, 700]] as const) out.push(p, y, S.shapes.hit(p, 300, mid(y), PAD, () => null)?.id ?? null, S.shapes.hit(p, 54, mid(y), PAD, () => null)?.id ?? null, S.shapes.click(p, 300, mid(y), PAD, () => null))
      return out
    }
    const want = read(sideIn(40, orders[0]!).l)
    for (const o of orders) { const { l, m } = sideIn(40, o); expect(read(l), o.join(' ')).toEqual(want); expect(read(m), `mirror, ${o.join(' ')}`).toEqual(want) }
  })
  it('without the map, as before: a moved page lights what the left part locates alone', () => {
    const { l } = side(40, false)
    expect(l.shapes.hit(1, 300, mid(700), PAD, () => null)?.id).toBe(1)
    expect(l.shapes.runs(3).filter(r => r.page === 1)).toEqual([])
    expect(l.shapes.hit(2, 100, mid(750), PAD, () => null)).toBeNull()
  })
  it('a page in place with a map of no entry on it is told as before', () => {
    const { l } = side(0, true)
    expect(l.shapes.hit(1, 300, mid(700), PAD, () => null)?.id).toBe(DID)
    expect(l.shapes.hit(1, 300, mid(600), PAD, () => null)?.id).toBe(3)
  })
  it('a page with an empty map is told by its boxes though its tokens stand under few of its lines (a page of displays)', () => {
    // (unit 3's two lines moved 200 pt down onto blank paper as our page sets them: no token under them; the map says the page in
    // place: they light as boxes, the paragraph's display too)
    const lay = layoutOf2(0)
    lay.lines = lay.lines.map(([i, rows]) => (i === 3 ? [3, [...row(1, 50, 550, 400, 0), ...row(1, 50, 550, 388, 0), ...row(1, 50, 550, 376, 0), ...row(1, 50, 550, 364, 0)]] : [i, rows])) as typeof lay.lines
    const run = (lines: Float64Array | null) => {
      const { parts, lefts } = cutSide(whole, anchors, views)
      const l = createShapes({ kindOf: id => (id === 4 || id === 3 ? 'para' : kindOf(id)) })
      l.addParts(parts.map(p => ({ ...p, layout: lay })) as never)
      l.addPage({ ...lefts[1]!, lines } as never)
      return l
    }
    expect(run(new Float64Array(0)).shapes.hit(1, 300, mid(400), PAD, () => null)?.id).toBe(3)
    expect(run(new Float64Array(0)).shapes.hit(1, 300, mid(700), PAD, () => null)?.id).toBe(DID)
    expect(run(null).shapes.hit(1, 300, mid(400), PAD, () => null)).toBeNull()
  })
})
