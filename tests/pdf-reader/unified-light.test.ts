import { describe, expect, it } from 'vitest'
import { CLIP_PAD, unitHiding } from '@/pdf-reader/engine/layer-proto/hide.mjs'
import { CELL_ID_FROM, DISPLAY_ID_FROM, DISPLAYS_UNIT, displayBlockId, displayBlockUnit, displayIdsOf, isDisplayBlock, isNameOccurrence, NAME_ID_FROM } from '@/pdf-reader/engine/layer-proto/units.mjs'
import { addBoxWords, addUnitWords, newWords } from '@/pdf-reader/engine/layer-proto/words.mjs'
import { UNIT_ID_MAX } from '@/pdf-reader/engine/layer-proto/format.mjs'
import { LABEL_KINDS, PH_FLAG, PH_KINDS } from '@/pdf-reader/engine/layout/file.mjs'
import { type Anchor, type DocToken, lineRects, tokenizeDocument } from '@/pdf-reader/engine/pipeline/anchors.mjs'
import { blockOf, layoutOf } from '@/pdf-reader/engine/view/highlight.mjs'
import { createShapes, layerShapes, mirror } from '@/pdf-reader/engine/view/shapes.mjs'
import { cutSide } from '../../lab/pdf/spikes/highlight-pages.mjs'

// One light map for both panes (the owner's rule of 2026-10-30, docs/PDF-READER.md §17.1): every block TeX sets as text or math lit
// the same on both panes, from the maker's inventory of our page (the parts' layouts: each unit's lines, its placeholders' segments,
// its labels). A display is a block of its own, its numbers included; a block's label lights with its first sentence; a unit's kept
// pieces and its numbers-only last line light with it; a unit the left does not locate lights by its boxes. The left takes arXiv's
// tokens under the boxes where the page is in place; the right lights what the door drew and what it kept of our page.

type Item = { str: string; transform: number[]; width: number; height: number; hasEOL: boolean; fontName: string }
const item = (str: string, x: number, y: number, width = str.length * 5, eol = false): Item => ({ str, transform: [10, 0, 0, 10, x, y], width, height: 10, hasEOL: eol, fontName: 'f' })
const WORDS = 'text text text text text text text text'
const prose = (y: number) => item(WORDS, 50, y, 500, true)
/** page 1, 600 × 800: a heading whose number is a mark with no text (y 760); a paragraph of three lines, a display with its number
 *  "(1)" in the margin (y 700), two lines more; a reference of two lines and a numbers-only last line (y 626); a paragraph the left
 *  does not locate (y 600, 588); a list item whose bullet is a mark (y 566) */
