import { describe, expect, it } from 'vitest'
import { type Anchor, type DocToken, lineRects, tokenizeDocument } from '@/pdf-reader/engine/anchors.mjs'
import { type Box, captionFor, floatHitOf, floatOf, floatsAgree, floatShapes, floatsOn, pageFloats, pathsOf, wantsFloats } from '@/pdf-reader/engine/floats.mjs'
import { blockOf, hitOf, layoutOf, runsOf } from '@/pdf-reader/engine/highlight.mjs'

// A page's floats (floats.mjs): tables, algorithms and figures lit whole with their captions. Pages as PDF.js's text
// items, as highlight.test.ts has them: 600 × 800, body text 10 high on lines 12 apart, its glyphs from 2.2 under the
// baseline to 7.5 over it. The prose ("text text …") is running text, one unit a page; the other words are free (a
// table's rows, an algorithm's) unless a test gives them to a unit (a caption, a cell)

type Item = { str: string; transform: number[]; width: number; height: number; hasEOL: boolean; fontName: string }
const item = (str: string, x: number, y: number, { width = str.length * 5, size = 10, eol = false } = {}): Item => ({ str, transform: [size, 0, 0, size, x, y], width, height: size, hasEOL: eol, fontName: 'f' })
const line = (s: string, y: number, x0 = 50, x1 = 300) => item(s, x0, y, { width: x1 - x0, eol: true })
const prose = (y: number, n: number, x0 = 50, x1 = 300) => Array.from({ length: n }, (_, i) => line('text text text text text text text text', y - 12 * i, x0, x1))
/** a row of a table: its cells' words at 60, 160 and 240 */
const row = (y: number, a: string, b: string, c: string) => [item(a, 60, y), item(b, 160, y), item(c, 240, y, { eol: true })]
const VIEW = [0, 0, 600, 800]
const docOf = (pages: Item[][]) => tokenizeDocument(pages.map((items, i) => ({ page: i + 1, items, styles: {} })))
/** a side's layout: `units` the units anchored, the prose the rest; `free` words no unit's (a unit not located there) */
function side(pages: Item[][], units: [number, number[]][], kinds: Record<number, string> = {}, free: number[] = []) {
  const doc = docOf(pages)
  const used = new Set([...units.flatMap(([, ks]) => ks), ...free])
  const rest = pages.map((_, i) => [1000 + i, doc.flatMap((t, k) => (t.page === i + 1 && t.t === 'text' && !used.has(k) ? [k] : []))] as [number, number[]]).filter(([, ks]) => ks.length)
  const anchors = new Map<number, Anchor | null>([...units, ...rest].map(([id, tokens]) => [id, { tokens, rects: lineRects(doc, tokens), coverage: 1, bounded: true }]))
  return layoutOf(doc, pages.map(() => VIEW), anchors, id => kinds[id])
}
const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i)
const at = (doc: DocToken[], t: string, from = 0) => doc.findIndex((d, k) => k >= from && d.t === t)
/** a unit of the words from `from` to `to`, both included */
const words = (doc: DocToken[], from: string, to: string, after = 0) => { const a = at(doc, from, after); return range(a, at(doc, to, a)) }
/** a thin horizontal rule across x0–x1 at y, 0.4 thick */
const hrule = (x0: number, x1: number, y: number) => ({ x0, x1, y0: y - 0.2, y1: y + 0.2, v: false })
const r1 = (b: Box) => [b.x0, b.y0, b.x1, b.y1].map(v => Math.round(v * 10) / 10)

