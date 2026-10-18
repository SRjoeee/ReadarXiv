// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { cutBundle } from '@/pdf-reader/engine/layer-proto/cut.mjs'
import { indexOf, readHead, readLeftPart, readPart, type ReadUnitsChunk, readUnitsChunk, type Ref, TOKEN_FIELDS } from '@/pdf-reader/engine/layer-proto/format.mjs'
import { type Anchor, anchorUnits, type DocToken, sentenceStarts, startsAnchor, type TextPage, tokenizeDocument, type UnitText } from '@/pdf-reader/engine/pipeline/anchors.mjs'
import { leftSideOf, leftSideStream } from '@/pdf-reader/engine/pipeline/left-side.mjs'
import { layoutOf, pageColumns } from '@/pdf-reader/engine/view/highlight.mjs'
import { BASE_OF } from './helpers/cut-paper'

// The left side a page at a time (left-pages-design §1 to §5): a synthetic paper of four pages through anchorUnits, the side the
// producer makes of it, cut by cutBundle into parts and left parts, read back as the service reads them, and the view's rebuild
// of each unit's anchor from its pages' left parts: the starts are the anchors' own

type Item = { str: string; transform: number[]; width: number; height: number; hasEOL: boolean; fontName: string }
const item = (str: string, x: number, y: number, eol: boolean): Item => ({ str, transform: [10, 0, 0, 10, x, y], width: str.length * 5, height: 10, hasEOL: eol, fontName: 'f' })
const page = (lines: string[][], n: number): TextPage => ({
  page: n,
  items: lines.flatMap((words, l) => { let x = 50; return words.map((w, k) => { const it = item(w, x, 700 - l * 12, k === words.length - 1); x += w.length * 5 + 5; return it }) }),
  styles: {},
})

const UNITS: UnitText[] = [
  { id: 0, text: 'Alpha beta gamma. Delta epsilon zeta eta. Theta iota kappa.' },
  { id: 1, text: 'Lambda mu nu. Xi omicron pi.' },
  { id: 2, text: 'Rho sigma. Tau upsilon phi.' },
  { id: 3, text: 'Chi psi omega. Alpha2 beta2.' },
  { id: 4, text: 'Final words of paper. Here ends.' },
]
const PAGES = [
  page([['Alpha', 'beta', 'gamma.', 'Delta', 'epsilon'], ['zeta', 'eta.', 'Theta', 'iota', 'kappa.'], ['Lambda', 'mu', 'nu']], 1),
  page([['Xi', 'omicron', 'pi.'], ['Rho', 'sigma.', 'Tau', 'upsilon', 'phi.'], ['Chi', 'psi', 'omega.', 'zzzone', 'zzztwo']], 2),
  page([], 3),
  page([['Final', 'words', 'of', 'paper.', 'Here', 'ends.']], 4),
]
const VIEWS = [0, 1, 2, 3].map(() => [0, 0, 612.0004, 792.0006])
/** sentence offsets of a text: where each sentence after the first begins */
const offsetsOf = (t: string) => [...t.matchAll(/\. (?=\S)/g)].map(m => (m.index as number) + 2)

function make() {
  const doc = tokenizeDocument(PAGES)
  // unit 0 and 1 marked (their first and last tokens), the others found by their text alone
  const bounds = new Map<string, [number, number]>([['0', [0, 9]], ['1', [10, 15]]])
  const anchors = anchorUnits(doc, UNITS, { bounds })
  return { doc, anchors }
}

