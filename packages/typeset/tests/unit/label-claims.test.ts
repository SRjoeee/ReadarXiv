// The two claims on a caption's label are exclusive: a label TeX hung beside its text (Label.line 0, every text line at one x
// past it: §18.29's hang, adapt.ts) is laid in its hang and never as a row of its own; a label on a line of its own (no
// `line`, its own line's `align`: §18.34's row, entry.ts labelRowOf) is laid as that row and never hangs the text. Over the
// 88 (marks-2's lab count, exclusive.py): 35 hung, 36 rows, none both.
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
const at = (s: string, x0: number, w: number, y: number): [string, Ink] => [s, [1, x0, y - 2, x0 + w, y + 7, y]]
/** a caption of three lines at x 95.61 (its measure 47 to 300) and its label "Figure 1." at 47 on baseline `y`: 700, the
 *  first line's (hung), or 712, a line of its own (`line` none, `align`) */
const caption = (y: number): Placed => ({
  ord: 0,
  kind: 'caption',
  text: id,
  lead: 12,
  style: { role: 'serif', size: 10, design: 'NimbusRomNo9L-Regu' },
  align: 'j',
  lines: [
    [1, 0, 95.61, 300, 700, 707, 698, 47, 300, 0, 10],
    [1, 0, 95.61, 300, 688, 695, 686, 47, 300, 0, 10],
    [1, 0, 95.61, 200, 676, 683, 674, 47, 300, 0, 10],
  ],
  room: { below: 20, next: 24 },
  label: {
    kind: 'float',
    float: 'figure',
    ink: [1, 47, y - 2, 91.67, y + 7, y],
    style: { role: 'serif', size: 10, design: 'NimbusRomNo9L-Regu', bold: 1 },
    ...(y === 700 ? { line: 0 } : { align: 'l' as const }),
    name: at('Figure', 47, 32, y),
    num: at('1', 82.18, 6.34, y),
    punct: at('.', 88.52, 3.15, y),
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
const laidOf = (m: Placed) => {
  const [laid] = layPage(part(m), rows, rulesFor('zh'), metrics()).members
  expect(laid!.state).toBe('laid')
  return laid!.lines.map(([y, x0, , items]) => ({ y, x0, s: items.map((it) => ('face' in it ? it.s : '')).join('') }))
}
const LABEL = /图\s*1/u

describe('the two claims on a caption’s label are exclusive', () => {
  it('a hung label (line 0) is laid in its hang on the first line, with no row of its own', () => {
    const lines = laidOf(caption(700))
    // (no line above the first's baseline, and the label drawn on the first line, where its hang is)
    expect(lines.filter((l) => l.y > 700.5)).toEqual([])
    const top = lines.reduce((a, l) => (l.y > a.y ? l : a))
    expect(top.y).toBe(700)
    expect(top.s).toMatch(LABEL)
    expect(lines.filter((l) => LABEL.test(l.s))).toHaveLength(1)
  })
  it('a label on a line of its own (no line) is laid as that row, the text never hung after it', () => {
    const lines = laidOf(caption(712))
    expect(lines.find((l) => l.y === 712)?.s).toMatch(LABEL)
    const first = lines.find((l) => l.y === 700)!
    expect(first.s).not.toMatch(LABEL)
    expect(first.x0).toBeCloseTo(95.61, 1)
  })
})