describe('pathsOf: a page\'s rules and marks from PDF.js\'s operator list', () => {
  const OPS = { save: 1, restore: 2, transform: 3, setLineWidth: 4, paintFormXObjectBegin: 5, paintFormXObjectEnd: 6, beginAnnotation: 7, endAnnotation: 8, constructPath: 9, stroke: 10, fill: 11, eoFill: 12, endPath: 13 }
  const list = (ops: [number, unknown[]][]) => ({ fnArray: ops.map(o => o[0]), argsArray: ops.map(o => o[1]) })
  const path = (op: number, mm: number[] | null) => [OPS.constructPath, [op, [null], mm ? Float32Array.from(mm) : null]] as [number, unknown[]]

  it('a stroked line is a rule, widened by half its width, under the transform in force (PDF.js 6: [op, data, minMax])', () => {
    const { rules, marks } = pathsOf(list([
      [OPS.save, []], [OPS.transform, [1, 0, 0, 1, 100, 200]], [OPS.setLineWidth, [0.4]], path(OPS.stroke, [0, 0, 200, 0]), [OPS.restore, []],
      // after the restore the transform and the width are the page's again
      path(OPS.stroke, [50, 50, 250, 50]),
      [OPS.setLineWidth, [3]], path(OPS.stroke, [50, 80, 250, 80]),
    ]), OPS)
    expect(rules.map(r => [...r1(r), r.v])).toEqual([[99.8, 199.8, 300.2, 200.2, false], [49.5, 49.5, 250.5, 50.5, false]])
    // a stroke 3 thick is too thick for a rule
    expect(marks.map(r1)).toEqual([[48.5, 78.5, 251.5, 81.5]])
  })

  it('a thin filled box is a rule, a tall one a vertical rule; a filled area a mark', () => {
    const { rules, marks } = pathsOf(list([path(OPS.fill, [60, 100, 300, 100.4]), path(OPS.eoFill, [60, 100, 60.4, 140]), path(OPS.fill, [60, 200, 100, 260])]), OPS)
    expect(rules.map(r => [...r1(r), r.v])).toEqual([[60, 100, 300, 100.4, false], [60, 100, 60.4, 140, true]])
    expect(marks.map(r1)).toEqual([[60, 200, 100, 260]])
  })

  it('nothing inside a form (a figure\'s own lines) or an annotation, no clip, no path of moves alone', () => {
    const { rules, marks } = pathsOf(list([
      [OPS.paintFormXObjectBegin, [[1, 0, 0, 1, 0, 0], [0, 0, 100, 100]]], path(OPS.fill, [0, 0, 100, 0.4]), [OPS.paintFormXObjectEnd, []],
      [OPS.beginAnnotation, []], path(OPS.fill, [0, 0, 100, 0.4]), [OPS.endAnnotation, []],
      path(OPS.endPath, [0, 0, 100, 0.4]),
      path(OPS.fill, [Infinity, Infinity, -Infinity, -Infinity]),
      path(OPS.fill, null),
    ]), OPS)
    expect([rules, marks]).toEqual([[], []])
  })
})

describe('pageFloats: a table from its caption to its rules', () => {
  // prose, a caption, a table under it — booktabs: a rule over it, one under its head row, one under it — and prose
  const pages = [[...prose(740, 10), line('Table 1: scores of the runs', 610, 80, 270), ...row(588, 'method', 'score', 'time'), ...row(574, 'alpha', '12', '3'), ...row(562, 'beta', '14', '5'), ...row(550, 'gamma', '9', '4'), ...prose(530, 10)]]
  const rules = [hrule(55, 295, 598), hrule(55, 295, 584), hrule(55, 295, 545)]
  const d = docOf(pages)
  const units: [number, number[]][] = [[0, words(d, 'table', 'runs')], [5, [at(d, 'alpha')]]]
  const L = () => side(pages, units, { 0: 'caption', 5: 'cell' })

  it('its rows and its rules, as wide as the rules, from the rule over it to the one under it; not the prose after it', () => {
    const fs = pageFloats(L(), 1, [], { rules, marks: [] })
    expect(fs.map(f => [f.id, f.kind, ...r1(f.region)])).toEqual([[0, 'table', 55, 544.8, 295, 598.2]])
  })

  it('a table drawn with | as wide as its vertical rules, which stand past its words', () => {
    const v = (x: number) => ({ x0: x - 0.2, x1: x + 0.2, y0: 544.8, y1: 598.2, v: true })
    const fs = pageFloats(L(), 1, [], { rules: [hrule(60, 280, 598), hrule(60, 280, 545), v(52), v(288)] })
    expect(fs.map(f => r1(f.region))).toEqual([[51.8, 544.8, 288.2, 598.2]])
  })

  it('it holds its cells', () => {
    expect([...(pageFloats(L(), 1, [], { rules }).find(f => f.id === 0)?.members ?? [])]).toEqual([5])
  })

  it('one wash over the table and its caption, padded as a block is', () => {
    const layout = L(), f = pageFloats(layout, 1, [], { rules })[0]!, cap = blockOf(runsOf(layout, 0)[0]!, 2)
    const [s] = floatShapes(layout, f, 2)
    expect(floatShapes(layout, f, 2).length).toBe(1)
    expect(s?.frame).toBe(false)
    expect(r1(s!)).toEqual(r1({ x0: 53, x1: 297, y0: 544.8 - f.lead, y1: cap.y1 }))
  })

  it('a table\'s cell lights the table; a point of the wash between its words, too; the prose around it its own', () => {
    const layout = L(), pad = 2
    pageFloats(layout, 1, [], { rules })
    const hit = (x: number, y: number) => floatHitOf(layout, 1, x, y, pad, hitOf(layout, 1, x, y, pad))?.id
    expect(hitOf(layout, 1, 70, 577, pad)?.id).toBe(5)
    expect([hit(70, 577), hit(200, 568), hit(290, 598), hit(150, 612)]).toEqual([0, 0, 0, 0])
    expect([hit(150, 520), hit(150, 700)]).toEqual([1000, 1000])
  })

  it('a cell finds its table, a caption its own; a unit of no float none', () => {
    const layout = L()
    pageFloats(layout, 1, [], { rules })
    expect([floatOf(layout, 5)?.id, floatOf(layout, 0)?.id, floatOf(layout, 1000)]).toEqual([0, 0, null])
  })

  it('made once, on the page\'s first drawing; a page without a caption wants none', () => {
    const layout = L()
    expect(floatsOn(layout, 1)).toBeUndefined()
    const fs = pageFloats(layout, 1, [], { rules })
    expect(pageFloats(layout, 1, [], {})).toBe(fs)
    expect([wantsFloats(layout, 1), wantsFloats(side([prose(740, 30)], []), 1)]).toEqual([true, false])
  })

  it('bounded by its own rules: the next float\'s rule a float\'s skip under it is not the table\'s (round 1\'s table I, 2608.06701)', () => {
    // under the table an algorithm, set 14 units further: its rule, its caption, its lines, its rule
    const ps = [[...prose(740, 10), line('Table 1: scores of the runs', 610, 80, 270), ...row(588, 'method', 'score', 'time'), ...row(574, 'alpha', '12', '3'), ...row(562, 'beta', '14', '5'), ...row(550, 'gamma', '9', '4'),
      line('Algorithm 1 the loop of runs', 522, 160, 295), line('repeat the steps', 508, 160, 260), line('until it is done', 496, 160, 260), ...prose(470, 10)]]
    const dd = docOf(ps)
    const layout = side(ps, [[0, words(dd, 'table', 'runs')], [1, words(dd, 'the', 'runs', at(dd, 'algorithm'))]], { 0: 'caption', 1: 'caption' })
    const fs = pageFloats(layout, 1, [], { rules: [...rules, hrule(160, 295, 532), hrule(160, 295, 518), hrule(160, 295, 490)] })
    expect(fs.map(f => [f.id, f.kind, ...r1(f.region)]).sort()).toEqual([[0, 'table', 55, 544.8, 295, 598.2], [1, 'table', 160, 489.8, 295, 532.2]])
  })
})

