import { describe, expect, it } from 'vitest'
import { unitHiding } from '@/pdf-reader/engine/layer-proto/hide.mjs'
import { PH_FLAG, PH_KINDS } from '@/pdf-reader/engine/layout/file.mjs'
import { type Anchor, type DocToken, lineRects, tokenizeDocument } from '@/pdf-reader/engine/pipeline/anchors.mjs'
import { blockOf, layoutOf } from '@/pdf-reader/engine/view/highlight.mjs'
import { createShapes, layerShapes, mirror } from '@/pdf-reader/engine/view/shapes.mjs'
import { displayBlockId } from '@/pdf-reader/engine/layer-proto/units.mjs'
import { cutSide } from '../../lab/pdf/spikes/highlight-pages.mjs'

// A block lights on both panes or on neither, never on one (the owner, 2026-10-30, asking why one side still stayed dark and for the
// root of it, docs/PDF-READER.md §17.1): its area on each pane is its maker's boxes on our page — on the left the tokens of arXiv's page under a box, and the box itself
// where none is (a formula drawn as paths, a bullet drawn as a mark); on the right what the door drew and what it left of our page.

type Item = { str: string; transform: number[]; width: number; height: number; hasEOL: boolean; fontName: string }
const item = (str: string, x: number, y: number, width = str.length * 5, eol = false): Item => ({ str, transform: [10, 0, 0, 10, x, y], width, height: 10, hasEOL: eol, fontName: 'f' })
const WORDS = 'text text text text text text text text'
/** page 1, 600 × 800, one column at 72–528: a paragraph (y 740, 728), a display of no text token (its ink paths: y 708), the
 *  paragraph going on (y 688); an item whose label "(i)" hangs in the margin at 54–66 (y 660, 648); a cell (y 600) the left part
 *  locates on page 2 (a repeated header), whose boxes our page holds on page 1; page 2 the same header again */
const pages: Item[][] = [
  [item(WORDS, 72, 740, 456, true), item(WORDS, 72, 728, 456, true), item(WORDS, 72, 688, 456, true), item('(i)', 54, 660, 12), item(WORDS, 72, 660, 456, true), item(WORDS, 72, 648, 456, true), item('Header', 200, 600, 30, true), item(WORDS, 72, 560, 456, true), item(WORDS, 72, 548, 420, true), item(WORDS, 72, 536, 456, true)],
  [item('Header', 200, 700, 30, true), item(WORDS, 72, 680, 456, true), item(WORDS, 72, 668, 456, true), item(WORDS, 72, 656, 456, true)],
]
const doc: DocToken[] = tokenizeDocument(pages.map((items, i) => ({ page: i + 1, items, styles: {} })))
const at = (p: number, y: number, x0 = 0, x1 = 600) => doc.flatMap((t, k) => (t.page === p && Math.abs(t.y - y) < 1 && t.x >= x0 && t.x < x1 ? [k] : []))
const UNITS = new Map<number, number[]>([
  [1, [...at(1, 740), ...at(1, 728), ...at(1, 688)]],
  [2, [...at(1, 660), ...at(1, 648)]],
  [3, at(2, 700)],
  [4, [...at(1, 560), ...at(1, 548), ...at(1, 536)]],
  [5, [...at(2, 680), ...at(2, 668), ...at(2, 656)]],
])
const KINDS: Record<number, string> = { 2: 'theorem', 3: 'cell' }
const kindOf = (id: number) => KINDS[id] ?? 'para'
const anchors = new Map<number, Anchor | null>([...UNITS].map(([id, ts]) => [id, { tokens: ts, rects: lineRects(doc, ts), coverage: 1, bounded: true, pairs: new Map(ts.map((k, w) => [w, k])) }]))
const views = [[0, 0, 600, 800], [0, 0, 600, 800]]
const whole = layoutOf(doc, views, anchors, kindOf)
const PAD = 2.25, DK = PH_KINDS.indexOf('display')
const row = (p: number, x0: number, x1: number, y: number) => [p, x0, x1, y, y + 7.5, y - 2.2, 10, 0]
const layout = () => ({
  names: [],
  lines: [
    [1, [...row(1, 72, 528, 740), ...row(1, 72, 528, 728), ...row(1, 200, 400, 708), ...row(1, 72, 528, 688)]],
    [2, [...row(1, 72, 528, 660), ...row(1, 72, 528, 648)]],
    [3, row(1, 200, 230, 600)],
    [4, [...row(1, 72, 528, 560), ...row(1, 72, 528, 548), ...row(1, 72, 528, 536)]],
    [5, [...row(2, 72, 528, 680), ...row(2, 72, 528, 668), ...row(2, 72, 528, 656)]],
  ],
  // (the display; and unit 4's formula past its line's last word at 497-520, drawn as paths: no token)
  ph: [[1, 1, DK, PH_FLAG.NUMBERED, 1, 200, 708, 400, 715.5, 705.8], [4, 0, PH_KINDS.indexOf('math'), 0, 1, 497, 548, 520, 555.5, 545.8]],
  labels: [[2, 1, 1, 54, 660, 66, 667.5, 657.8]],
})
function side() {
  const { parts, lefts } = cutSide(whole, anchors, views)
  const l = createShapes({ kindOf })
  l.addParts(parts.map(p => (p.pages[0] === 1 ? { ...p, layout: layout() } : p)) as never)
  l.addPage(lefts[1]!)
  l.addPage(lefts[2]!)
  return l
}
const mid = (y: number) => y + 2.65