/** the cut read back as the service reads it: the left parts parsed with the streams the parts told */
async function cutAndRead(side: ReturnType<typeof leftSideOf>, nUnits: number) {
  const whole = {
    paper: { id: '2608.04322', version: 1, pages: side.pages.length }, base: { ...BASE_OF }, versions: { image: '1' },
    units: Array.from({ length: nUnits }, (_, i) => ['para', 0, null, null, null, [[0, `unit ${i}`]]]) as never,
    left: { pages: side.pages, units: side.units }, layout: null,
  }
  const c = await cutBundle(whole as never, { leftPages: side.leftPages, base: BASE_OF })
  const head = await readHead(c.head.bytes, { ref: c.head.ref })
  const chunks: ReadUnitsChunk[] = []
  for (const u of c.units) chunks.push(await readUnitsChunk(u.bytes, { ref: u.ref, before: chunks.at(-1) ?? null }))
  const index = indexOf(head, chunks)
  const streams = new Map<number, number>()
  let chain = null
  for (const p of c.parts) {
    const r = await readPart(p.bytes, { ref: p.ref, index, chain })
    for (const w of r.left) streams.set(w[0], w[1])
    chain = r.chain
  }
  const lefts = []
  for (const l of c.left) lefts.push(await readLeftPart(l.bytes, { ref: l.ref as Ref & { page: number }, streamOf: id => streams.get(id) }))
  return { cut: c, lefts, streams }
}