describe('pageFloats: a table without rules (the review of B4, probe G)', () => {
  it('its first column further left than its narrow caption, its cells on two lines: the cells of a row are one table\'s', () => {
    const ps = [[...prose(780, 4), line('Table 2: notes', 690, 140, 220),
      item('first part', 60, 672, { eol: true }), item('of the row', 60, 662, { eol: true }), item('value one', 160, 672, { eol: true }),
      item('second part', 60, 646, { eol: true }), item('of the row', 60, 636, { eol: true }), item('value two', 160, 646, { eol: true }),
      ...prose(610, 10)]]
    const dd = docOf(ps)
    const layout = side(ps, [[0, words(dd, 'table', 'notes')]], { 0: 'caption' })
    expect(pageFloats(layout, 1).map(f => [f.kind, ...r1(f.region)])).toEqual([['table', 60, 633.8, 205, 679.5]])
  })
})

describe('pageFloats: two tables without rules side by side', () => {
  it('each with its caption under it, TeX setting the left whole before the right: a row\'s lines across the two are not one table\'s', () => {
    const ps = [[...prose(780, 4), item('one', 60, 700), item('two', 110, 700, { eol: true }), item('ten', 60, 688), item('six', 110, 688, { eol: true }), line('Table 3: left', 670, 60, 160),
      item('red', 180, 700), item('tan', 240, 700, { eol: true }), item('sun', 180, 688), item('fog', 240, 688, { eol: true }), line('Table 4: right', 670, 180, 290), ...prose(640, 10)]]
    const dd = docOf(ps)
    const layout = side(ps, [[0, words(dd, 'table', 'left')], [1, words(dd, 'table', 'right', at(dd, 'left'))]], { 0: 'caption', 1: 'caption' })
    expect(pageFloats(layout, 1).map(f => [f.id, ...r1(f.region)]).sort()).toEqual([[0, 60, 685.8, 125, 707.5], [1, 180, 685.8, 255, 707.5]])
  })
})

