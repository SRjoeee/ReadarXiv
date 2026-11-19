// A translated paragraph keeps the hang TeX gave its original (docs/PDF-READER.md §18.94; the coordinator's ruling of
// 2026-11-18 on the owner's question, 2610.20266v1 p1's abstract). Content of our own, in the shapes TeX sets: LaTeX's
// \@hangfrom (a label box, \hangindent its width, \hangafter 1: SIAM's abstract, the caption package's `hang`), a \hangindent of
// the author's, a list item whose first line TeX sets left of the list's measure (natbib's \bibhang: \itemindent -\leftmargin)
// or whose label stands in the margin, and what is no hang (a \parindent, wrapfig's \parshape, lines that share no edge, a
// member of one line, a centred one), laid as before.
import type { Ink, Part, Placed, Row } from '@readarxiv/format'
import { describe, expect, it } from 'vitest'
import { layPage } from '../../src/lay/entry.ts'
import { rulesFor } from '../../src/rules-for.ts'
import type { Metrics, Rows } from '../../src/types.ts'
import { blocks, type LineInfo } from '../../src/unit/blocks.ts'
import { type Rect, rectKey } from '../../src/util.ts'

const metrics = (): Metrics => ({
  ready: () => true,
  advance: (_f, size, t) => (size * [...t].length) / 2,
  ink: () => [0.7, 0.2, 0],
})
const id = 'a'.repeat(64)
/** nineteen Chinese characters, each half an em of the metrics' */
const zh =
  '\u653f\u7b56\u5236\u5b9a\u8005\u5e94\u5f53\u7d27\u6025\u5730\u63d0\u9ad8\u5bf9\u7206\u53d1\u7684\u8ba4\u8bc6'
type Line = Placed['lines'][number]
/** line `j` of a member at size 10, its baselines 12 apart from 700 down: its ink x0..x1 and TeX's measure m0..300 */
const ln = (j: number, x0: number, x1: number, m0: number): Line => {
  const base = 700 - 12 * j
  return [1, 0, x0, x1, base, base + 7, base - 2, m0, 300, 0, 10]
}
const style = { role: 'serif' as const, size: 10, design: 'NimbusRomNo9L-Regu' }
const member = (kind: Placed['kind'], lines: Line[], more: Partial<Placed> = {}): Placed => ({
  ord: 0,
  kind,
  text: id,
  lead: 12,
  style,
  align: 'j',
  lines,
  room: { below: 20, next: 24 },
  ...more,
})
const at = (s: string, x0: number, w: number): [string, Ink] => [s, [1, x0, 698, x0 + w, 707, 700]]
/** "Figure 1." from `x` on line 0 (label-hang.test.ts's, 44.67 wide), which the reader draws anew in Chinese */
const figure = (x: number): NonNullable<Placed['label']> => ({
  kind: 'float',
  float: 'figure',
  ink: [1, x, 698, x + 44.67, 707, 700],
  style: { ...style, bold: 1 },
  line: 0,
  name: at('Figure', x, 32),
  num: at('1', x + 35.18, 6.34),
  punct: at('.', x + 41.52, 3.15),
})
const part = (m: Placed): Part => ({
  format: 1,
  page: 1,
  paper: { faces: { fonts: [['NimbusRomNo9L-Regu', 100]] } },
  flows: [[m]],
})
/** each laid line: its baseline and its items' text, place and size */
const layOf = (m: Placed, s: string, to = 'zh') => {
  const row: Row = { id, ok: true, by: 'test', content: [{ t: 'text', s }] }
  const rows: Rows = { get: (k) => (k === id ? row : undefined), done: true }
  const [laid] = layPage(part(m), rows, rulesFor(to), metrics()).members
  expect(laid!.state).toBe('laid')
  return laid!.lines.map(([y, , , items]) => ({
    y,
    items: items.map((it) => ('face' in it ? ([it.s, it.x, it.size] as const) : (['', Number.NaN, 0] as const))),
  }))
}
/** where a laid line starts: its first item's place */
const startOf = (l: ReturnType<typeof layOf>[number]) => l.items[0]![1]
/** where a line's drawn label ends (its last label item's end, its trailing space aside) and its scale against 10 pt */
const labelEndOf = (l: ReturnType<typeof layOf>[number]) => {
  const k = l.items.findIndex(([s]) => s.includes('\u653f')) - 1
  const [s, x, size] = l.items[k]!
  return { end: x + (size * [...s.trimEnd()].length) / 2, scale: size / 10 }
}

