// One size a group (the owner's rule of 2026-10-29): a figure's labels that stand in one set are drawn at one size, the least
// any of them needs, whatever path lays each. A label S.figures sets (its own text, Placed.plain) and a figure text the
// paragraph path lays (an element, lines joined, a label: no own text) in one size tie are drawn at one scale of their sizes:
// the set's factor caps the paragraph, a paragraph laid smaller caps the set. 2111.09276v1 p8, Figure 5: the plain items of a
// list's column at 0.73 of their size, the items holding a kept token at full size, within one item.
import type { Part, Placed, Row } from '@readarxiv/format'
import { describe, expect, it } from 'vitest'
import { layPage } from '../../src/lay/entry.ts'
import { rulesFor } from '../../src/rules-for.ts'
import type { Item, Metrics, Rows } from '../../src/types.ts'

// (an ideograph a whole em, any other character half of one; ink 0.7 over the baseline and 0.2 under)
const CJK = /[　-〿一-鿿＀-￯]/u
const widthOf = (size: number, t: string) => [...t].reduce((a, c) => a + (CJK.test(c) ? size : size / 2), 0)
const metrics: Metrics = { ready: () => true, advance: (_f, size, t) => widthOf(size, t), ink: () => [70, 20, 0] }
const idOf = (n: number) => n.toString(16).padStart(64, '0')
const rowsOf = (list: [number, string][]): Rows => {
  const m = new Map(
    list.map(([n, s]): [string, Row] => [idOf(n), { id: idOf(n), ok: true, by: 'test', content: [{ t: 'text', s }] }]),
  )
  return { get: (k) => m.get(k), done: true }
}
const partOf = (ms: Placed[], tied: boolean): Part => ({
  format: 1,
  page: 1,
  paper: { faces: { fonts: [['LMSans10-Regular', 100]] } },
  flows: ms.map((m) => [m]),
  ...(tied ? { ties: [{ rule: 'size' as const, ords: ms.map((m) => m.ord) }] } : {}),
})
/** a figure text on baseline `y` from 100 to `x1`, its free line to `right`: a label of its own text, or one the paragraph path
 *  lays (no own text) */
const member = (ord: number, y: number, x1: number, right: number, plain?: string): Placed =>
  ({
    ord,
    kind: 'figure',
    text: idOf(ord + 1),
    lead: 12,
    style: { role: 'sans', size: 10, design: 'LMSans10-Regular' },
    align: 'l',
    ...(plain !== undefined ? { plain } : {}),
    lines: [[1, 0, 100, x1, y, y + 7.5, y - 2.5, 100, x1, 0, 10]],
    room: { below: 2, side: [90, right] },
  }) as Placed
/** each member's drawn sizes, by ord */
const sizes = (part: Part, rows: Rows) =>
  Object.fromEntries(
    layPage(part, rows, rulesFor('zh'), metrics).members.map((m) => [
      m.ord,
      [
        m.state,
        [...new Set(m.lines.flatMap((l) => (l[3] as Item[]).flatMap((it) => ('size' in it ? [it.size] : []))))],
      ],
    ]),
  )

describe('one size a group: a label and a figure text laid as a paragraph in one set', () => {
  it('draws the paragraph at the factor its set shrinks the labels to', () => {
    // (the label's translation, 100 at 10, takes 70 of its line: its set at 0.7; the paragraph's fits at its size)
    const label = member(0, 400, 160, 170, 'Sand the top')
    const para = member(1, 388, 180, 300)
    const rows = rowsOf([
      [1, '沿着木纹打磨顶部表面'],
      [2, '用干净的布擦拭'],
    ])
    expect(sizes(partOf([label, para], false), rows)).toEqual({ 0: ['laid', [7]], 1: ['laid', [10]] })
    expect(sizes(partOf([label, para], true), rows)).toEqual({ 0: ['laid', [7]], 1: ['laid', [7]] })
  })
  it('shrinks the set’s labels to the scale its paragraph is laid at', () => {
    // (the paragraph's translation, 90 at 10, on its line of 60 and no room under it: the fit's steps on below the floor, to
    // 0.675; the label fits at its size)
    const label = member(0, 400, 160, 300, 'Sand the top')
    const para = member(1, 388, 160, 165)
    const rows = rowsOf([
      [1, '打磨顶部'],
      [2, '用干净的布擦拭桌面'],
    ])
    expect(sizes(partOf([label, para], false), rows)).toEqual({ 0: ['laid', [10]], 1: ['laid', [6.75]] })
    expect(sizes(partOf([label, para], true), rows)).toEqual({ 0: ['laid', [6.75]], 1: ['laid', [6.75]] })
  })
})
