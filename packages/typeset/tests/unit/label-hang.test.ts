// A label TeX hung beside its text (the caption package's `hang`: \hangindent the label's width), drawn anew: laid in its hang,
// the text's lines on the measure TeX gave them. 2609.36054v2-zh p3's Figure 1: "Figure 1." at 47 in the margin, every line of
// its text at 95.61; the label drawn anew widened the first line back to the label, so the block's edge was the label's and
// the second line ran under it, at 47.
import type { Ink, Part, Placed, Row } from '@readarxiv/format'
import { describe, expect, it } from 'vitest'
import { layPage } from '../../src/lay/entry.ts'
import { rulesFor } from '../../src/rules-for.ts'
import type { Metrics, Rows } from '../../src/types.ts'

const metrics = (): Metrics => ({
  ready: () => true,
  advance: (_f, size, t) => (size * [...t].length) / 2,
  ink: () => [0.7, 0.2, 0],
})
const id = 'a'.repeat(64)
const at = (s: string, x0: number, w: number): [string, Ink] => [s, [1, x0, 698, x0 + w, 707, 700]]
/** a caption of three lines at `x` (its measure 47 to 300), its label "Figure 1." at 47 */
const caption = (x: number): Placed => ({
  ord: 0,
  kind: 'caption',
  text: id,
  lead: 12,
  style: { role: 'serif', size: 10, design: 'NimbusRomNo9L-Regu' },
  align: 'j',
  lines: [
    [1, 0, x, 300, 700, 707, 698, 47, 300, 0, 10],
    [1, 0, x, 300, 688, 695, 686, 47, 300, 0, 10],
    [1, 0, x, 200, 676, 683, 674, 47, 300, 0, 10],
  ],
  room: { below: 20, next: 24 },
  label: {
    kind: 'float',
    float: 'figure',
    ink: [1, 47, 698, 91.67, 707, 700],
    style: { role: 'serif', size: 10, design: 'NimbusRomNo9L-Regu', bold: 1 },
    line: 0,
    name: at('Figure', 47, 32),
    num: at('1', 82.18, 6.34),
    punct: at('.', 88.52, 3.15),
  },
})
const part = (m: Placed): Part => ({
  format: 1,
  page: 1,
  paper: { faces: { fonts: [['NimbusRomNo9L-Regu', 100]] } },
  flows: [[m]],
})
const zh = '政策制定者应当紧急地提高对爆发的认识'
const row: Row = { id, ok: true, by: 'test', content: [{ t: 'text', s: zh.repeat(3) }] }
const rows: Rows = { get: (k) => (k === id ? row : undefined), done: true }
/** each laid line's start and its items' text and place */
const laidOf = (m: Placed) => {
  const [laid] = layPage(part(m), rows, rulesFor('zh'), metrics()).members
  expect(laid!.state).toBe('laid')
  return laid!.lines.map(([y, , , items]) => ({ y, items: items.map((it) => ('face' in it ? [it.s, it.x] : ['', 0])) }))
}

describe('a label TeX hung beside its text, drawn anew', () => {
  it('is laid in its hang, the text’s first line starting where the hang ends and every line after it on that edge', () => {
    const lines = laidOf(caption(95.61))
    expect(lines.length).toBeGreaterThan(1)
    const [first, ...rest] = lines
    // (the label at its own place, in the margin)
    expect(first!.items[0]![0]).toMatch(/^图/)
    expect(first!.items[0]![1]).toBeCloseTo(47, 1)
    // (the text's first character at the hang's end, the room between the label's)
    const text = first!.items.find(([s]) => (s as string).includes('政'))!
    expect(text[1]).toBeCloseTo(95.61, 1)
    // (every later line on the text's edge, never under the label)
    for (const l of rest) expect(l.items[0]![1]).toBeCloseTo(95.61, 1)
  })
  it('keeps a label TeX set at the start of its first line, the lines after it at the measure, the first line’s', () => {
    // (a caption's label in its first line's text, its second line back at the measure's start: no hang, the label begins the
    // first line, as before)
    const m = caption(95.61)
    m.lines = m.lines.map((l, j) => (j ? ([l[0], l[1], 47, ...l.slice(3)] as Placed['lines'][number]) : l))
    const [first, second] = laidOf(m)
    expect(first!.items[0]![1]).toBeCloseTo(47, 1)
    expect(second!.items[0]![1]).toBeCloseTo(47, 1)
  })
})
