// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { type Anchor, anchorUnits, edgesOf, ownPlaces, pageFrame, searchHead, type TextPage, tokenizeDocument, type UnitText } from '@/pdf-reader/engine/pipeline/anchors.mjs'
import { leftReach, rangedAnchors } from '@/pdf-reader/engine/pipeline/left-part.mjs'

// Where a unit is searched is known from the marked original's head, before any mark is read (anchors.mjs searchHead): a unit
// with marks within its bounds, or where they do not bound it first in its gap on its own marks' pages and one either side, then
// on those pages alone; a unit without marks in its gap between its neighbours with marks, within their stretch, a float then
// over the whole document. So the page stream holds a page only for the units whose own pages, or whose neighbours', meet it:
// an affiliation TeX set at the paper's end, numbered among page 1's units, no longer holds page 1 until the last page is read
// (2610.21884v1: page 1 waited for page 31)

type Item = { str: string; transform: number[]; width: number; height: number; hasEOL: boolean; fontName: string }
const item = (str: string, x: number, y: number, eol: boolean): Item => ({ str, transform: [10, 0, 0, 10, x, y], width: str.length * 5, height: 10, hasEOL: eol, fontName: 'f' })
const page = (lines: string[][], n: number): TextPage => ({
  page: n,
  items: lines.flatMap((words, l) => { let x = 50; return words.map((w, k) => { const it = item(w, x, 700 - l * 12, k === words.length - 1); x += w.length * 5 + 5; return it }) }),
  styles: {},
})
const words = (tag: string, n: number) => Array.from({ length: n }, (_, i) => `${tag}${i}`)
const lines = (ws: string[]) => Array.from({ length: Math.ceil(ws.length / 8) }, (_, i) => ws.slice(8 * i, 8 * i + 8))
// eight pages: a title, its affiliation (a float TeX set at the paper's end, its marks there), a heading no mark bounds, then a
// paragraph a page or two, another heading, and the affiliation's text on the last page under the last paragraph
const T = ['A', 'title', 'of', 'the', 'paper'], AFF = ['Department', 'of', 'Physics', 'Some', 'University'], H1 = ['Introduction', 'here'], H2 = ['Method', 'next']
const P = Array.from({ length: 8 }, (_, i) => words(`p${i}w`, 40))
const PAGES = [
  page([T, H1, ...lines(P[0] as string[])], 1),
  page(lines(P[1] as string[]), 2),
  page(lines(P[2] as string[]), 3),
  page([H2, ...lines(P[3] as string[])], 4),
  page(lines(P[4] as string[]), 5),
  page(lines(P[5] as string[]), 6),
  page(lines(P[6] as string[]), 7),
  page([...lines(P[7] as string[]), AFF], 8),
]
const doc = tokenizeDocument(PAGES)
const UNITS: UnitText[] = [
  { id: 0, text: T.join(' ') }, { id: 1, text: AFF.join(' ') }, { id: 2, text: H1.join(' ') }, { id: 3, text: (P[0] as string[]).join(' ') },
  { id: 4, text: (P[1] as string[]).join(' ') }, { id: 5, text: (P[2] as string[]).join(' ') }, { id: 6, text: H2.join(' ') },
  ...[3, 4, 5, 6, 7].map((k, j) => ({ id: 7 + j, text: (P[k] as string[]).join(' ') })),
]
const floating = (id: number) => id === 1
const at = (t: string) => doc.findIndex(d => d.t === t.toLowerCase())
const span = (ws: string[]) => [at(ws[0] as string), at(ws.at(-1) as string)] as [number, number]
const pageOf = (k: number) => (doc[k] as { page: number }).page
// every paragraph's and the title's marks bound them; the affiliation's are on page 8; the headings have none
const bounds = new Map<string, [number, number]>([['0', span(T)], ['1', span(AFF)], ['3', span(P[0] as string[])], ['4', span(P[1] as string[])], ['5', span(P[2] as string[])], ...[3, 4, 5, 6, 7].map((k, j) => [String(7 + j), span(P[k] as string[])] as [string, [number, number]])])
const own = new Map([...bounds].map(([id, [a, b]]) => [id, [pageOf(a), pageOf(b)] as [number, number]]))
const plain = (m: Map<number, Anchor | null>) => JSON.stringify([...m].filter(([, a]) => a).sort((x, y) => x[0] - y[0]))