const items: Item[] = [
  item('Introduction', 62, 760, 60, true),
  prose(740), prose(728), prose(716),
  item('x', 250, 700, 10), item('=', 265, 700, 10), item('y', 280, 700, 10), item('(1)', 535, 700, 15, true),
  prose(684), prose(672),
  prose(650), prose(638), item('19-27.', 50, 626, 30, true),
  prose(600), prose(588),
  item(WORDS, 60, 566, 490, true),
]
const doc: DocToken[] = tokenizeDocument([{ page: 1, items, styles: {} }])
const at = (y: number, x0 = 0, x1 = 600) => doc.flatMap((t, k) => (Math.abs(t.y - y) < 1 && t.x >= x0 && t.x < x1 ? [k] : []))
const DISPLAY = at(700)
const UNITS = new Map<number, number[]>([
  [0, at(760)],
  [1, [...at(740), ...at(728), ...at(716), ...DISPLAY, ...at(684), ...at(672)]],
  [2, [...at(650), ...at(638)]],
  [4, at(566)],
])
const kindOf = (id: number) => (id === 0 ? 'heading' : 'para')
/** a unit's anchor: its text words paired one a token (a display's tokens are no word's) */
const anchorOf = (tokens: number[]): Anchor => {
  const words = tokens.filter(k => !DISPLAY.includes(k))
  return { tokens, rects: lineRects(doc, tokens), coverage: 1, bounded: true, pairs: new Map(words.map((k, w) => [w, k])) }
}
const anchors = new Map<number, Anchor | null>([...UNITS].map(([id, ts]) => [id, anchorOf(ts)]))
const views = [[0, 0, 600, 800]]
const whole = layoutOf(doc, views, anchors, kindOf)
const textOf = (id: number) => (UNITS.get(id) ?? []).filter(k => !DISPLAY.includes(k)).map(() => 'text').join(' ')
const PAD = 2.25
const DK = PH_KINDS.indexOf('display'), LN = LABEL_KINDS.indexOf('number'), LI = LABEL_KINDS.indexOf('item')
/** a line of the layout file (page, x0, x1, baseline, top, bottom, size, font), its box as arXiv's tokens stand, moved up by `dy` */
const row = (x0: number, x1: number, y: number, dy = 0) => [1, x0, x1, y + dy, y + 7.5 + dy, y - 2.2 + dy, 10, 0]
/** the maker's inventory of the page, as a part's layout carries it; `dy` our page set apart from arXiv's (a page moved) */
const layoutOf1 = (dy = 0) => ({
  names: [],
  lines: [
    [0, row(62, 122, 760, dy)],
    [1, [...row(50, 550, 740, dy), ...row(50, 550, 728, dy), ...row(50, 550, 716, dy), ...row(250, 550, 700, dy), ...row(50, 550, 684, dy), ...row(50, 550, 672, dy)]],
    [2, [...row(50, 550, 650, dy), ...row(50, 550, 638, dy), ...row(50, 80, 626, dy)]],
    [3, [...row(50, 550, 600, dy), ...row(50, 550, 588, dy)]],
    [4, row(60, 550, 566, dy)],
  ],
  // (the display; and the heading's piece at 125-140, a symbol the page's text gives no token for)
  ph: [[0, 1, PH_KINDS.indexOf('math'), 0, 1, 125, 760 + dy, 140, 767.5 + dy, 757.8 + dy], [1, 3, DK, PH_FLAG.NUMBERED, 1, 250, 700 + dy, 550, 707.5 + dy, 697.8 + dy]],
  labels: [[0, LN, 1, 50, 760 + dy, 58, 767.5 + dy, 757.8 + dy], [4, LI, 1, 50, 566 + dy, 55, 573.5 + dy, 563.8 + dy]],
})
function side(dy = 0, withLayout = true) {
  const { parts, lefts } = cutSide(whole, anchors, views)
  const l = createShapes({ kindOf })
  l.addParts((withLayout ? parts.map(p => ({ ...p, layout: layoutOf1(dy) })) : parts) as never)
  l.addPage(lefts[1]!)
  return l
}
const mid = (y: number) => y + 2.65
const DID = displayBlockId(1, 0)!

describe('display blocks\' hover ids (layer-proto/units.mjs)', () => {
  it('past every bundle id and every name\'s, below the tables\' cells\': a unit\'s displays by their place among its own, any order', () => {
    expect(NAME_ID_FROM).toBeGreaterThan(UNIT_ID_MAX)
    expect(DISPLAY_ID_FROM).toBeGreaterThan(NAME_ID_FROM)
    expect(displayBlockId(NAME_ID_FROM - 1, DISPLAYS_UNIT - 1)!).toBeLessThan(CELL_ID_FROM)
    expect([isDisplayBlock(DID), isNameOccurrence(DID), displayBlockUnit(DID)]).toEqual([true, false, 1])
    expect([displayBlockId(-1, 0), displayBlockId(NAME_ID_FROM, 0), displayBlockId(1, DISPLAYS_UNIT), displayBlockId(1.5, 0)]).toEqual([null, null, null, null])
    // (the door reads a unit's rows by piece, the view a part's: the same ids whatever order they are read in)
    expect([...displayIdsOf(7, [12, 3, 40])]).toEqual([[3, displayBlockId(7, 0)], [12, displayBlockId(7, 1)], [40, displayBlockId(7, 2)]])
    expect(displayIdsOf(7, [40, 3, 12, 3])).toEqual(displayIdsOf(7, [3, 12, 40]))
  })
})