describe('the left side of a synthetic paper, a page at a time', () => {
  const { doc, anchors } = make()
  const side = leftSideOf({ doc, views: VIEWS, anchors })

  it('places the units as the web\'s locatedPart does: ids rising, stream the first token, rectangles and views on the thousandth grid', () => {
    expect(side.pages).toEqual(VIEWS.map(v => v.map(x => Math.round(x * 1000) / 1000)))
    expect(side.units.map(u => u[0])).toEqual([0, 1, 2, 3, 4])
    for (const [id, stream, rects] of side.units) {
      const a = anchors.get(id) as Anchor
      expect(stream, `unit ${id}`).toBe(Math.min(...a.tokens))
      expect(rects, `unit ${id}`).toEqual(a.rects.map(r => [r.page, ...[r.x0, r.y0, r.x1, r.y1].map(v => Math.round(v * 1000) / 1000)]))
    }
    // a unit with no anchor, no token, no rectangle, or a rectangle that is not finite, is not located
    const odd = new Map<number, Anchor | null>([...anchors, [7, null], [8, { rects: [], coverage: 1, tokens: [3], bounded: true }], [9, { rects: [{ page: 1, x0: Number.NaN, y0: 0, x1: 1, y1: 1 }], coverage: 1, tokens: [3], bounded: true }]])
    expect(leftSideOf({ doc, views: VIEWS, anchors: odd }).units.map(u => u[0])).toEqual([0, 1, 2, 3, 4])
  })

  it('gives each page\'s tokens as the layout keeps them, on the grid, in the Float32 the reader decodes', async () => {
    const { lefts } = await cutAndRead(side, 5)
    const shipped = new Map(side.units.map(([id, , rects]) => [id, { rects: rects.map(([page, x0, y0, x1, y1]) => ({ page, x0, y0, x1, y1 })), tokens: (anchors.get(id) as Anchor).tokens }]))
    const { tok } = layoutOf(doc, side.pages, shipped as never) as unknown as { tok: Record<(typeof TOKEN_FIELDS)[number], Float32Array> }
    let first = 0
    lefts.forEach((l, p) => {
      expect(l.page).toBe(p + 1)
      expect(l.first, `page ${p + 1}`).toBe(first)
      const n = doc.filter(t => t.page === p + 1).length
      expect(l.table.n).toBe(n)
      for (const f of TOKEN_FIELDS) for (let k = 0; k < n; k++) expect(l.table[f][k], `${f}[${first + k}]`).toBe(Math.fround(Math.round(tok[f]![first + k]! * 1000) / 1000))
      first += n
    })
    expect(lefts[2]!.table.n).toBe(0)
    expect(lefts[3]!.first).toBe(first - lefts[3]!.table.n)
  })

  it('has a page with no token give null, and every other page its input', () => {
    expect(side.leftPages(3)).toBeNull()
    for (const p of [1, 2, 4]) expect(side.leftPages(p)).not.toBeNull()
    expect(side.leftPages(1)!.tokens.perPage).toEqual([side.leftPages(1)!.tokens.l.length])
    expect(() => side.leftPages(0)).toThrow(RangeError)
    expect(() => side.leftPages(5)).toThrow(RangeError)
  })

  it('gives each unit\'s spans as its tokens cut by page, the first range at its stream', async () => {
    const { lefts } = await cutAndRead(side, 5)
    for (const [id, stream] of side.units) {
      const a = anchors.get(id) as Anchor
      const got: number[] = []
      for (const l of lefts) for (const [uid, ranges] of l.spans) if (uid === id) for (let j = 0; j < ranges.length; j += 2) for (let k = 0; k < ranges[j + 1]!; k++) got.push(l.first + ranges[j]! + k)
      expect(got, `unit ${id}`).toEqual([...new Set(a.tokens)].sort((x, y) => x - y))
      expect(got[0]).toBe(stream)
    }
    // unit 1 runs over the page break: spans on pages 1 and 2
    expect(lefts[0]!.spans.some(s => s[0] === 1)).toBe(true)
    expect(lefts[1]!.spans.some(s => s[0] === 1)).toBe(true)
  })

  // anchored under the units' marks, and by their text alone (arXiv's PDF before the marked compile)
  for (const [how, under] of [['under marks', true], ['by text alone', false]] as const) {
    it(`rebuilds each unit's anchor from its pages' left parts, anchored ${how}: the same starts as the anchor gives, for the sentences of its text`, async () => {
      const doc2 = tokenizeDocument(PAGES)
      const found = anchorUnits(doc2, UNITS, under ? { bounds: new Map<string, [number, number]>([['0', [0, 9]], ['1', [10, 15]]]) } : {})
      const s2 = leftSideOf({ doc: doc2, views: VIEWS, anchors: found })
      const { lefts } = await cutAndRead(s2, 5)
      let compared = 0, none = 0
      for (const u of UNITS) {
        const a = found.get(u.id) as Anchor
        const pieces = []
        for (const l of lefts) {
          const spans = l.spans.find(s => s[0] === u.id)
          if (!spans) continue
          const runs = l.pairs.find(s => s[0] === u.id)
          pieces.push({ first: l.first, ranges: spans[1], ...(runs ? { runs: runs[1] } : {}) })
        }
        const o = offsetsOf(u.text)
        const want = sentenceStarts(a, u.text, o), got = sentenceStarts(startsAnchor(pieces), u.text, o)
        expect(got, `${how}, unit ${u.id}`).toEqual(want)
        if (want === null) none++
        else compared++
      }
      expect(compared).toBeGreaterThanOrEqual(2)
      expect(none).toBeGreaterThanOrEqual(1)
      expect((found.get(3) as Anchor).coverage).toBeLessThan(0.8)
      if (!under) expect(compared).toBeGreaterThan(2)
    })
  }

  it('is the same for any page order and any number of times: the same bytes', () => {
    const bytes = (p: number) => JSON.stringify(side.leftPages(p))
    const first = [4, 2, 1, 3].map(bytes)
    const again = [1, 2, 3, 4].map(bytes)
    expect([first[2], first[1], first[3], first[0]]).toEqual(again)
    expect(bytes(2)).toBe(again[1])
  })

  it('refuses a token that is not finite, naming it and the field', () => {
    const bad = doc.map((t, k) => (k === 5 ? { ...t, y: Number.NaN } : t)) as DocToken[]
    const s = leftSideOf({ doc: bad, views: VIEWS, anchors })
    expect(() => s.leftPages(1)).toThrow(/token 5.*\by\b/)
    expect(() => s.leftPages(2)).not.toThrow()
  })

  it('refuses a document whose pages go backwards or past the views', () => {
    const back = doc.map((t, k) => (k === 3 ? { ...t, page: 2 } : t)) as DocToken[]
    expect(() => leftSideOf({ doc: back, views: VIEWS, anchors })).toThrow(RangeError)
    const past = doc.map((t, k) => (k === doc.length - 1 ? { ...t, page: 9 } : t)) as DocToken[]
    expect(() => leftSideOf({ doc: past, views: VIEWS, anchors })).toThrow(RangeError)
  })

  it('counts what it shipped', () => {
    expect(side.stats.units).toBe(5)
    expect(side.stats.tokens).toBe(doc.length)
    expect(side.stats.paired).toBe(2)
    // (unit 3 has pairs, found at 0.6 of its words, and the gate leaves it out)
    expect(side.stats.gated).toBe(1)
    expect(side.stats.runs).toBeGreaterThan(0)
  })

  it('has a paper with no token at all give null for every page', () => {
    const empty = leftSideOf({ doc: [], views: VIEWS.slice(0, 2), anchors: new Map() })
    expect(empty.units).toEqual([])
    expect(empty.leftPages(1)).toBeNull()
    expect(empty.leftPages(2)).toBeNull()
  })
})

