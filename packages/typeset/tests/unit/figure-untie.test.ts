// A figure text is sized by its own width alone (the owner's ruling of 2026-11-13 on a figure's sets, (B): each at its own
// size; docs/PDF-READER.md §19.12, his words quoted there). Whether to shrink is whether its translation goes past the
// original's own room; a mate's width is no part of that. The part still states a figure's set as a size tie (the engine's
// fact, today's figure reading's sets); the lay reads it for no size: a label S.figures sets and a figure text the paragraph
// path lays (§18.54) each take what their own width needs, and a part with the tie and one without it lay them alike.
import type { Part, Placed, Row } from '@readarxiv/format'
import { describe, expect, it } from 'vitest'
import { rolesFor } from '../../src/breaker/faces.ts'
import { layPage } from '../../src/lay/entry.ts'
import { figuresOf } from '../../src/lay/figures.ts'
import type { PaperReading } from '../../src/lay/read.ts'
import { rulesFor } from '../../src/rules-for.ts'
import type { Item, Metrics, RuleParams, Rows } from '../../src/types.ts'

// (an ideograph a whole em, any other character half of one; every run's ink 0.7 of its size over its baseline and 0.2 under)
const CJK = /[　-〿一-鿿＀-￯]/u
const widthOf = (size: number, t: string) => [...t].reduce((a, c) => a + (CJK.test(c) ? size : size / 2), 0)
const metrics: Metrics = { ready: () => true, advance: (_f, size, t) => widthOf(size, t), ink: () => [70, 20, 0] }
/** a translation of `n` ideographs, `n` em long */
const zi = (n: number) => '字'.repeat(n)

describe('S.figures over the part: each text of a set at what its own width needs', () => {
  const R = { cjkQuotes: true, floorMin: 0.6, centredPunct: false, compressMax: 2 } as RuleParams
  const paper = {
    designs: { serif: 'times', sans: 'helvetica', mono: 'courier' },
    roles: rolesFor('zh', 'times', { group: 'shs-sc' }),
  } as unknown as PaperReading
  /** a level label of size 10 from x 100 to `x1` on baseline `y`, set from its start, no free line beside its box */
  const member = (ord: number, x1: number, y: number): Placed =>
    ({
      ord,
      kind: 'figure',
      text: `u${ord}`,
      plain: 'Original',
      lines: [[1, 0, 100, x1, y, y + 7, y - 2, 100, x1, 0, 10]],
      style: { role: 'serif', size: 10, design: 'Times-Roman' },
      room: { below: 0, side: [100, x1] },
      align: 'l',
    }) as unknown as Placed
  const rowsOf = (texts: Record<number, string>): Rows =>
    ({
      get: (k: string) => {
        const s = texts[Number(k.slice(1))]
        return s === undefined ? undefined : ({ ok: true, content: [{ t: 'text', s }] } as unknown as Row)
      },
    }) as unknown as Rows
  /** each member's drawn size (null: left the original's), its set stated as the part's size tie or not */
  const sizes = (ms: Placed[], texts: Record<number, string>, tied: boolean) => {
    const part = { page: 1, ties: tied ? [{ rule: 'size', ords: ms.map((m) => m.ord) }] : [] } as unknown as Part
    const got = figuresOf(part, ms, rowsOf(texts), { paper, R, metrics })
    return ms.map((m) => {
      const items = (got.laid.get(m.ord)?.[0]?.[3] ?? []) as Item[]
      const s = [...new Set(items.flatMap((it) => ('size' in it ? [it.size] : [])))]
      return s.length === 1 ? s[0] : s.length ? s : null
    })
  }
  /** three labels of one legend, each 60 long but the first, whose box is `x1` - 100 long */
  const legend = (x1: number) => [member(1, x1, 200), member(2, 160, 188), member(3, 160, 176)]

  it('steps the one wider than its original by its own width, its mates at the original’s size', () => {
    // (the first's nine ideographs, 90 at 10, in a box of 81 with no room: 0.9; its mates' three and two fit their 60)
    const texts = { 1: zi(9), 2: zi(3), 3: zi(2) }
    expect(sizes(legend(181), texts, true)).toEqual([9, 10, 10])
    expect(sizes(legend(181), texts, true)).toEqual(sizes(legend(181), texts, false))
  })
  it('moves no mate where a text once left the original’s is drawn again (2111.09276v1 p8: one label took 50 mates to .871)', () => {
    // (the first's ten ideographs, 100 at 10, in a box of 80: 0.8; with no row it is left the original's, then drawn)
    const before = { 2: zi(3), 3: zi(2) }
    const after = { 1: zi(10), ...before }
    expect(sizes(legend(180), before, true)).toEqual([null, 10, 10])
    expect(sizes(legend(180), after, true)).toEqual([8, 10, 10])
  })
  it('draws one at the floor at the floor, its mates at the original’s size', () => {
    // (ten ideographs in a box of 60: 0.6, the floor)
    expect(sizes(legend(160), { 1: zi(10), 2: zi(3), 3: zi(2) }, true)).toEqual([6, 10, 10])
  })
  it('leaves one under the floor the original’s, as before, its mates untouched', () => {
    // (twelve ideographs in a box of 60: 0.5, under the floor 0.6)
    expect(sizes(legend(160), { 1: zi(12), 2: zi(3), 3: zi(2) }, true)).toEqual([null, 10, 10])
  })
  it('steps a set of one by its width alone, as before', () => {
    // (eight ideographs, 80 at 10, in a box of 60: 0.75)
    expect(sizes([member(1, 160, 200)], { 1: zi(8) }, true)).toEqual([7.5])
  })
})