describe('a block lights on both panes or on neither (view/shapes.mjs, highlight.mjs)', () => {
  it('a display drawn as paths, no token of arXiv\'s under it, lights by its box as its own block, on the left and on the mirror', () => {
    const l = side(), D = displayBlockId(1, 0)!
    for (const S of [l, mirror(l)]) {
      expect(S.shapes.hit(1, 300, mid(708), PAD, () => null)?.id).toBe(D)
      expect(S.shapes.runs(1).length).toBe(2)
    }
  })

  it('a label hanging in the margin lights with its unit on both panes, past the column\'s edge', () => {
    const l = side()
    expect(l.shapes.hit(1, 57, mid(660), PAD, () => null)?.id).toBe(2)
    expect(blockOf(l.shapes.runs(2)[0]!, PAD).x0).toBeLessThan(55)
    // (the right: the door's kept label a token of its own at its place)
    const r = layerShapes(l)
    const T = { n: 3, l: Float32Array.from([54, 72, 72]), r: Float32Array.from([66, 528, 528]), y: Float32Array.from([660, 660, 648]), h: Float32Array.from([10, 10, 10]), top: Float32Array.from([667.5, 667.5, 655.5]), bottom: Float32Array.from([657.8, 657.8, 645.8]) }
    r.lay(1, { tokens: T, word: Int32Array.from([-1, 0, 1]), at: Int32Array.from([0, 0, 5]), spans: [[2, [0, 3]]], original: [] } as never)
    expect(r.shapes.hit(1, 57, mid(660), PAD, () => null)?.id).toBe(2)
  })

  it('a unit the left part locates on another page lights on its own page too, where our page holds its boxes, on both panes', () => {
    const l = side()
    expect(l.shapes.hit(1, 215, mid(600), PAD, () => null)?.id).toBe(3)
    expect(mirror(l).shapes.hit(1, 215, mid(600), PAD, () => null)?.id).toBe(3)
    // (and no unit's columns moved for it: its boxes are quiet)
    expect(l.shapes.runs(4).map(r => blockOf(r, PAD).x0)).toEqual([72 - PAD])
  })

  it('a formula with no token lights with the sentence of the word before it, never with the other sentence on its row', () => {
    const l = side()
    // (unit 4: sentence 0 words 0-11, sentence 1 from word 12, the middle of the line at 548, whose end holds the formula)
    const starts = l.starts(4, Array.from({ length: 24 }, () => 'text').join(' '), [5 * 12])!
    expect(starts).not.toBeNull()
    expect(l.shapes.fits(4, starts, true)).toBe(true)
    const run = l.shapes.runs(4)[0]!, s1 = l.shapes.sentence(run, starts, 1, PAD), s0 = l.shapes.sentence(run, starts, 0, PAD)
    expect(Math.max(...s1.map(r => r.x1))).toBeGreaterThan(520)
    expect(s0.every(r => !(r.y0 < mid(548) && r.y1 > mid(548)) || r.x1 < 400)).toBe(true)
    expect(l.shapes.hit(1, 510, mid(548), PAD, () => starts)).toMatchObject({ id: 4, s: 1 })
  })

  it('a block\'s own box past the column\'s edge lights to its end on both panes (an overfull line, a reference\'s numbers)', () => {
    // (unit 5 on page 2 with a number of no token at 540-556, past the column's edge at 528, on its last line)
    const lay = layout()
    lay.ph.push([5, 0, PH_KINDS.indexOf('number'), 0, 2, 540, 656, 556, 663.5, 653.8])
    const { parts, lefts } = cutSide(whole, anchors, views)
    const l = createShapes({ kindOf })
    l.addParts(parts.map(p => (p.pages[0] === 1 ? { ...p, layout: lay } : p)) as never)
    l.addPage(lefts[1]!)
    l.addPage(lefts[2]!)
    expect(l.shapes.hit(2, 550, mid(656), PAD, () => null)?.id).toBe(5)
    // (the right: unit 5 shown as the original's, its boxes the door's tokens, the number's among them)
    const r = layerShapes(l)
    const T = { n: 2, l: Float32Array.from([72, 540]), r: Float32Array.from([528, 556]), y: Float32Array.from([656, 656]), h: Float32Array.from([10, 10]), top: Float32Array.from([663.5, 663.5]), bottom: Float32Array.from([653.8, 653.8]) }
    r.lay(2, { tokens: T, word: Int32Array.from([-1, -1]), at: Int32Array.from([0, 0]), spans: [[5, [0, 2]]], original: [5] } as never)
    expect(r.shapes.hit(2, 550, mid(656), PAD, () => null)?.id).toBe(5)
  })

  it('hovering every point of a page whose displays have no token throws nothing, in any order the parts and pages come (Devin on #523)', () => {
    const { parts, lefts } = cutSide(whole, anchors, views)
    const withLay = parts.map(p => (p.pages[0] === 1 ? { ...p, layout: layout() } : p))
    const sweep = (S: { shapes: { hit: (p: number, x: number, y: number, pad: number, st: () => null) => unknown; runs: (id: number) => unknown[] } }) => { for (let y = 520; y < 780; y += 3) for (let x = 40; x < 560; x += 6) S.shapes.hit(1, x, y, PAD, () => null); S.shapes.runs(displayBlockId(1, 0)!) }
    for (const order of ['parts, pages', 'pages, parts', 'page 1, parts, page 2']) {
      const l = createShapes({ kindOf }), m = mirror(l)
      if (order === 'parts, pages') { l.addParts(withLay as never); l.addPage(lefts[1]!); l.addPage(lefts[2]!) }
      else if (order === 'pages, parts') { l.addParts(parts as never); l.addPage(lefts[1]!); l.addPage(lefts[2]!); l.addParts([{ pages: [1, 1], views: [], left: [], layout: layout() }] as never) }
      else { l.addParts(parts as never); l.addPage(lefts[1]!); l.addParts([{ pages: [1, 1], views: [], left: [], layout: layout() }] as never); l.addPage(lefts[2]!) }
      for (const S of [l, m]) expect(() => sweep(S), order).not.toThrow()
    }
  })

  it('a unit whose boxes come in one part and its location on another page in a later one lights on both pages, in either order and read whole (Devin on #523)', () => {
    // (unit 9: its line on page 1 in part A, no location there; part B locates it on page 2, by a repeated word)
    const word = at(2, 700)
    const a9 = new Map([...anchors, [9, { tokens: word, rects: lineRects(doc, word), coverage: 1, bounded: true, pairs: new Map(word.map((k, w) => [w, k])) }]]) as Map<number, Anchor | null>
    a9.delete(3)
    const w9 = layoutOf(doc, views, a9, kindOf)
    const { parts, lefts } = cutSide(w9, a9, views)
    const A = { pages: [1, 1], views: [], left: [], layout: { names: [], lines: [[9, row(1, 200, 230, 600)]], ph: [], labels: [] } }
    const runsOf = (order: string) => {
      const l = createShapes({ kindOf })
      const located = parts.map(p => ({ ...p, left: p.left }))
      if (order === 'A, then B') { l.addParts([A] as never); l.addParts(located as never) } else if (order === 'B, then A') { l.addParts(located as never); l.addParts([A] as never) } else l.addParts([A, ...located] as never)
      l.addPage(lefts[1]!); l.addPage(lefts[2]!)
      return { pages: l.shapes.runs(9).map(r => r.page).sort(), hit: l.shapes.hit(1, 215, mid(600), PAD, () => null)?.id, mirror: mirror(l).shapes.hit(1, 215, mid(600), PAD, () => null)?.id }
    }
    const together = runsOf('A and B together')
    expect(together).toEqual({ pages: [1, 2], hit: 9, mirror: 9 })
    for (const order of ['A, then B', 'B, then A']) expect(runsOf(order), order).toEqual(together)
  })

  it('a mirror made before a part brings a box of a located unit lights it too: the box\'s page drawn anew there (Devin on #523)', () => {
    const { parts, lefts } = cutSide(whole, anchors, views)
    const l = createShapes({ kindOf }), m = mirror(l)
    // (the page in place by a first part's lines, then a later part's box: a formula of unit 4 drawn as paths past its run's edge, at
    // 529-534, inside the column's overhang)
    const base = layout(), first = { ...base, lines: base.lines.map(([id, rows]) => (id === 4 ? [4, [...row(1, 72, 528, 560), ...row(1, 72, 492, 548), ...row(1, 72, 528, 536)]] : [id, rows])), ph: base.ph.filter(r => r[0] !== 4) }, later = { names: [], lines: [], ph: [[4, 0, PH_KINDS.indexOf('math'), 0, 1, 529, 548, 534, 555.5, 545.8]], labels: [] }
    l.addParts(parts.map(p => (p.pages[0] === 1 ? { ...p, layout: first } : p)) as never)
    l.addPage(lefts[1]!); l.addPage(lefts[2]!)
    expect(m.shapes.hit(1, 532.5, mid(548), PAD, () => null)?.id).not.toBe(4)
    l.addParts([{ pages: [1, 1], views: [], left: [], layout: later }] as never)
    expect([l.shapes.hit(1, 532.5, mid(548), PAD, () => null)?.id, m.shapes.hit(1, 532.5, mid(548), PAD, () => null)?.id]).toEqual([4, 4])
  })

  it('a placeholder whose ink the wrap could not hide (no group of its own) stays shown, though drawn as a crop: lit with its unit', () => {
    const seg = { kind: 'math', flags: 0, segs: [1, 420, 660, 426, 668, 658] }
    const lu = { erase: [[100, 658, 300, 670]], ph: new Map([[0, seg]]), labels: [] }
    const lines = { rects: [[1, 100, 658, 300, 670]], jOf: [0], lineOf: new Map() }
    const prep = Object.assign(new Map([[0, { mode: 'crop', k: 0, page: 1, crop: [420, 658, 426, 668], baseline: 660 }]]), { keep: [], uc: [], cat: new Map(), label: null })
    const shown = (has: (g: string) => boolean) => unitHiding({ page: 1, id: 5, lu: lu as never, kOf: [0], lines: lines as never, prep: prep as never, has }).shown.map(s => s.kind)
    expect(shown(() => true)).toEqual([])
    expect(shown(g => g !== 'u5.p')).toEqual(['piece'])
  })
})