describe('the left: blocks told by the inventory\'s boxes on a page in place (view/shapes.mjs)', () => {
  it('a display is a block of its own, its number included, lit whole, and never its unit\'s', () => {
    const l = side()
    const h = l.shapes.hit(1, 300, mid(700), PAD, () => null)
    expect([h?.id, h?.s]).toEqual([DID, -1])
    expect(l.shapes.hit(1, 542, mid(700), PAD, () => null)?.id).toBe(DID)
    const b = blockOf(l.shapes.runs(DID)[0]!, PAD)
    expect([b.x0 <= 250, b.x1 >= 550]).toEqual([true, true])
    // (its unit lights around it: a run above the display and one below, and nothing of its unit is painted over it)
    const runs = l.shapes.runs(1)
    expect(runs.length).toBe(2)
    for (const r of runs) { const rb = blockOf(r, PAD); expect(rb.y0 > 707.5 || rb.y1 < 697.8).toBe(true) }
  })

  it('a sentence lights whole across the display: its rows above and below it', () => {
    const l = side()
    // (sentence 0 the paragraph's lines above the display and the first half of the line below it; sentence 1 from word 28)
    const starts = l.starts(1, textOf(1), [5 * 28])
    expect(starts).not.toBeNull()
    const runs = l.shapes.runs(1)
    for (const r of runs) expect(l.shapes.sentence(r, starts!, 0, PAD).length).toBeGreaterThan(0)
    expect(l.shapes.fits(1, starts!, true)).toBe(true)
    expect(l.shapes.hit(1, 100, mid(684), PAD, () => starts)).toMatchObject({ id: 1, s: 0 })
  })

  it('a label lights with its block: a heading\'s number drawn as a mark, a bullet with the first sentence', () => {
    const l = side()
    expect(l.shapes.hit(1, 54, mid(760), PAD, () => null)?.id).toBe(0)
    const starts = l.starts(4, textOf(4), [5 * 4])
    expect(starts).not.toBeNull()
    expect(l.shapes.hit(1, 52, mid(566), PAD, () => starts)).toMatchObject({ id: 4, s: 0 })
  })

  it('a kept piece with no token of the page\'s (a symbol drawn as a path) widens its unit\'s row: lit with it', () => {
    expect(side().shapes.hit(1, 132, mid(760), PAD, () => null)?.id).toBe(0)
    expect(side(0, false).shapes.hit(1, 132, mid(760), PAD, () => null)).toBeNull()
  })

  it('a unit\'s numbers-only last line lights with it; a unit the left does not locate lights by its lines', () => {
    const l = side()
    expect(l.shapes.hit(1, 60, mid(626), PAD, () => null)?.id).toBe(2)
    expect(Math.min(...l.shapes.runs(2).map(r => blockOf(r, PAD).y0))).toBeLessThan(626)
    expect(l.shapes.hit(1, 300, mid(600), PAD, () => null)?.id).toBe(3)
  })

  it('without the inventory, as before: the display its paragraph\'s, the mark and the last line unlit, the unlocated dark', () => {
    const l = side(0, false)
    expect(l.shapes.hit(1, 300, mid(700), PAD, () => null)?.id).toBe(1)
    expect(l.shapes.hit(1, 54, mid(760), PAD, () => null)).toBeNull()
    expect(l.shapes.hit(1, 60, mid(626), PAD, () => null)).toBeNull()
    expect(l.shapes.runs(3)).toEqual([])
  })

  it('a display takes its own unit\'s tokens and the free ones, never another unit\'s (a table\'s cells set in a display keep theirs)', () => {
    // (the "(1)" a cell's of its own, unit 6, inside unit 1's display segment)
    const num = at(700, 530)
    const a2 = new Map([...anchors, [1, anchorOf((UNITS.get(1) ?? []).filter(k => !num.includes(k)))], [6, anchorOf(num)]])
    const w2 = layoutOf(doc, views, a2, id => (id === 6 ? 'cell' : kindOf(id)))
    const { parts, lefts } = cutSide(w2, a2, views)
    const l = createShapes({ kindOf: id => (id === 6 ? 'cell' : kindOf(id)) })
    l.addParts(parts.map(p => ({ ...p, layout: layoutOf1() })) as never)
    l.addPage(lefts[1]!)
    expect([l.shapes.hit(1, 542, mid(700), PAD, () => null)?.id, l.shapes.hit(1, 270, mid(700), PAD, () => null)?.id]).toEqual([6, DID])
  })

  it('a located unit that begins with its display begins after it: the display\'s first token is the display\'s alone (Codex on #522)', () => {
    // (unit 1 the three lines above; unit 7 a paragraph that opens with the display, its stream the display's first token)
    const a7 = new Map([...anchors, [1, anchorOf([...at(740), ...at(728), ...at(716)])], [7, anchorOf([...DISPLAY, ...at(684), ...at(672)])]])
    const w7 = layoutOf(doc, views, a7, kindOf)
    const lay = layoutOf1()
    const lines7 = lay.lines.map(([id, rows]) => (id === 1 ? [1, (rows as number[]).slice(0, 24)] : [id, rows])) as typeof lay.lines
    lines7.push([7, [...row(250, 550, 700), ...row(50, 550, 684), ...row(50, 550, 672)]])
    const ly7 = { ...lay, lines: lines7, ph: [[7, 0, DK, PH_FLAG.NUMBERED, 1, 250, 700, 550, 707.5, 697.8]] }
    const D7 = displayBlockId(7, 0)!
    for (const order of ['parts first', 'page first'] as const) {
      const { parts, lefts } = cutSide(w7, a7, views)
      const l = createShapes({ kindOf }), m = mirror(l)
      if (order === 'parts first') { l.addParts(parts.map(p => ({ ...p, layout: ly7 })) as never); l.addPage(lefts[1]!) } else { l.addParts(parts as never); l.addPage(lefts[1]!); l.addParts([{ pages: [1, 1], views: [], left: [], layout: ly7 }] as never) }
      for (const S of [l, m]) {
        expect((S.layout as unknown as { anchors: Map<number, { tokens: number[] }> }).anchors.get(7)!.tokens.some(k => DISPLAY.includes(k)), order).toBe(false)
        expect(S.shapes.hit(1, 255, mid(700), PAD, () => null)?.id, order).toBe(D7)
        for (const r of S.shapes.runs(7)) { const b = blockOf(r, PAD); expect(b.y0 > 707.5 || b.y1 < 697.8, order).toBe(true) }
      }
    }
  })

  it('a page moved (our lines elsewhere than arXiv\'s): nothing told by the boxes, what the left part locates lights as before', () => {
    const l = side(40)
    expect(l.shapes.hit(1, 300, mid(700), PAD, () => null)?.id).toBe(1)
    expect(l.shapes.runs(3)).toEqual([])
    expect(l.shapes.runs(DID)).toEqual([])
  })

  it('the boxes come after the page (a part late): told then, on the left and on a mirror made before', () => {
    const { parts, lefts } = cutSide(whole, anchors, views)
    const l = createShapes({ kindOf }), m = mirror(l)
    l.addParts(parts as never)
    l.addPage(lefts[1]!)
    expect(l.shapes.hit(1, 300, mid(700), PAD, () => null)?.id).toBe(1)
    l.addParts([{ pages: [1, 1], views: [], left: [], layout: layoutOf1() }] as never)
    expect([l.shapes.hit(1, 300, mid(700), PAD, () => null)?.id, m.shapes.hit(1, 300, mid(700), PAD, () => null)?.id]).toEqual([DID, DID])
    expect([l.shapes.runs(1).length, m.shapes.runs(1).length, m.shapes.runs(3).length]).toEqual([2, 2, 1])
  })
})

