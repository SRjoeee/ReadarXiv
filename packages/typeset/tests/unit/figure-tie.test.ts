// One size a group (the owner's rule of 2026-10-29): a figure's labels that stand in one set are drawn at one size, the least
// any of them needs, whatever path lays each. A label S.figures sets (its own text, Placed.plain) and a figure text the
// paragraph path lays (an element, lines joined, a label: no own text) in one size tie are drawn at one scale of their sizes:
// the set's factor caps the paragraph, a paragraph laid smaller caps the set. 2111.09276v1 p8, Figure 5: the plain items of a
// list's column at 0.73 of their size, the items holding a kept token at full size, within one item.
import type { Part, Placed, Row } from '@readarxiv/format'
import { describe, expect, it } from 'vitest'
import { layPage } from '../../src/lay/entry.ts'
import type { UnitLay } from '../../src/lay/page.ts'
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
  it('lays the paragraph at its set’s factor from every page’s lay that holds it (I6)', () => {
    // (2610.19159v1-ja p57: a figure's set on a page whose paragraph runs on to the next page. The next page's part holds every
    // flow with a line on that paragraph's first page (design-a §1.3 (b)), the set's too, and its lay runs that page's pass;
    // it laid the tied figure text at its own size, 1.0, where the figure's page lays it at the set's 0.66: the set's factor
    // was S.figures' over the figure texts of the page laid alone)
    const label = member(0, 400, 160, 170, 'Sand the top')
    const para = member(1, 388, 180, 300)
    const line = (page: number, y: number): Placed['lines'][number] => [
      page,
      0,
      100,
      300,
      y,
      y + 7.5,
      y - 2.5,
      100,
      300,
      0,
      10,
    ]
    const runOn: Placed = {
      ord: 2,
      kind: 'para',
      text: idOf(3),
      lead: 12,
      style: { role: 'sans', size: 10, design: 'LMSans10-Regular' },
      align: 'j',
      lines: [line(1, 120), line(1, 108), line(2, 700), line(2, 688)],
      room: { below: 20, next: 24 },
    }
    // (ideographs, escaped: the label's ten at 10 take 100 of its 70, its set at 0.7; the paragraph's seven fit at its size)
    const rows = rowsOf([
      [1, '\u6587'.repeat(10)],
      [2, '\u6587'.repeat(7)],
      [3, '\u6587'.repeat(72)],
    ])
    const laysOf = (page: number) => {
      const part: Part = {
        ...partOf([label, para, runOn], false),
        page,
        ties: [{ rule: 'size', ords: [0, 1] }],
      }
      const lays: UnitLay[] = []
      layPage(part, rows, rulesFor('zh'), metrics, { lays })
      return lays.filter((x) => x.page === 1)
    }
    const [one, two] = [laysOf(1), laysOf(2)]
    expect(one.map((x) => [x.ord, x.state, x.scale])).toEqual([
      [1, 'laid', 0.7],
      [2, 'laid', 1],
    ])
    expect(two).toEqual(one)
  })
})