describe('pageFloats: which side of a caption its float is on', () => {
  it('tables under their captions\' feet (caption below): each takes the rows the stream sets before it', () => {
    // table 1, its caption, table 2, its caption — the stream in that order; the second table nearer the first caption
    // than the first table is (a float's skip under the caption, a caption's skip over it)
    // the second table 2.3 under the first caption, its own caption 8.3 under it: caption 1 walks down first, into
    // table 2, and turns to its walk up, which crosses nothing of caption 2's
    const ps = [[...prose(780, 4), ...row(716, 'one', 'two', 'six'), ...row(704, 'ten', 'red', 'tan'), line('Table 1: the first', 692, 100, 250),
      ...row(680, 'sun', 'moon', 'star'), ...row(668, 'east', 'west', 'north'), line('Table 2: the second', 650, 100, 250), ...prose(620, 10)]]
    const dd = docOf(ps)
    const layout = side(ps, [[0, words(dd, 'table', 'first')], [1, words(dd, 'table', 'second', at(dd, 'first'))]], { 0: 'caption', 1: 'caption' })
    const fs = pageFloats(layout, 1)
    expect(fs.map(f => [f.id, Math.round(f.region.y0), Math.round(f.region.y1)]).sort()).toEqual([[0, 702, 724], [1, 666, 688]])
  })

  it('the stream setting a caption between a listing over it and a table under it: the table, under it', () => {
    // a listing (no caption of its own here) 4 units over the caption, the table 8 units under it
    const ps = [[...prose(780, 4), line('def run(steps):', 718, 60, 200), line('return steps', 706, 60, 200), line('Table 1: the scores', 690, 100, 250),
      ...row(670, 'one', 'two', 'six'), ...row(658, 'ten', 'red', 'tan'), ...prose(630, 10)]]
    const dd = docOf(ps)
    const layout = side(ps, [[0, words(dd, 'table', 'scores')]], { 0: 'caption' })
    expect(pageFloats(layout, 1).map(f => [f.id, Math.round(f.region.y0), Math.round(f.region.y1)])).toEqual([[0, 656, 678]])
  })

  it('the side the stream sets next to the caption: a table over it, set before it, and lines under it set elsewhere', () => {
    // the stream: the lines under the caption (another column's, say), the table, its caption, the prose
    const ps = [[...row(670, 'one', 'two', 'six'), ...row(658, 'ten', 'red', 'tan'), ...prose(780, 4), ...row(718, 'sun', 'moon', 'star'), ...row(706, 'east', 'west', 'north'), line('Table 1: the scores', 690, 100, 250), ...prose(630, 10)]]
    const dd = docOf(ps)
    const layout = side(ps, [[0, words(dd, 'table', 'scores')]], { 0: 'caption' })
    expect(pageFloats(layout, 1).map(f => [f.id, Math.round(f.region.y0), Math.round(f.region.y1)])).toEqual([[0, 704, 726]])
  })

  it('a caption between two tables, the stream setting it next to both, takes the one it heads when the other is the first caption\'s', () => {
    // caption 1, table 1, caption 2, table 2: caption 2's walk up (table 1) is the nearer, and crosses caption 1's
    const ps = [[...prose(780, 4), line('Table 1: the first', 720, 100, 250), ...row(704, 'one', 'two', 'six'), ...row(692, 'ten', 'red', 'tan'),
      line('Table 2: the second', 678, 100, 250), ...row(658, 'sun', 'moon', 'star'), ...row(646, 'east', 'west', 'north'), ...prose(620, 10)]]
    const dd = docOf(ps)
    const layout = side(ps, [[0, words(dd, 'table', 'first')], [1, words(dd, 'table', 'second', at(dd, 'first'))]], { 0: 'caption', 1: 'caption' })
    const fs = pageFloats(layout, 1)
    expect(fs.map(f => [f.id, Math.round(f.region.y0), Math.round(f.region.y1)]).sort()).toEqual([[0, 690, 712], [1, 644, 666]])
  })

  it('a table over a figure, the table\'s caption over it and the figure\'s under it: each keeps its own', () => {
    // the figure has no text in the stream, so both captions stand next to the table's rows in it
    const ps = [[...prose(780, 4), line('Table 3: the third', 720, 100, 250), ...row(704, 'one', 'two', 'six'), ...row(692, 'ten', 'red', 'tan'),
      line('Figure 1: the chart', 590, 100, 250), ...prose(560, 10)]]
    const dd = docOf(ps)
    const layout = side(ps, [[0, words(dd, 'table', 'third')], [1, words(dd, 'figure', 'chart')]], { 0: 'caption', 1: 'caption' })
    // the figure 2.8 under the table's last row, the rows 6.3 under their caption: the widest gap would part them wrong
    const fs = pageFloats(layout, 1, [{ x0: 80, y0: 602, x1: 280, y1: 687 }])
    expect(fs.map(f => [f.id, f.kind, Math.round(f.region.y0), Math.round(f.region.y1)]).sort()).toEqual([[0, 'table', 690, 712], [1, 'figure', 602, 687]])
  })
})