describe('the right: what the door drew and what it kept of our page (layer-proto/hide.mjs, words.mjs; view/shapes.mjs layerShapes)', () => {
  const grown = (b: number[]) => [b[0]! - CLIP_PAD, b[1]! - CLIP_PAD, b[2]! + CLIP_PAD, b[3]! + CLIP_PAD]
  const lu = (o: { ph?: Map<number, unknown>; labels?: number[] } = {}) => ({ erase: [[100, 698, 300, 710]], ph: o.ph ?? new Map(), labels: o.labels ?? [] })
  const lines = { rects: [[1, 100, 698, 300, 710]], jOf: [0], lineOf: new Map() }
  const reading = (o: { res?: [number, { mode: string; k: number }][]; label?: unknown } = {}) => Object.assign(new Map(o.res ?? []), { keep: [], uc: [], cat: new Map(), label: o.label ?? null })

  it('unitHiding tells what of the unit stays shown: every display under its id, the pieces kept where they stand, its label unless drawn anew', () => {
    const seg = (kind: string, x: number) => ({ kind, flags: 0, segs: [1, x, 700, x + 10, 708, 698] })
    const ph = new Map<number, unknown>([[0, seg('cite', 120)], [1, seg('cite', 140)], [2, seg('display', 160)], [5, seg('display', 200)]])
    const h = unitHiding({ page: 1, id: 5, lu: lu({ ph, labels: [0, 1, 80, 700, 95, 710, 698] }) as never, kOf: [0, 1, 2, -1, -1, 5], lines: lines as never, prep: reading({ res: [[0, { mode: 'text', k: 0 }], [1, { mode: 'kept', k: 1 }]] }) as never })
    expect(h.fromB).toEqual([grown([140, 698, 150, 708]), grown([160, 698, 170, 708]), grown([200, 698, 210, 708])])
    expect(h.shown.map(s => [s.kind, s.k ?? null, s.id ?? null, s.box])).toEqual([
      ['piece', 1, null, [140, 698, 150, 708]],
      ['display', 2, displayBlockId(5, 0), [160, 698, 170, 708]],
      ['display', 5, displayBlockId(5, 1), [200, 698, 210, 708]],
      ['label', null, null, [80, 698, 95, 710]],
    ])
    // (no piece moved: every piece shown where it stands; a label drawn anew: not shown, it is drawn)
    const kept = unitHiding({ page: 1, id: 5, lu: lu({ ph: new Map([[0, seg('cite', 120)]]), labels: [0, 1, 80, 700, 95, 710, 698] }) as never, kOf: [0], lines: lines as never, prep: reading({ res: [[0, { mode: 'kept', k: 0 }]], label: { drawn: 'One', chars: [] } }) as never })
    expect(kept.shown.map(s => s.kind)).toEqual(['piece'])
  })

  it('the word table: the label first at the text\'s start, a kept piece at its place, each display a span of its own; a kept line inside a display its display\'s', () => {
    const W = newWords()
    const kept = [{ x0: 160, x1: 170, baseline: 700, size: 10, top: 708, bottom: 698, region: 0, k: 2 }, { x0: 100, x1: 300, baseline: 650, size: 10, top: 658, bottom: 648, block: 0 }]
    const shown = [
      { kind: 'label' as const, box: [80, 698, 95, 710], base: 700 },
      { kind: 'piece' as const, k: 1, box: [140, 698, 150, 708], base: 700 },
      { kind: 'display' as const, k: 2, id: displayBlockId(5, 0), box: [160, 698, 170, 708], base: 700 },
    ]
    addUnitWords(W, { lines: [] } as never, 1, 5, null, kept as never, () => true, Int32Array.from([0, 6, 12]), shown)
    expect(W.spans).toEqual([[5, [0, 3]], [displayBlockId(5, 0), [3, 1]]])
    expect([...W.at.slice(0, 4)]).toEqual([0, 0, 6, 12])
    expect([W.l[0], W.l[1], W.l[2], W.l[3]]).toEqual([80, 100, 140, 160])
  })

  it('a kept character takes the place of the token beside it on its row: its sentence there, not the last one\'s (2610.21547v1 p19)', () => {
    const W = newWords()
    // (two drawn lines: the first in the translation's first sentence, at 0–9, the second in its last, at 40–49; a character kept on the first)
    const L = { f: 10, scale: 1, lines: [0, 1].map(j => ({ page: 1, baseline: 700 - 20 * j, items: [{ t: { s: 'ab', at: 40 * j, end: 40 * j + 9, face: { size: 1 } }, x: 100, w: 50 }] })) }
    addUnitWords(W, L as never, 1, 5, () => 0, [], () => true, null, [{ kind: 'char', box: [160, 698, 166, 708], base: 700 }])
    expect([W.n, W.at[2]]).toEqual([3, 0])
    // (one that meets a display's segments is the display's ink, lit with it: 2610.21547v1 p19's glyphs under its display k24)
    const D = newWords(), disp = { kind: 'display' as const, k: 0, id: displayBlockId(5, 0), box: [150, 709, 200, 730], base: 712 }
    addUnitWords(D, L as never, 1, 5, () => 0, [], () => true, Int32Array.from([30]), [disp, { kind: 'char', box: [160, 705, 166, 715], base: 707 }])
    expect(D.spans).toEqual([[5, [0, 2]], [displayBlockId(5, 0), [2, 1]]])
  })

  it('a kept line on a display\'s rows is the display\'s, though its middle falls between the formula and its number (2609.26457v1 p3)', () => {
    const W = newWords()
    const kept = [{ x0: 249, x1: 534, baseline: 258, size: 10, top: 269, bottom: 255, region: 0, k: 2 }]
    const shown = [
      { kind: 'display' as const, k: 2, id: displayBlockId(5, 0), box: [249, 245, 346, 276], base: 255 },
      { kind: 'display' as const, k: 2, id: displayBlockId(5, 0), box: [519, 257, 534, 266], base: 258 },
    ]
    addUnitWords(W, { lines: [] } as never, 1, 5, null, kept as never, () => true, Int32Array.from([0, 6, 12]), shown)
    expect(W.spans).toEqual([[5, []], [displayBlockId(5, 0), [0, 2]]])
  })

  it('a unit shown as the original: its boxes on our page its tokens, its displays under their ids, nothing where it has none', () => {
    const W = newWords()
    const ph = new Map([[0, { kind: 'cite', segs: [1, 120, 700, 130, 708, 698] }], [3, { kind: 'display', segs: [1, 100, 680, 300, 688, 678] }]])
    const unit = { lines: [1, 100, 300, 700, 708, 698, 10, 0, 1, 100, 300, 680, 688, 678, 10, 0, 2, 100, 300, 700, 708, 698, 10, 0], labels: [0, 1, 80, 700, 95, 710, 698], ph }
    addBoxWords(W, 1, 9, unit as never, displayIdsOf(9, [3]))
    // (its label, its line on the page but the display's, its piece; then its display: page 2's line no token here)
    expect(W.spans).toEqual([[9, [0, 3]], [displayBlockId(9, 0), [3, 1]]])
    addBoxWords(W, 3, 9, unit as never)
    expect(W.spans.length).toBe(2)
    // (a page where its only line is its display's: its span is empty, so that the right copies none of the left's tokens of it,
    // its display lit once, as itself: Devin on #522)
    const V = newWords(), alone = { lines: [1, 100, 300, 680, 688, 678, 10, 0], labels: [], ph: new Map([[3, { kind: 'display', segs: [1, 100, 680, 300, 688, 678] }]]) }
    addBoxWords(V, 1, 9, alone as never, displayIdsOf(9, [3]))
    expect(V.spans).toEqual([[9, []], [displayBlockId(9, 0), [0, 1]]])
  })

  it('a laid page lights what the door drew and kept, never the original\'s places of a label or a piece it moved (Devin on #522)', () => {
    const l = side(), r = layerShapes(l)
    // (the heading drawn at 80-120, its number drawn anew elsewhere and its piece moved: neither box of our page there any more)
    const T = { n: 1, l: Float32Array.from([80]), r: Float32Array.from([120]), y: Float32Array.from([760]), h: Float32Array.from([10]), top: Float32Array.from([767.5]), bottom: Float32Array.from([757.8]) }
    r.lay(1, { tokens: T, word: Int32Array.from([0]), at: Int32Array.from([0]), spans: [[0, [0, 1]]], original: [] } as never)
    const b = blockOf(r.shapes.runs(0)[0]!, PAD)
    expect([b.x0 > 75, b.x1 < 125]).toEqual([true, true])
    // (the mirror, arXiv's page, keeps them: the left's geometry)
    expect(mirror(l).shapes.hit(1, 54, mid(760), PAD, () => null)?.id).toBe(0)
  })

  it('a laid page lights the display, the label and a unit shown as the original from its own table, as the left does', () => {
    const l = side()
    const r = layerShapes(l)
    // (our page: the heading drawn with its kept number; the paragraph drawn above and below its display, kept; unit 3 the original's)
    const boxes: number[][] = [[50, 757.8, 58, 767.5], [62, 757.8, 120, 767.5], [50, 737.8, 550, 747.5], [50, 681.8, 550, 691.5], [250, 697.8, 550, 707.5], [50, 597.8, 550, 607.5], [50, 585.8, 550, 595.5]]
    const T = { n: boxes.length, l: Float32Array.from(boxes, b => b[0]!), r: Float32Array.from(boxes, b => b[2]!), y: Float32Array.from(boxes, b => b[1]! + 2.2), h: Float32Array.from(boxes, () => 10), top: Float32Array.from(boxes, b => b[3]!), bottom: Float32Array.from(boxes, b => b[1]!) }
    r.lay(1, { tokens: T, word: Int32Array.from([-1, 0, 0, 1, -1, -1, -1]), at: Int32Array.from([0, 0, 0, 5, 4, 0, 0]), spans: [[0, [0, 2]], [1, [2, 2]], [DID, [4, 1]], [3, [5, 2]]], original: [2, 3, 4] } as never)
    expect(r.laid(1)).toBe(true)
    expect([r.shapes.hit(1, 300, 702, PAD, () => null)?.id, r.shapes.hit(1, 54, 762, PAD, () => null)?.id, r.shapes.hit(1, 300, 602, PAD, () => null)?.id]).toEqual([DID, 0, 3])
    expect(r.shapes.runs(1).length).toBe(2)
  })
})

