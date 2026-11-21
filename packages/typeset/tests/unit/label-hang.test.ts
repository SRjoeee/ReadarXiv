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
const zh =
  '\u653f\u7b56\u5236\u5b9a\u8005\u5e94\u5f53\u7d27\u6025\u5730\u63d0\u9ad8\u5bf9\u7206\u53d1\u7684\u8ba4\u8bc6'
const row: Row = { id, ok: true, by: 'test', content: [{ t: 'text', s: zh.repeat(3) }] }
const rows: Rows = { get: (k) => (k === id ? row : undefined), done: true }
/** each laid line's start and its items' text and place */
const laidOf = (m: Placed) => {
  const [laid] = layPage(part(m), rows, rulesFor('zh'), metrics()).members
  expect(laid!.state).toBe('laid')
  return laid!.lines.map(([y, , , items]) => ({ y, items: items.map((it) => ('face' in it ? [it.s, it.x] : ['', 0])) }))
}

describe('a label TeX hung beside its text, drawn anew', () => {
  /** where a laid line's label ends: its last label item's end (its text, its trailing space aside), and its scale against the
   *  part's 10 pt */
  const labelEnd = (items: (string | number)[][], sizes: number[]) => {
    const k = items.findIndex(([s]) => /[\u653fD]/u.test(s as string)) - 1
    return {
      end: (items[k]![1] as number) + (sizes[k]! * [...(items[k]![0] as string).trimEnd()].length) / 2,
      scale: sizes[k]! / 10,
    }
  }
  const sizedOf = (m: Placed, to: string, row0: Row) => {
    const [laid] = layPage(
      part(m),
      { get: (k) => (k === id ? row0 : undefined), done: true },
      rulesFor(to),
      metrics(),
    ).members
    expect(laid!.state).toBe('laid')
    return laid!.lines.map(([, , , items]) => ({
      items: items.map((it) => ('face' in it ? [it.s, it.x] : ['', 0])),
      sizes: items.map((it) => ('face' in it ? it.size : 0)),
    }))
  }
  it('hangs its text at the drawn label’s own width: the label at its place, the space TeX set after it, every line on that edge', () => {
    // (the coordinator's ruling of 2026-11-11, TeX's own rule: a hung caption's indent is its label box's width, the label and its
    // separator; "Figure 1." 44.67 pt wide set the original's text at 95.61, 3.94 pt after it. The Chinese label is narrower: its
    // text starts 3.94 pt after it, and every later line hangs there, the measure from that edge to the original's right edge)
    const lines = sizedOf(caption(95.61), 'zh', row)
    expect(lines.length).toBeGreaterThan(1)
    const [first, ...rest] = lines
    expect(first!.items[0]![0]).toMatch(/^\u56fe/)
    expect(first!.items[0]![1]).toBeCloseTo(47, 1)
    const { end, scale } = labelEnd(first!.items, first!.sizes)
    const edge = end + (95.61 - 91.67) * scale
    const text = first!.items.find(([s]) => (s as string).includes('\u653f'))!
    expect(text[1]).toBeCloseTo(edge, 1)
    expect(edge).toBeLessThan(95.61 - 1)
    for (const l of rest) expect(l.items[0]![1]).toBeCloseTo(edge, 1)
  })
  it('hangs its text after a label drawn wider than the original’s, every line on that edge, past the original’s', () => {
    // (German "Abbildung 1." is wider than "Figure 1.": by the same rule its hang is wider)
    const de: Row = { id, ok: true, by: 'test', content: [{ t: 'text', s: 'Die Ergebnisse der Modelle '.repeat(3) }] }
    const lines = sizedOf(caption(95.61), 'de', de)
    expect(lines[0]!.items[0]![0]).toMatch(/^Abbildung/)
    expect(lines[0]!.items[0]![1]).toBeCloseTo(47, 1)
    const { end, scale } = labelEnd(lines[0]!.items, lines[0]!.sizes)
    const edge = end + (95.61 - 91.67) * scale
    const text = lines[0]!.items.find(([s]) => (s as string).startsWith('Die'))!
    expect(text[1]).toBeCloseTo(edge, 1)
    expect(edge).toBeGreaterThan(95.61)
    for (const l of lines.slice(1)) expect(l.items[0]![1]).toBeCloseTo(edge, 1)
  })
  it('sets no line past its slot: the label’s spaces, a box’s as TeX’s hang, are no space a line shrinks', () => {
    // (the reader gate's I5 on the zh packs: the breaker took a character on the hung first line counting the label's spaces as
    // ones that shrink, which the placement, the hang a box, never shrank: 9 lines up to 1.5 pt past their slot)
    const cjk = String.fromCodePoint(...Array.from({ length: 60 }, (_, k) => 0x4e00 + ((k * 37) % 400)))
    const r: Row = { id, ok: true, by: 'test', content: [{ t: 'text', s: cjk }] }
    const [laid] = layPage(
      part(caption(100.75)),
      { get: (k) => (k === id ? r : undefined), done: true },
      rulesFor('zh'),
      metrics(),
    ).members
    expect(laid!.state).toBe('laid')
    expect(laid!.lines[0]![3][0]!).toMatchObject({ x: 47 })
    for (const [, , , items] of laid!.lines) {
      const last = items.at(-1)!
      const end = 'face' in last ? last.x + (last.size * [...last.s.trimEnd()].length) / 2 : 0
      expect(end).toBeLessThanOrEqual(300 + 0.01)
    }
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