describe('a page past TOKENS_PAGE', () => {
  it('gives its full input, which the writer empties, keeping `first` for the next page', async () => {
    const n = 15_001
    const doc: DocToken[] = Array.from({ length: n + 3 }, (_, k) => ({ t: `w${k}`, page: k < n ? 1 : 2, x: 50 + (k % 40) * 10, y: 700 - Math.floor(k / 40) * 0.01, w: 8, h: 10, top: 708, bottom: 698 }))
    const anchorsOf = new Map<number, Anchor | null>([[0, { rects: [{ page: 2, x0: 50, y0: 690, x1: 90, y1: 702 }], coverage: 1, tokens: [n, n + 1, n + 2], bounded: true, pairs: new Map([[0, n], [1, n + 1], [2, n + 2]]) }]])
    const side = leftSideOf({ doc, views: [[0, 0, 612, 792], [0, 0, 612, 792]], anchors: anchorsOf })
    expect(side.leftPages(1)!.tokens.perPage).toEqual([n])
    const { cut, lefts } = await cutAndRead(side, 1)
    expect((cut.left[0] as { emptied?: boolean }).emptied).toBe(true)
    expect(lefts[0]!.table.n).toBe(0)
    expect(lefts[1]!.first).toBe(n)
    expect(lefts[1]!.spans).toEqual([[0, [0, 3]]])
    expect(lefts[1]!.pairs).toEqual([[0, [0, 0, 3]]])
  })
})