describe('a hang TeX states (H1)', () => {
  // (\@hangfrom: the label at the measure's start, \hangindent its box's width; Line[7] states line 0's m0 at the measure and
  // every later line's at the hang. The ink stands 0.31 left of what TeX states on line 0 and the label, microtype's protrusion
  // of their first glyphs, which §18.29's test read to 0.01 and missed: 2610.20266v1 p1's abstract, 112.13 against 112.44)
  const hung = (): Placed =>
    member('caption', [ln(0, 95.3, 300, 47), ln(1, 95.61, 300, 95.61), ln(2, 95.61, 200, 95.61)], {
      label: figure(46.69),
      room: { below: 80, next: 90, runs: [[2, 80, 80]], sep: 12 },
    })
  it('hangs every line after the first at the drawn label’s width, the space TeX set after the label kept', () => {
    const lines = layOf(hung(), zh.repeat(3))
    expect(lines.length).toBeGreaterThan(1)
    const [first, ...rest] = lines
    expect(first!.items[0]![0]).toMatch(/^\u56fe/)
    expect(startOf(first!)).toBeCloseTo(46.69, 1)
    const { end, scale } = labelEndOf(first!)
    // (the hang TeX states, 95.61, from the label's ink end, 91.36: TeX's \hangindent less the label's ink)
    const edge = end + (95.61 - 91.36) * scale
    expect(edge).toBeLessThan(95.61 - 1)
    expect(first!.items.find(([s]) => s.includes('\u653f'))![1]).toBeCloseTo(edge, 1)
    for (const l of rest) expect(startOf(l)).toBeCloseTo(edge, 1)
  })
  it('hangs a translation of more lines than the original, every line past its last too, as TeX’s hang goes on', () => {
    const lines = layOf(hung(), zh.repeat(9))
    expect(lines.length).toBeGreaterThan(3)
    const { end, scale } = labelEndOf(lines[0]!)
    for (const l of lines.slice(1)) expect(startOf(l)).toBeCloseTo(end + (95.61 - 91.36) * scale, 1)
  })
  it('hangs a translation of fewer lines than the original', () => {
    const lines = layOf(hung(), zh.repeat(3))
    expect(lines.length).toBe(2)
    const { end, scale } = labelEndOf(lines[0]!)
    expect(startOf(lines[1]!)).toBeCloseTo(end + (95.61 - 91.36) * scale, 1)
  })
  it('hangs at TeX’s stated hang a paragraph no label hangs: a \\hangindent of the author’s', () => {
    // (\hangindent 20pt \hangafter 1: line 0 at the measure, every later line 20 pt in)
    const m = member('para', [ln(0, 72, 300, 72), ln(1, 92, 300, 92), ln(2, 92, 180, 92)])
    const lines = layOf(m, zh.repeat(3))
    expect(lines.length).toBeGreaterThan(1)
    expect(startOf(lines[0]!)).toBeCloseTo(72, 1)
    for (const l of lines.slice(1)) expect(startOf(l)).toBeCloseTo(92, 1)
  })
})