describe('a sentence across its unit\'s display: the rows either side of it reach no further than their ink (2610.40645v1 p14)', () => {
  // (unit 1: two full lines, a short one TeX ended at its display, the display, two full lines after it; sentence 0 the 18 words
  // above the display and the first 4 below it. The short row reached the column's edge, 450 units of blank lit after its words)
  const its: Item[] = [prose(740), prose(728), item('text text', 50, 716, 50, true), item('x', 250, 700, 10), item('=', 265, 700, 10), item('y', 280, 700, 10), item('(1)', 535, 700, 15, true), prose(684), prose(672)]
  const d1: DocToken[] = tokenizeDocument([{ page: 1, items: its, styles: {} }])
  const on = (y: number) => d1.flatMap((t, k) => (Math.abs(t.y - y) < 1 ? [k] : []))
  const disp = on(700), ts = [...on(740), ...on(728), ...on(716), ...disp, ...on(684), ...on(672)]
  const words = ts.filter(k => !disp.includes(k))
  const a = new Map<number, Anchor | null>([[1, { tokens: ts, rects: lineRects(d1, ts), coverage: 1, bounded: true, pairs: new Map(words.map((k, w) => [w, k])) }]])
  const lay1 = {
    names: [],
    lines: [[1, [...row(50, 550, 740), ...row(50, 550, 728), ...row(50, 100, 716), ...row(250, 550, 700), ...row(50, 550, 684), ...row(50, 550, 672)]]],
    ph: [[1, 3, DK, PH_FLAG.NUMBERED, 1, 250, 700, 550, 707.5, 697.8]],
    labels: [],
  }
  const text1 = words.map(() => 'text').join(' ')

  it('the row before the display ends at its words, the rows above it reach the edge, and every word stays in its sentence', () => {
    const { parts, lefts } = cutSide(layoutOf(d1, views, a, kindOf), a, views)
    const l = createShapes({ kindOf })
    l.addParts(parts.map(p => ({ ...p, layout: lay1 })) as never)
    l.addPage(lefts[1]!)
    const starts = l.starts(1, text1, [5 * 22])
    expect(starts).not.toBeNull()
    expect(l.shapes.fits(1, starts!, true)).toBe(true)
    const above = l.shapes.runs(1).find(r => blockOf(r, PAD).y0 > 707.5)!
    const rects = l.shapes.sentence(above, starts!, 0, PAD)
    // (the two full rows one rectangle to the edge, the short one to its words' end)
    expect(rects.map(r => [Math.round(r.x0), Math.round(r.x1)])).toEqual([[48, 552], [48, 102]])
    // (and its blank past the words lights nothing; its words light their sentence, the display its own block)
    expect(l.shapes.hit(1, 300, mid(716), PAD, () => starts)).toBeNull()
    expect(l.shapes.hit(1, 70, mid(716), PAD, () => starts)).toMatchObject({ id: 1, s: 0 })
    expect(l.shapes.hit(1, 300, mid(700), PAD, () => starts)?.id).toBe(DID)
    // (the row after the display, the sentence's last there, from the edge to its end as before)
    expect(l.shapes.hit(1, 60, mid(684), PAD, () => starts)).toMatchObject({ id: 1, s: 0 })
  })
})