describe('pageFloats: figures', () => {
  it('a figure goes to its nearest caption only: the one just under it, not the table\'s caption under that', () => {
    const ps = [[...prose(780, 4), line('Figure 1: the chart', 620, 100, 250), line('Table 1: the scores', 600, 100, 250), ...row(584, 'one', 'two', 'six'), ...row(572, 'ten', 'red', 'tan'), ...prose(540, 10)]]
    const dd = docOf(ps)
    const layout = side(ps, [[0, words(dd, 'figure', 'chart')], [1, words(dd, 'table', 'scores')]], { 0: 'caption', 1: 'caption' })
    const fs = pageFloats(layout, 1, [{ x0: 80, y0: 632, x1: 280, y1: 720 }])
    expect(fs.map(f => [f.id, f.kind, Math.round(f.region.y0), Math.round(f.region.y1)]).sort()).toEqual([[0, 'figure', 632, 720], [1, 'table', 570, 592]])
  })

  it('its labels inside it are its own; outlined, its caption washed', () => {
    const ps = [[...prose(780, 4), item('axis', 120, 650), item('label', 200, 690, { eol: true }), line('Figure 1: the chart', 620, 100, 250), ...prose(590, 10)]]
    const dd = docOf(ps)
    const layout = side(ps, [[0, words(dd, 'figure', 'chart')]], { 0: 'caption' })
    const f = pageFloats(layout, 1, [{ x0: 80, y0: 632, x1: 280, y1: 720 }])[0]!
    expect([f.kind, ...r1(f.region)]).toEqual(['figure', 80, 632, 280, 720])
    const shapes = floatShapes(layout, f, 2)
    expect(shapes.map(s => s.frame)).toEqual([true, false])
    expect(r1(shapes[0]!)).toEqual(r1({ x0: 78, x1: 282, y0: 632 - f.lead, y1: 720 + f.lead }))
    // the figure's inside and its caption light it; a label inside it too
    const hit = (x: number, y: number) => floatHitOf(layout, 1, x, y, 2, hitOf(layout, 1, x, y, 2))?.id
    expect([hit(180, 700), hit(125, 652), hit(150, 622)]).toEqual([0, 0, 0])
  })

  it('a grid of images, a row\'s space between them: one figure (2608.12502\'s figure 5)', () => {
    const ps = [[...prose(780, 4), line('Figure 5: the scenes', 520, 100, 250), ...prose(490, 10)]]
    const dd = docOf(ps)
    const layout = side(ps, [[0, words(dd, 'figure', 'scenes')]], { 0: 'caption' })
    // the rows 20 apart: more than the walk's step between lines (1.5 lines), less than a quarter of a row
    const grid = [{ x0: 70, y0: 532, x1: 150, y1: 619 }, { x0: 170, y0: 532, x1: 250, y1: 619 }, { x0: 70, y0: 639, x1: 150, y1: 726 }, { x0: 170, y0: 639, x1: 250, y1: 726 }]
    expect(pageFloats(layout, 1, grid).map(f => [f.kind, ...r1(f.region)])).toEqual([['figure', 70, 532, 250, 726]])
  })

  it('a chart drawn on the page (no form), its bars and its labels: a figure, outlined', () => {
    const ps = [[...prose(780, 4), item('low', 90, 640), item('high', 190, 640, { eol: true }), line('Figure 2: the bars', 620, 100, 250), ...prose(590, 10)]]
    const dd = docOf(ps)
    const layout = side(ps, [[0, words(dd, 'figure', 'bars')]], { 0: 'caption' })
    const marks = [{ x0: 90, y0: 652, x1: 120, y1: 700 }, { x0: 190, y0: 652, x1: 220, y1: 720 }]
    expect(pageFloats(layout, 1, [], { marks }).map(f => [f.kind, ...r1(f.region)])).toEqual([['figure', 90, 637.8, 220, 720]])
  })

  it('a diagram of boxes round its text, drawn on the page (TikZ), arrows between: a figure, its text a drawing\'s (the review of B4, probe F)', () => {
    // three boxes with a word in each (the drawing's text, a unit of its own), arrows (thin) between them, the caption under
    const ps = [[...prose(780, 4), item('input', 70, 652), item('model', 150, 652), item('output', 230, 652, { eol: true }), line('Figure 2: the pipeline', 620, 100, 250), ...prose(590, 10)]]
    const dd = docOf(ps)
    const layout = side(ps, [[0, words(dd, 'figure', 'pipeline')], [5, words(dd, 'input', 'output')]], { 0: 'caption', 5: 'figure' })
    const boxes = [{ x0: 60, y0: 640, x1: 120, y1: 670 }, { x0: 140, y0: 640, x1: 200, y1: 670 }, { x0: 220, y0: 640, x1: 280, y1: 670 }]
    const heads = [{ x0: 136, y0: 653, x1: 140, y1: 657 }, { x0: 216, y0: 653, x1: 220, y1: 657 }]
    const fs = pageFloats(layout, 1, [], { rules: [hrule(120, 140, 655), hrule(200, 220, 655)], marks: [...boxes, ...heads] })
    expect(fs.map(f => [f.id, f.kind, ...r1(f.region), [...f.members]])).toEqual([[0, 'figure', 60, 640, 280, 670, [5]]])
  })

  it('a float\'s kind is its caption\'s on both sides: a drawing whose text is located on one side only is a figure on both (floatsAgree)', () => {
    // probe F's diagram on both sides; on the right its text was not located (its words no unit's): alone, a table there
    const ps = [[...prose(780, 4), item('input', 70, 652), item('model', 150, 652), item('output', 230, 652, { eol: true }), line('Figure 2: the pipeline', 620, 100, 250), ...prose(590, 10)]]
    const dd = docOf(ps), text = words(dd, 'input', 'output'), caption = words(dd, 'figure', 'pipeline')
    const boxes = [{ x0: 60, y0: 640, x1: 120, y1: 670 }, { x0: 140, y0: 640, x1: 200, y1: 670 }, { x0: 220, y0: 640, x1: 280, y1: 670 }]
    const paths = { rules: [hrule(120, 140, 655), hrule(200, 220, 655)], marks: [...boxes, { x0: 136, y0: 653, x1: 140, y1: 657 }, { x0: 216, y0: 653, x1: 220, y1: 657 }] }
    const kinds = (L: ReturnType<typeof side>) => [floatOf(L, 0)?.kind, floatShapes(L, floatOf(L, 0)!, 2).map(s => s.frame)]
    for (const rightFirst of [true, false]) {
      const L = side(ps, [[0, caption], [5, text]], { 0: 'caption', 5: 'figure' }), R = side(ps, [[0, caption]], { 0: 'caption' }, text)
      const [a, b] = rightFirst ? [R, L] : [L, R]
      pageFloats(a, 1, [], paths)
      // the side made first agrees with nothing yet (the other's page not drawn); its shapes made (the pointer asked)
      expect(floatsAgree(a, 1, b)).toEqual([])
      expect(kinds(a)).toEqual(rightFirst ? ['table', [false]] : ['figure', [true, false]])
      pageFloats(b, 1, [], paths)
      // the side made second: the right's float takes the figure's kind, its shapes made again (outlined, its caption washed)
      expect(floatsAgree(b, 1, a)).toEqual([floatOf(R, 0)])
      expect([kinds(L), kinds(R)]).toEqual([['figure', [true, false]], ['figure', [true, false]]])
    }
    // a table on both sides stays one; a side without the float changes nothing
    const T = [[...prose(780, 4), line('Table 1: the scores', 690, 100, 250), ...row(670, 'one', 'two', 'six'), ...row(658, 'ten', 'red', 'tan'), ...prose(630, 10)]]
    const dt = docOf(T), A = side(T, [[0, words(dt, 'table', 'scores')]], { 0: 'caption' }), B = side(T, [[0, words(dt, 'table', 'scores')]], { 0: 'caption' }), C = side(T, [], {})
    for (const X of [A, B, C]) pageFloats(X, 1)
    expect([floatsAgree(A, 1, B), floatsAgree(A, 1, C), floatOf(A, 0)?.kind, floatOf(B, 0)?.kind]).toEqual([[], [], 'table', 'table'])
  })

  it('a running head over a float at the page\'s top is no part of it: nothing outside the text block is', () => {
    // four pages of prose to 747.5 at the top; on the last, a running head at 770 and a figure at the top of the block
    const head = item('Running head of the paper', 100, 770, { eol: true })
    const ps = [prose(740, 30), prose(740, 30), prose(740, 30), [head, line('Figure 1: the chart', 560, 100, 250), ...prose(530, 10)]]
    const dd = docOf(ps)
    const layout = side(ps, [[0, words(dd, 'figure', 'chart')]], { 0: 'caption' })
    const f = pageFloats(layout, 4, [{ x0: 80, y0: 572, x1: 280, y1: 748 }])[0]!
    expect(r1(f.region)).toEqual([80, 572, 280, 748])
  })
})