// A rectangle the part's writer refuses for its place (a coordinate past its page's view by more than the wire's slack, format.mjs
// partShape) is never handed to it: 1406.1078v3's landscape pages (/Rotate 90) set their captions vertically, the tokenizer lays a
// vertical item's words along x from its origin, and the caption's line ran from x 554.427 to 1241.035 on a view 595.276 wide
describe('a left rectangle past its page\'s view', () => {
  const VIEW = [0, 0, 595.276, 841.89]
  const doc: DocToken[] = Array.from({ length: 8 }, (_, k) => ({ t: `w${k}`, page: 1, x: 100 + k * 40, y: 400, w: 30, h: 10, top: 408, bottom: 398 }))
  const anchor = (rects: [number, number, number, number][], tokens: number[]): Anchor => ({ rects: rects.map(([x0, y0, x1, y1]) => ({ page: 1, x0, y0, x1, y1 })), coverage: 1, tokens, bounded: true })
  const anchors = new Map<number, Anchor | null>([
    // partly outside: clipped to the view (page 14's caption line)
    [0, anchor([[554.427, 76.568, 1241.035, 86.32]], [0])],
    // one rectangle within the view, one wholly outside it (page 15's second line, x 1058.191 to 1076.03): that one dropped
    [1, anchor([[100, 390, 300, 410], [1058.191, 76.568, 1076.03, 86.32]], [1, 2])],
    // every rectangle wholly outside: no rectangle left, so the unit is not located, as one with none is
    [2, anchor([[700, 76.568, 760, 86.32]], [3])],
    // past the view within the slack the writer allows: kept as it is
    [3, anchor([[-0.5, 380, 595.9, 392]], [4])],
    // past the view below and above: clipped on both
    [4, anchor([[10, -20, 50, 900]], [5])],
  ])

  it('clips a rectangle partly outside to the view, drops one wholly outside, and keeps one within the slack as it is', () => {
    const side = leftSideOf({ doc, views: [VIEW], anchors })
    expect(side.units).toEqual([
      [0, 0, [[1, 554.427, 76.568, 595.276, 86.32]]],
      [1, 1, [[1, 100, 390, 300, 410]]],
      [3, 4, [[1, -0.5, 380, 595.9, 392]]],
      [4, 5, [[1, 10, 0, 50, 841.89]]],
    ])
    expect(side.stats.units).toBe(4)
    expect(side.stats.clipped).toBe(2)
    expect(side.stats.dropped).toBe(2)
    // a page's left part input is its tokens' alone: the dropped unit's token is still on the page, owned by no span
    expect(side.leftPages(1)!.spans.map(s => s[0])).toEqual([0, 1, 3, 4])
  })

  it('does the same a unit at a time', () => {
    const want = leftSideOf({ doc, views: [VIEW], anchors })
    const side = leftSideStream({ doc, views: [VIEW], columns: (() => pageColumns([VIEW], new Map())) as never })
    for (const id of [4, 2, 0, 3, 1]) side.add(id, anchors.get(id) ?? null)
    expect(side.units()).toEqual(want.units)
    expect(side.firstPage(2)).toBeNull()
    expect(side.stats).toEqual(want.stats)
  })

  it('drops the tokens of a page whose every rectangle it dropped: a part a page, each left part read as its part arrives', async () => {
    // unit 1 runs from page 1 (its line there wholly past the view) to page 2; told by the part of page 2, so page 1's left part
    // must not name it
    const two: DocToken[] = [0, 1, 2, 3].map(k => ({ t: `w${k}`, page: k < 2 ? 1 : 2, x: 100 + (k % 2) * 40, y: 400, w: 30, h: 10, top: 408, bottom: 398 }))
    const at = (page: number, x0: number, x1: number) => ({ page, x0, y0: 398, x1, y1: 408 })
    const found = new Map<number, Anchor | null>([
      [0, { rects: [at(1, 100, 130)], coverage: 1, tokens: [0], bounded: true }],
      [1, { rects: [at(1, 700, 760), at(2, 100, 170)], coverage: 1, tokens: [1, 2, 3], bounded: true }],
    ])
    const side = leftSideOf({ doc: two, views: [VIEW, VIEW], anchors: found })
    const whole = {
      paper: { id: '2608.04322', version: 1, pages: 2 }, base: { ...BASE_OF }, versions: { image: '1' },
      units: [0, 1].map(i => ['para', 0, null, null, null, [[0, `unit ${i}`]]]) as never, left: { pages: side.pages, units: side.units }, layout: null,
    }
    const c = await cutBundle(whole as never, { leftPages: side.leftPages, base: BASE_OF, target: (a: number) => a })
    expect(c.parts.length).toBe(2)
    const head = await readHead(c.head.bytes, { ref: c.head.ref })
    const chunks: ReadUnitsChunk[] = []
    for (const u of c.units) chunks.push(await readUnitsChunk(u.bytes, { ref: u.ref, before: chunks.at(-1) ?? null }))
    const index = indexOf(head, chunks)
    const streams = new Map<number, number>()
    let chain = null
    for (const p of c.parts) {
      const r = await readPart(p.bytes, { ref: p.ref, index, chain })
      for (const w of r.left) streams.set(w[0], w[1])
      chain = r.chain
      for (let page = r.pages[0]; page <= r.pages[1]; page++) {
        const l = c.left[page - 1]!
        await readLeftPart(l.bytes, { ref: l.ref as Ref & { page: number }, streamOf: id => streams.get(id) })
      }
    }
    expect(streams).toEqual(new Map([[0, 0], [1, 2]]))
    expect(side.units).toEqual([[0, 0, [[1, 100, 398, 130, 408]]], [1, 2, [[2, 100, 398, 170, 408]]]])
    expect(side.leftPages(1)!.spans.map(s => s[0])).toEqual([0])
    expect(side.leftPages(2)!.spans).toEqual([[1, [0, 2]]])
    expect(side.stats.dropped).toBe(1)
    // a unit at a time, the same
    const stream = leftSideStream({ doc: two, views: [VIEW, VIEW], columns: (() => pageColumns([VIEW, VIEW], new Map())) as never })
    for (const id of [1, 0]) stream.add(id, found.get(id) ?? null)
    expect(stream.units()).toEqual(side.units)
    expect(stream.firstPage(1)).toBe(2)
    for (const p of [1, 2]) expect(stream.leftPages(p)!.spans).toEqual(side.leftPages(p)!.spans)
  })

  it('cuts 1406.1078v3\'s page 14 as the prepare does: a vertical caption anchored on its tokens, the part written and read back', async () => {
    // page 14's two items, as PDF.js gives them: rotated a quarter turn (transform [0, s, -s, 0, x, y]), their widths along +y
    const words = (n: number, from: number) => Array.from({ length: n }, (_, k) => `word${from + k}`)
    const one = words(30, 0), two = words(5, 30)
    const vertical = (str: string, x: number, width: number) => ({ str, transform: [0, 10.91, -10.91, 0, x, 78.92], width, height: 10.91, hasEOL: true, fontName: 'f' })
    const pages: TextPage[] = [{ page: 1, items: [vertical(one.join(' '), 540.88, 700.16), vertical(two.join(' '), 554.43, 169.91)], styles: {} }]
    const tokens = tokenizeDocument(pages)
    const found = anchorUnits(tokens, [{ id: 0, text: [...one, ...two].join(' ') }], {})
    const a = found.get(0) as Anchor
    expect(Math.max(...a.rects.map(r => r.x1))).toBeGreaterThan(VIEW[2]! + 600)
    const side = leftSideOf({ doc: tokens, views: [VIEW], anchors: found })
    for (const [, , rects] of side.units) for (const r of rects) expect(r[3]).toBeLessThanOrEqual(VIEW[2]!)
    const { cut, streams } = await cutAndRead(side, 1)
    expect(cut.parts.length).toBe(1)
    expect(streams.get(0)).toBe(Math.min(...a.tokens))
  })
})