describe('a label in the margin stays in the margin (H2)', () => {
  it('lays a list item’s later lines at the list’s measure, its first line from its own start: natbib’s \\bibhang', () => {
    // (\list{}{\leftmargin\bibhang \itemindent-\leftmargin}: every line's measure from 82.91, the first line set 10.91 left of it,
    // 1810.04805v2 p11's references)
    const m = member('reference', [ln(0, 72, 300, 82.91), ln(1, 82.91, 300, 82.91), ln(2, 82.91, 150, 82.91)])
    const lines = layOf(m, zh.repeat(3))
    expect(lines.length).toBeGreaterThan(1)
    expect(startOf(lines[0]!)).toBeCloseTo(72, 1)
    for (const l of lines.slice(1)) expect(startOf(l)).toBeCloseTo(82.91, 1)
  })
  it('lays a caption’s later lines at its measure where its label, drawn anew, stands in the margin left of it', () => {
    // (every line's measure from 138.36, the label at 90 before it: 2610.21201v1's captions. The label drawn anew starts the first
    // line; the measure is no label's width, so the later lines keep it)
    const m = member('caption', [ln(0, 138.36, 300, 138.36), ln(1, 138.36, 300, 138.36), ln(2, 138.36, 200, 138.36)], {
      label: figure(90),
    })
    const lines = layOf(m, zh.repeat(3))
    expect(lines.length).toBeGreaterThan(1)
    expect(lines[0]!.items[0]![0]).toMatch(/^\u56fe/)
    expect(startOf(lines[0]!)).toBeCloseTo(90, 1)
    for (const l of lines.slice(1)) expect(startOf(l)).toBeCloseTo(138.36, 1)
  })
  it('lays the later lines at the edge they share where nothing of TeX’s is stated for them: a contents entry', () => {
    // (an ink unit TeX set, no unit's: its measure the frame's, 84.95, every line; the first line at it, the later lines at 149.06:
    // 2307.16209v1 p12's contents)
    const m = member('inkcontents', [ln(0, 84.95, 300, 84.95), ln(1, 149.06, 300, 84.95), ln(2, 149.06, 250, 84.95)])
    const lines = layOf(m, zh.repeat(3))
    expect(lines.length).toBeGreaterThan(1)
    expect(startOf(lines[0]!)).toBeCloseTo(84.95, 1)
    for (const l of lines.slice(1)) expect(startOf(l)).toBeCloseTo(149.06, 1)
  })
  it('lays a list item of two lines at the measure TeX states for its one later line', () => {
    // (a natbib entry of two lines: its second line at 82.91, TeX's measure for it; the first 10.91 left of it)
    const m = member('reference', [ln(0, 72, 300, 82.91), ln(1, 82.91, 150, 82.91)])
    const lines = layOf(m, zh.repeat(3))
    expect(lines.length).toBeGreaterThan(1)
    expect(startOf(lines[0]!)).toBeCloseTo(72, 1)
    for (const l of lines.slice(1)) expect(startOf(l)).toBeCloseTo(82.91, 1)
  })
})