describe('pageFloats: where a float ends', () => {
  it('a table\'s note set tight under its rule leaves the rule the table\'s', () => {
    const ps = [[...prose(780, 4), line('Table 1: the scores', 720, 100, 250), ...row(704, 'one', 'two', 'six'), ...row(692, 'ten', 'red', 'tan'), line('Note on the scores', 678, 60, 200), ...prose(660, 10)]]
    const dd = docOf(ps)
    const layout = side(ps, [[0, words(dd, 'table', 'scores')], [7, words(dd, 'note', 'scores', at(dd, 'note'))]], { 0: 'caption' })
    expect(pageFloats(layout, 1, [], { rules: [hrule(55, 295, 687)] }).map(f => r1(f.region))).toEqual([[55, 686.8, 295, 711.5]])
  })

  it('a rule between a table and the figure under it is the nearer one\'s, the table\'s', () => {
    const ps = [[...prose(780, 4), line('Table 1: the scores', 720, 100, 250), ...row(704, 'one', 'two', 'six'), ...row(692, 'ten', 'red', 'tan'), line('Figure 1: the chart', 588, 100, 250), ...prose(560, 10)]]
    const dd = docOf(ps)
    const layout = side(ps, [[0, words(dd, 'table', 'scores')], [1, words(dd, 'figure', 'chart')]], { 0: 'caption', 1: 'caption' })
    const fs = pageFloats(layout, 1, [{ x0: 80, y0: 600, x1: 280, y1: 682 }], { rules: [hrule(55, 295, 687)] })
    expect(fs.map(f => [f.id, ...r1(f.region)]).sort()).toEqual([[0, 55, 686.8, 295, 711.5], [1, 80, 600, 280, 682]])
  })

  it('two columns: a column\'s figure under a title block across the page does not take the title block', () => {
    // the authors' line across the page 8 units over the right column's figure; the left column's prose beside it
    const ps = [[item('Ann Bee and Cyd Dee of the University', 60, 700, { width: 480, eol: true }), ...prose(688, 12, 50, 290), line('Figure 1: the setup', 545, 330, 520), ...prose(520, 20, 50, 290), ...prose(520, 20, 310, 550)], [...prose(740, 30, 50, 290), ...prose(740, 30, 310, 550)]]
    const dd = docOf(ps)
    const layout = side(ps, [[0, words(dd, 'figure', 'setup')]], { 0: 'caption' })
    expect(pageFloats(layout, 1, [{ x0: 320, y0: 560, x1: 540, y1: 690 }]).map(f => [f.kind, ...r1(f.region)])).toEqual([['figure', 320, 560, 540, 690]])
  })

  it('two columns: a float across the page of two parts, each with its caption: the right part\'s rules reach over the gutter', () => {
    // two tables side by side, the left one 60–200, the right one 230–540 across the middle (300), each caption under its
    // own; TeX sets the left part whole, then the right
    const ps = [[item('one', 60, 700), item('two', 160, 700, { eol: true }), item('ten', 60, 688), item('six', 160, 688, { eol: true }), item('Table 3: left', 60, 670, { eol: true }),
      item('red', 240, 700), item('tan', 340, 700), item('sun', 440, 700, { eol: true }), item('moon', 240, 688), item('star', 340, 688), item('east', 440, 688, { eol: true }),
      line('Table 4: the right one', 655, 320, 500), ...prose(630, 20, 50, 290), ...prose(630, 20, 310, 550)], [...prose(740, 30, 50, 290), ...prose(740, 30, 310, 550)]]
    const dd = docOf(ps)
    const layout = side(ps, [[0, words(dd, 'table', 'left')], [1, words(dd, 'table', 'one', at(dd, 'left'))]], { 0: 'caption', 1: 'caption' })
    const rules = [hrule(230, 540, 712), hrule(230, 540, 684)]
    expect(pageFloats(layout, 1, [], { rules }).filter(f => f.id === 1).map(f => r1(f.region))).toEqual([[230, 683.8, 540, 712.2]])
  })

  it('a box drawn round paragraphs over a caption: no float holds running text', () => {
    // a filled box from 600 to 700 round two paragraphs' lines, and the caption under it
    const ps = [[...prose(780, 4), ...prose(690, 3, 60, 290), line('Figure 5: the advice', 588, 100, 250), ...prose(560, 10)]]
    const dd = docOf(ps)
    const layout = side(ps, [[0, words(dd, 'figure', 'advice')]], { 0: 'caption' })
    expect(pageFloats(layout, 1, [], { marks: [{ x0: 55, y0: 600, x1: 295, y1: 700 }, { x0: 55, y0: 599, x1: 295, y1: 601 }] })).toEqual([])
  })
})

