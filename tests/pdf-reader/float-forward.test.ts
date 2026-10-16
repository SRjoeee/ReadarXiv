// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { type Anchor, anchorUnits, floatMatches, forwardSpans, matchUnits, pageFrame, type TextPage, tokenizeDocument, type UnitText } from '@/pdf-reader/engine/pipeline/anchors.mjs'
import { leftReach, rangedAnchors } from '@/pdf-reader/engine/pipeline/left-part.mjs'

// Rule 5 (the page stream's bound on a float's reach, E2b design §1.3; rule5-questions.md): a float not found between its
// neighbours is searched over the document from the page of its last body neighbour on (a unit not written inside a float, the
// source parse's `inFloat`), never before: its source comes after that neighbour's, so TeX sets it there or later. A List of
// Figures before the text holds a caption's words too: searched over the whole document, the caption was matched there

type Item = { str: string; transform: number[]; width: number; height: number; hasEOL: boolean; fontName: string }
const item = (str: string, x: number, y: number, eol: boolean): Item => ({ str, transform: [10, 0, 0, 10, x, y], width: str.length * 5, height: 10, hasEOL: eol, fontName: 'f' })
const page = (lines: string[][], n: number): TextPage => ({
  page: n,
  items: lines.flatMap((words, l) => { let x = 50; return words.map((w, k) => { const it = item(w, x, 700 - l * 12, k === words.length - 1); x += w.length * 5 + 5; return it }) }),
  styles: {},
})
const words = (tag: string, n: number) => Array.from({ length: n }, (_, i) => `${tag}${i}`)
const lines = (ws: string[]) => Array.from({ length: Math.ceil(ws.length / 10) }, (_, i) => ws.slice(10 * i, 10 * i + 10))
const CAPTION = ['Figure', 'curves', 'of', 'loss', 'against', 'steps', 'for', 'each', 'model', 'size']
// page 1: the List of Figures (the caption's words); page 2: paragraph A; page 3: a paragraph B written inside a figure, set
// there; page 4: paragraph C, 150 words (past MARGIN of the caption's window between B and C); page 5: the figure's caption
const A = words('a', 150), B = words('b', 30), C = words('c', 150)
const PAGES = [page([['List', 'of', 'Figures'], CAPTION], 1), page(lines(A), 2), page(lines(B), 3), page(lines(C), 4), page([CAPTION], 5)]
const doc = tokenizeDocument(PAGES)
const UNITS: UnitText[] = [{ id: 0, text: A.join(' ') }, { id: 1, text: B.join(' ') }, { id: 2, text: CAPTION.join(' ') }, { id: 3, text: C.join(' ') }]
const floating = (id: number) => id === 2
const at = (w: string) => doc.findIndex(t => t.t === w)
const span = (ws: string[]) => [at(ws[0] as string), at(ws.at(-1) as string)] as [number, number]
// every paragraph marked (its bounds), the caption not (its marks set twice: the List's copy and its own)
const bounds = new Map<string, [number, number]>([['0', span(A)], ['1', span(B)], ['3', span(C)]])
const floatMatch = floatMatches(doc, UNITS, floating)
const pageOf = (a: Anchor | null | undefined) => a?.rects[0]?.page ?? null