describe('what is not a hang is laid as before (H3)', () => {
  /** room under a member of one line to take more */
  const under = { room: { below: 80, next: 90, runs: [[0, 80, 80]] as [number, number, number][], sep: 12 } }
  it('keeps a \\parindent: the first line right of the rest', () => {
    const lines = layOf(member('para', [ln(0, 87, 300, 72), ln(1, 72, 300, 72), ln(2, 72, 200, 72)]), zh.repeat(3))
    expect(startOf(lines[0]!)).toBeCloseTo(87, 1)
    for (const l of lines.slice(1)) expect(startOf(l)).toBeCloseTo(72, 1)
  })
  it('keeps a first line its ink alone sets apart, within what a line’s ink differs by under one measure', () => {
    // (a protruded first glyph: 0.31 left of the rest, 0.03 em)
    const lines = layOf(member('para', [ln(0, 71.69, 300, 72), ln(1, 72, 300, 72), ln(2, 72, 200, 72)]), zh.repeat(3))
    for (const l of lines) expect(startOf(l)).toBeCloseTo(71.69, 1)
  })
  it('keeps the measures by height of a shape that changes after the first line again: a figure wrapped beside lines 1 and 2', () => {
    // (wrapfig's \parshape: lines 1 and 2 beside a figure at the left, the rest at the measure again; measuresOf's runs, as before)
    const xs = [72, 150, 150, 72, 72, 72]
    const m = member(
      'para',
      xs.map((x, j) => ln(j, x, 300, x)),
    )
    const lines = layOf(m, zh.repeat(6))
    for (const l of lines) expect(startOf(l)).toBeCloseTo(72, 1)
  })
  it('keeps one later line TeX states nothing for: no edge is shared by one line (a paragraph’s second line a display’s row)', () => {
    // (2608.04473v1 p7: "… gives:" then a display's row at 102.62, every line's measure the frame's from 54)
    const lines = layOf(member('para', [ln(0, 54, 300, 54), ln(1, 102.62, 250, 54)]), zh.repeat(3))
    expect(lines.length).toBeGreaterThan(1)
    for (const l of lines) expect(startOf(l)).toBeCloseTo(54, 1)
  })
  it('keeps later lines that share no edge: content set at its own starts', () => {
    const lines = layOf(member('para', [ln(0, 72, 300, 72), ln(1, 92, 300, 72), ln(2, 112, 250, 72)]), zh.repeat(3))
    for (const l of lines) expect(startOf(l)).toBeCloseTo(72, 1)
  })
  it('keeps a member of one original line: its later lines at its own start', () => {
    const lines = layOf(member('para', [ln(0, 92, 250, 72)], under), zh.repeat(6))
    expect(lines.length).toBeGreaterThan(1)
    for (const l of lines) expect(startOf(l)).toBeCloseTo(92, 1)
  })
  it('keeps a one-line heading grown to two: its number kept where TeX set it, its later lines at its text’s start', () => {
    // (\@sect's \@hangfrom over a number the reader keeps: the text's start is the hang, the original label's width)
    const m = member('heading', [ln(0, 92, 200, 72)], {
      ...under,
      label: {
        kind: 'head',
        ink: [1, 72, 698, 85, 707, 700],
        style: { ...style, bold: 1 },
        line: 0,
        num: at('3.1', 72, 13),
      },
    })
    const lines = layOf(m, zh.repeat(6))
    expect(lines.length).toBeGreaterThan(1)
    for (const l of lines) expect(startOf(l)).toBeCloseTo(92, 1)
  })
  it('keeps a one-line caption whose label is drawn anew: the part states nothing of its later lines', () => {
    const m = member('caption', [ln(0, 95.61, 200, 47)], { ...under, label: figure(47) })
    const lines = layOf(m, zh.repeat(6))
    expect(lines.length).toBeGreaterThan(1)
    expect(lines[0]!.items[0]![0]).toMatch(/^\u56fe/)
    for (const l of lines) expect(startOf(l)).toBeCloseTo(47, 1)
  })
})

describe('U.blocks: the edge of a block whose first line TeX set apart', () => {
  /** a unit's line at baseline `base`, size 10, from x0 to x1, its row `j` in frame 0 (blocks.test.ts's) */
  const line = (base: number, x0: number, x1: number, j: number): [Rect, LineInfo] => [
    [1, x0, base - 2.15, x1, base + 6.83],
    { baseline: base, size: 10, top: base + 7.5, bottom: base - 2.5, exact: true, file: true, j, frame: 0 },
  ]
  const input = (ls: [Rect, LineInfo][], more: object = {}) => ({
    rects: ls.map((l) => l[0]),
    keep: null,
    lineInfo: new Map(ls.map(([r, i]) => [rectKey(r), i])),
    centred: false,
    ...more,
  })
  const hanging = [line(700, 72, 300, 0), line(688, 82.91, 300, 1), line(676, 82.91, 200, 2)]
  it('is the edge its later lines share, the first line’s indent signed, where the member may set it apart', () => {
    const [b] = blocks(input(hanging, { apart: true }))
    expect(b!.x0).toBeCloseTo(82.91, 2)
    expect(b!.indent).toBeCloseTo(-10.91, 2)
    expect(b!.x1).toBe(300)
  })
  it('is its leftmost line’s where it may not: a centred or flush-right member’s, and a block before', () => {
    for (const more of [{}, { apart: false }, { apart: true, centred: true }]) {
      const [b] = blocks(input(hanging, more))
      expect(b!.x0).toBe(72)
      expect(b!.indent).toBe(0)
    }
  })
})