describe('pageFloats: figures side by side, subfigures (the review of B4)', () => {
  const hitter = (layout: ReturnType<typeof side>) => (x: number, y: number) => floatHitOf(layout, 1, x, y, 2, hitOf(layout, 1, x, y, 2))?.id ?? null

  it('two figures side by side, each with its caption under it (two minipages): each its own', () => {
    const ps = [[...prose(780, 4), line('Figure 3: the left one', 605, 60, 170), line('Figure 4: the right one', 605, 190, 300), ...prose(580, 10)]]
    const dd = docOf(ps)
    const layout = side(ps, [[0, words(dd, 'figure', 'one')], [1, words(dd, 'figure', 'one', at(dd, 'one') + 1)]], { 0: 'caption', 1: 'caption' })
    const fs = pageFloats(layout, 1, [{ x0: 60, y0: 617, x1: 170, y1: 720 }, { x0: 190, y0: 617, x1: 300, y1: 720 }])
    expect(fs.map(f => [f.id, f.kind, ...r1(f.region)]).sort()).toEqual([[0, 'figure', 60, 617, 170, 720], [1, 'figure', 190, 617, 300, 720]])
    const hit = hitter(layout)
    expect([hit(100, 680), hit(250, 680)]).toEqual([0, 1])
  })

  it('subfigures over their subcaptions, the main caption under them: each subcaption its panel; the main caption the whole figure, panels and subcaptions', () => {
    const ps = [[...prose(780, 4), line('(a) left one', 605, 80, 150), line('(b) right one', 605, 210, 280), line('Figure 1: both of them', 585, 100, 250), ...prose(560, 10)]]
    const dd = docOf(ps)
    const layout = side(ps, [[0, words(dd, 'a', 'one')], [1, words(dd, 'b', 'one')], [2, words(dd, 'figure', 'them')]], { 0: 'caption', 1: 'caption', 2: 'caption' })
    const fs = pageFloats(layout, 1, [{ x0: 60, y0: 617, x1: 170, y1: 720 }, { x0: 190, y0: 617, x1: 300, y1: 720 }])
    expect(fs.map(f => [f.id, f.kind, ...r1(f.region)]).sort()).toEqual([[0, 'figure', 60, 617, 170, 720], [1, 'figure', 190, 617, 300, 720], [2, 'figure', 60, 602.8, 300, 720]])
    // a panel or its subcaption lights the subfigure (the finer, where the source says so), the main caption the whole
    const hit = hitter(layout)
    expect([hit(100, 680), hit(250, 680), hit(240, 607), hit(150, 587)]).toEqual([0, 1, 1, 2])
    // the whole is outlined, its main caption washed
    const main = fs.find(f => f.id === 2)!
    expect(floatShapes(layout, main, 2).map(s => s.frame)).toEqual([true, false])
  })

  it('captionFor: of captions in a row the one over the figure, of captions stacked under it the nearest', () => {
    const cap = (id: number, x0: number, x1: number, top: number) => ({ id, x0, x1, top, bottom: top - 10, h: 10, col: { x0: 50, x1: 300 } })
    expect(captionFor({ x0: 190, y0: 617, x1: 300, y1: 720 }, [cap(0, 60, 170, 612), cap(1, 190, 300, 612)])?.id).toBe(1)
    expect(captionFor({ x0: 60, y0: 617, x1: 170, y1: 720 }, [cap(2, 100, 250, 592), cap(0, 80, 150, 612)])?.id).toBe(0)
    // a caption only sharing the column goes after one over the figure, however nearer
    expect(captionFor({ x0: 60, y0: 617, x1: 170, y1: 720 }, [cap(0, 200, 290, 614), cap(1, 70, 160, 600)])?.id).toBe(1)
  })
})