/** the page stream over the marks as their pages are read (each unit's at the last of its own pages), in `order` of the pages,
 *  each page's units in `within`; the anchors told, and after which page read page 1 was anchored */
function stream(frame: ReturnType<typeof pageFrame>, b: Map<string, [number, number]>, ownPages: Map<string, [number, number]>, pagesRead: number[]) {
  const R = rangedAnchors(doc, UNITS, { own: ownPages, floating, frame: () => frame })
  const got = new Map<number, Anchor | null>()
  const run = () => R.run((id, a) => got.set(id, a), id => { if (!got.has(id)) got.set(id, null) })
  for (const u of UNITS) if (!ownPages.has(String(u.id))) R.mark(u.id, null)
  run()
  let firstAt: number | null = R.am > 1 ? 0 : null
  for (const p of pagesRead) {
    for (const u of UNITS) { const o = ownPages.get(String(u.id)); if (o && o[1] === p) R.mark(u.id, b.get(String(u.id)) ?? null) }
    run()
    if (firstAt === null && R.am > 1) firstAt = p
  }
  return { got, firstAt, settled: UNITS.every(u => R.isSettled(u.id)) }
}

describe('the search known from the head (searchHead): a page waits only for the units whose own pages meet it', () => {
  it('each unit\'s search: bounds, own pages, the gap between neighbours with marks, a float without marks over the whole document', () => {
    const head = searchHead(doc, UNITS, { own, floating })
    expect(head.any).toBe(true)
    // the first heading: between the title and the first paragraph (the affiliation, a float, no neighbour), pages 1 to 2
    expect([head.prev[2], head.next[2]]).toEqual([0, 3])
    expect([pageOf(head.rlo[2] as number), pageOf(head.rhi[2] as number)]).toEqual([1, 2])
    const reach = leftReach(doc, UNITS, { bounds: new Map([...bounds].filter(([id]) => id !== '1')), own, floating })
    // the affiliation, its marks not bounding it: its own page and the one before (the document ends there)
    expect((reach[1] as [number, number][]).map(([a, b]) => [pageOf(a), pageOf(b)])).toEqual([[7, 8]])
  })

  it('an affiliation TeX set at the end, its marks there: page 1 is anchored long before they are read, and the anchors are the whole\'s', () => {
    let frame: ReturnType<typeof pageFrame> | null = null
    const whole = anchorUnits(doc, UNITS, { bounds, own, floating, frame: (d, ms) => (frame = pageFrame(d, ms)) })
    expect(whole.get(1)?.rects[0]?.page).toBe(8)
    expect(whole.get(2)?.rects[0]?.page).toBe(1)
    expect(whole.get(6)?.rects[0]?.page).toBe(4)
    const { got, firstAt, settled } = stream(frame as never, bounds, own, [1, 2, 3, 4, 5, 6, 7, 8])
    expect(plain(got)).toBe(plain(whole))
    expect(settled).toBe(true)
    // (page 1's left reads the units that may touch page 1 and theirs: the first heading, final once the title and the first
    // paragraph are marked, reaches where its match stands; a unit not marked yet reaches its own pages and one either side, so
    // page 2's paragraph reaches page 1 until its marks are read: page 1 is anchored once page 2 is, six pages before the
    // affiliation's marks; between neighbours by number, the affiliation's window was page 1)
    expect(firstAt).toBe(2)
  })

  it('a unit without marks is final once both its neighbours with marks are: not before', () => {
    let frame: ReturnType<typeof pageFrame> | null = null
    anchorUnits(doc, UNITS, { bounds, own, floating, frame: (d, ms) => (frame = pageFrame(d, ms)) })
    const R = rangedAnchors(doc, UNITS, { own, floating, frame: () => frame as never })
    const run = () => R.run(() => {}, () => {})
    for (const u of UNITS) if (!own.has(String(u.id))) R.mark(u.id, null)
    // every unit but the paragraph after the first heading: page 1 waits for it
    for (const u of UNITS) if (u.id !== 3 && own.has(String(u.id))) R.mark(u.id, bounds.get(String(u.id)) ?? null)
    run()
    expect(R.am).toBe(1)
    R.mark(3, bounds.get('3') ?? null)
    run()
    expect(R.am).toBe(9)
  })

  it('streamed is whole whatever order the pages\' marks come in, a unit\'s marks not bounding it among them', () => {
    // (the second paragraph's marks bound nothing: it is searched on its own pages, 2 and 3 and one either side)
    const b = new Map([...bounds].filter(([id]) => id !== '4'))
    let frame: ReturnType<typeof pageFrame> | null = null
    const whole = anchorUnits(doc, UNITS, { bounds: b, own, floating, frame: (d, ms) => (frame = pageFrame(d, ms)) })
    expect(whole.get(4)?.rects[0]?.page).toBe(2)
    for (const order of [[1, 2, 3, 4, 5, 6, 7, 8], [8, 7, 6, 5, 4, 3, 2, 1], [3, 8, 1, 6, 2, 7, 4, 5]]) {
      const { got, settled } = stream(frame as never, b, own, order)
      expect(plain(got), `pages read ${order}`).toBe(plain(whole))
      expect(settled).toBe(true)
    }
  })

  it('a bound off its own pages and their page either side is the caller\'s defect: thrown, as is one with no own pages', () => {
    const R = rangedAnchors(doc, UNITS, { own, floating, frame: () => pageFrame(doc, []) })
    expect(() => R.mark(0, span(P[5] as string[]))).toThrow(RangeError)
    expect(() => R.mark(2, span(H1))).toThrow(RangeError)
    expect(() => anchorUnits(doc, UNITS, { bounds, own: new Map([...own].filter(([id]) => id !== '3')), floating })).toThrow(TypeError)
  })

  it('a unit whose marks do not bound it: in its gap on its own pages first, a short text whose words come twice there; else on its own pages alone', () => {
    // (page 1: a paragraph, "Expansion for", a paragraph; page 2: a paragraph that says "expansion for" too. The short unit's own
    // marks on page 1 do not bound it: on pages 1 and 2 its words come twice, between its neighbours once)
    const A1 = words('q', 30), B1 = words('r', 30), C1 = [...words('s', 10), 'expansion', 'for', ...words('t', 10)]
    const d = tokenizeDocument([page([...lines(A1), ['Expansion', 'for'], ...lines(B1)], 1), page(lines(C1), 2)])
    const us: UnitText[] = [{ id: 0, text: A1.join(' ') }, { id: 1, text: 'Expansion for' }, { id: 2, text: B1.join(' ') }, { id: 3, text: C1.join(' ') }]
    const find = (t: string) => d.findIndex(x => x.t === t)
    const b = new Map<string, [number, number]>([['0', [find('q0'), find('q29')]], ['2', [find('r0'), find('r29')]], ['3', [find('s0'), find('t9')]]])
    const o = new Map<string, [number, number]>([['0', [1, 1]], ['1', [1, 1]], ['2', [1, 1]], ['3', [2, 2]]])
    const got = anchorUnits(d, us, { bounds: b, own: o, frame: pageFrame })
    expect(got.get(1)?.rects[0]?.page).toBe(1)
    expect(got.get(1)?.tokens).toEqual([find('expansion'), find('for')])
    // (its neighbours' marks bounding nothing either: the gap between where their texts stand on their own pages, the same)
    const loose = anchorUnits(d, us, { bounds: new Map([['3', b.get('3') as [number, number]]]), own: o, frame: pageFrame })
    expect(loose.get(1)?.tokens).toEqual([find('expansion'), find('for')])
  })

  it('a unit whose stretch meets its own pages nowhere is searched on its own pages alone, and the stream anchors it as the whole does', () => {
    // (pages 1 to 5; the short unit's neighbours on page 1, its own marks on page 5, its words once on pages 4 and 5)
    const A1 = words('q', 30), B1 = words('r', 30)
    const d = tokenizeDocument([page(lines(A1), 1), page(lines(B1), 2), page(lines(words('x', 30)), 3), page(lines(words('y', 30)), 4), page([['Expansion', 'for']], 5)])
    const us: UnitText[] = [{ id: 0, text: A1.join(' ') }, { id: 1, text: 'Expansion for' }, { id: 2, text: B1.join(' ') }]
    const find = (t: string) => d.findIndex(x => x.t === t)
    const b = new Map<string, [number, number]>([['0', [find('q0'), find('q29')]], ['2', [find('r0'), find('r29')]]])
    const o = new Map<string, [number, number]>([['0', [1, 1]], ['1', [5, 5]], ['2', [2, 2]]])
    expect(searchHead(d, us, { own: o }).apart[1]).toBe(1)
    let frame: ReturnType<typeof pageFrame> | null = null
    const whole = anchorUnits(d, us, { bounds: b, own: o, frame: (dd, ms) => (frame = pageFrame(dd, ms)) })
    expect(whole.get(1)?.rects[0]?.page).toBe(5)
    // the stream: marked without bounds before its neighbours' marks are read
    const R = rangedAnchors(d, us, { own: o, frame: () => frame as never })
    const got = new Map<number, Anchor | null>()
    R.mark(1, null)
    R.run((id, a) => got.set(id, a), id => { if (!got.has(id)) got.set(id, null) })
    R.mark(0, b.get('0') ?? null); R.mark(2, b.get('2') ?? null)
    R.run((id, a) => got.set(id, a), id => { if (!got.has(id)) got.set(id, null) })
    expect(plain(got)).toBe(plain(whole))
  })

  it('a neighbour whose marks do not bound it bounds the gap where its own text stands on its own pages, not at its pages\' edge', () => {
    const head = searchHead(doc, UNITS, { own, floating })
    const place = ownPlaces(doc, UNITS, head)
    // (the first heading: its neighbours the title and the first paragraph; bounded, their bounds; without bounds, their places)
    const hard = UNITS.map(u => bounds.get(String(u.id)) ?? null)
    expect(edgesOf(head, hard, 2, place)).toEqual([span(T)[1], span(P[0] as string[])[0]])
    const loose = hard.map((h, u) => (u === 0 || u === 3 ? null : h))
    expect(edgesOf(head, loose, 2, place)).toEqual([span(T)[1], span(P[0] as string[])[0]])
    // (a neighbour whose text is nowhere on its own pages: the next one with marks within the stretch, bounded, its bounds; past
    // the stretch, its edge, the page after the neighbour's first)
    const blind = ownPlaces(doc, UNITS.map(u => (u.id === 3 ? { ...u, text: 'nowhere to be found at all' } : u)), head)
    expect(edgesOf(head, loose, 2, blind)?.[1]).toBe(span(P[1] as string[])[0])
    const blinder = ownPlaces(doc, UNITS.map(u => (u.id === 3 || u.id === 4 ? { ...u, text: 'nowhere to be found at all' } : u)), head)
    expect(edgesOf(head, loose.map((h, u) => (u === 4 ? null : h)), 2, blinder)?.[1]).toBe((head.rhi[2] as number) + 1)
    // (a float takes no neighbour's text place, and the page stream's walk stops at a neighbour not marked yet)
    expect(edgesOf(head, loose, 2, place, (v: number) => v !== 3)).toBeNull()
  })
})