describe('the entry: a label and a figure text the paragraph path lays, in one set, each at its own size', () => {
  const idOf = (n: number) => n.toString(16).padStart(64, '0')
  const rowsOf = (list: [number, string][]): Rows => {
    const m = new Map(
      list.map(([n, s]): [string, Row] => [
        idOf(n),
        { id: idOf(n), ok: true, by: 'test', content: [{ t: 'text', s }] },
      ]),
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
  /** a figure text on baseline `y` from 100 to `x1`, its free line to `right`: a label of its own text, or one the paragraph
   *  path lays (no own text) */
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
  /** each member's state and drawn sizes, by ord */
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
  /** each member as the page draws it: its state and its lines */
  const drawn = (part: Part, rows: Rows) =>
    layPage(part, rows, rulesFor('zh'), metrics).members.map((m) => [m.ord, m.state, m.lines])

  it('draws the paragraph at its own size where the label’s width steps the label', () => {
    // (the label's ten ideographs, 100 at 10, take 70 of its line: 0.7; the paragraph's seven fit its line at its size)
    const ms = [member(0, 400, 160, 170, 'Sand the top'), member(1, 388, 180, 300)]
    const rows = rowsOf([
      [1, zi(10)],
      [2, zi(7)],
    ])
    expect(sizes(partOf(ms, true), rows)).toEqual({ 0: ['laid', [7]], 1: ['laid', [10]] })
  })
  it('draws the label at its own size where the paragraph is laid smaller', () => {
    // (the paragraph's nine ideographs, 90 at 10, on its line of 60 and no room under it: the fit's steps on, to 0.675; the
    // label's four fit at its size)
    const ms = [member(0, 400, 160, 300, 'Sand the top'), member(1, 388, 160, 165)]
    const rows = rowsOf([
      [1, zi(4)],
      [2, zi(9)],
    ])
    expect(sizes(partOf(ms, true), rows)).toEqual({ 0: ['laid', [10]], 1: ['laid', [6.75]] })
  })
  it('lays a figure’s texts alike whether its part states their set’s size tie or not', () => {
    const cases: [Placed[], Rows][] = [
      [
        [member(0, 400, 160, 170, 'Sand the top'), member(1, 388, 180, 300), member(2, 376, 160, 300, 'Wipe')],
        rowsOf([
          [1, zi(10)],
          [2, zi(7)],
          [3, zi(2)],
        ]),
      ],
      [
        [member(0, 400, 160, 300, 'Sand the top'), member(1, 388, 160, 165)],
        rowsOf([
          [1, zi(4)],
          [2, zi(9)],
        ]),
      ],
    ]
    for (const [ms, rows] of cases) expect(drawn(partOf(ms, true), rows)).toEqual(drawn(partOf(ms, false), rows))
  })
})