describe('rule 5: a float searched over the document from the page of its last body neighbour on', () => {
  it('today the caption is matched in the List of Figures; under rule 5 on its own page, B (written inside a figure) no body neighbour', () => {
    const today = anchorUnits(doc, UNITS, { bounds, floating, floatMatch, frame: pageFrame })
    expect(pageOf(today.get(2))).toBe(1)
    // (B inside a figure: the caption's last body neighbour is A, page 2)
    const rule5 = anchorUnits(doc, UNITS, { bounds, floating, floatMatch, frame: pageFrame, forward: new Set([1]) })
    expect(pageOf(rule5.get(2))).toBe(5)
    // the units in the text are placed as today
    for (const id of [0, 1, 3]) expect(rule5.get(id)).toEqual(today.get(id))
    // (no unit inside a float: B is its body neighbour, page 3: the caption on page 5 all the same)
    expect(pageOf(anchorUnits(doc, UNITS, { bounds, floating, floatMatch, frame: pageFrame, forward: new Set() }).get(2))).toBe(5)
  })

  it('a float\'s reach is the window between its neighbours and the document from its body neighbour\'s page on, not step T\'s match', () => {
    const fm = (r: [number, number][]) => r.map(([a, b]) => [doc[a]?.page, doc[b]?.page])
    expect(fm(leftReach(doc, UNITS, { bounds, floating, floatMatch })[2] as [number, number][])).toContainEqual([1, 1])
    const reach = leftReach(doc, UNITS, { bounds, floating, floatMatch, forward: new Set([1]) })[2] as [number, number][]
    expect(fm(reach)).toContainEqual([2, 5])
    expect(fm(reach)).not.toContainEqual([1, 1])
  })

  it('anchored by ranges: the whole run\'s anchors; the List\'s page anchored before the caption\'s marks are known, under rule 5 alone', () => {
    let frame: ReturnType<typeof pageFrame> | null = null
    for (const forward of [null, new Set([1])]) {
      const whole = anchorUnits(doc, UNITS, { bounds, floating, floatMatch, frame: (d, ms) => (frame = pageFrame(d, ms)), forward })
      const R = rangedAnchors(doc, UNITS, { floating, floatMatch, frame: () => frame as never, forward })
      const got = new Map<number, Anchor | null>()
      // the paragraphs' marks known; the caption's not yet (its marks on page 5)
      for (const [u, b] of [[0, bounds.get('0')], [1, bounds.get('1')], [3, bounds.get('3')]] as const) R.mark(u, b ?? null)
      R.own(2, 5, 5)
      R.run((id, a) => got.set(id, a), u => got.set(u, null))
      const before = R.am
      R.mark(2, null)
      R.run((id, a) => got.set(id, a), u => got.set(u, null))
      expect([...got].filter(([, a]) => a).sort((x, y) => x[0] - y[0])).toEqual([...whole].filter(([, a]) => a).sort((x, y) => x[0] - y[0]))
      // today the caption's match over the whole document reaches page 1: no page is anchored before it is known; under rule 5
      // page 1 is (page 2 waits: the caption's window between its neighbours reaches back into A, MARGIN)
      expect(before).toBe(forward ? 2 : 1)
    }
  })
})

describe('rule 5\'s reach of a float before its start is known: the stretches its search from each page on takes', () => {
  it('from a page on: the stretch locate takes there, its matched tokens inside; the same stretch from every page up to its first hit', () => {
    const span = forwardSpans(doc, UNITS, floating)
    const pageOfTok = (k: number) => doc[k]?.page
    const start = (p: number) => doc.findIndex(t => t.page === p)
    const lof = span(2, 0), own = span(2, start(2))
    expect([pageOfTok(lof!.lo), pageOfTok(lof!.hi)]).toEqual([1, 1])
    expect([pageOfTok(own!.lo), pageOfTok(own!.hi)]).toEqual([5, 5])
    // (from any page after the List up to the caption's own: the same stretch; past its first hit another, at the document's end
    // none)
    for (const p of [2, 3, 4, 5]) expect(span(2, start(p))).toEqual(own)
    expect(span(2, own!.first + 1)!.first).toBeGreaterThan(own!.first)
    expect(span(2, doc.length)).toBeNull()
    // the search itself takes tokens inside the stretch
    const m = matchUnits(doc, UNITS, { bounds, floating, floatMatch, forward: new Set([1]) })[2]?.m ?? []
    expect(m.length).toBeGreaterThan(0)
    for (const k of m) expect(k >= own!.lo && k <= own!.hi).toBe(true)
    // a unit that is no float, or of fewer than three words, has none
    expect(span(0, 0)).toBeNull()
  })
})