describe('pageFloats: at a page\'s head and foot (the review of B4)', () => {
  it('an algorithm at the page\'s top keeps its rule over its caption, just over the text block\'s top', () => {
    // four pages whose first lines' tops are at 747.5; on the last, the algorithm's top rule at 750, its caption at 738,
    // a rule, its lines, its bottom rule, prose
    const ps = [prose(740, 30), prose(740, 30), prose(740, 30), [line('Algorithm 1 the loop', 738, 60, 200), line('repeat the steps', 720, 60, 200), line('until it is done', 708, 60, 200), ...prose(670, 20)]]
    const dd = docOf(ps)
    const layout = side(ps, [[0, words(dd, 'algorithm', 'loop')]], { 0: 'caption' })
    const fs = pageFloats(layout, 4, [], { rules: [hrule(55, 295, 750), hrule(55, 295, 734), hrule(55, 295, 703)] })
    expect(fs.map(f => [f.kind, ...r1(f.region)])).toEqual([['table', 55, 702.8, 295, 750.2]])
  })

  it('a figure at the page\'s foot, its caption under it and the footnotes\' rule just under that: the rule is not the figure\'s', () => {
    const ps = [[...prose(740, 20), line('Figure 2: the plot', 288, 100, 250), item('1 A footnote here', 50, 268, { size: 8, eol: true, width: 120 })]]
    const dd = docOf(ps)
    const layout = side(ps, [[0, words(dd, 'figure', 'plot')], [7, words(dd, 'a', 'here', at(dd, 'footnote') - 1)]], { 0: 'caption', 7: 'footnote' })
    const fs = pageFloats(layout, 1, [{ x0: 80, y0: 300, x1: 280, y1: 420 }], { rules: [hrule(50, 150, 278.5)] })
    expect(fs.map(f => [f.kind, ...r1(f.region)])).toEqual([['figure', 80, 300, 280, 420]])
  })
})