describe('leftSideStream: the side a unit at a time (the page stream, stage 2)', () => {
  it('the units given in any order, a page asked once every unit on it is: leftSideOf\'s, byte for byte', () => {
    const { doc, anchors } = make()
    const want = leftSideOf({ doc, views: VIEWS, anchors })
    const grid = VIEWS.map(v => v.map(x => Math.round(x * 1000) / 1000))
    for (const order of [[4, 3, 2, 1, 0], [2, 0, 4, 1, 3]]) {
      // the columns a whole run gave (pageColumns of every located unit's lines: the far push's rule)
      const columns = () => pageColumns(grid, new Map([...anchors].map(([id, a]) => [id, a ? { ...a, rects: a.rects.map(r => ({ ...r })) } : a])))
      const side = leftSideStream({ doc, views: VIEWS, columns: columns as never })
      for (const id of order) { const a = anchors.get(id) ?? null; if (a) side.add(id, a); else side.none(id) }
      expect(side.done()).toBe(UNITS.length)
      expect(side.units()).toEqual(want.units)
      expect(side.pages).toEqual(want.pages)
      expect(side.stats).toEqual(want.stats)
      for (let p = 1; p <= VIEWS.length; p++) expect(side.leftPages(p)).toEqual(want.leftPages(p))
    }
  })

  it('wants the pages\' columns given: the tokens\' layout is made before any unit is', () => {
    const { doc } = make()
    expect(() => leftSideStream({ doc, views: VIEWS } as never)).toThrow(TypeError)
  })
})
