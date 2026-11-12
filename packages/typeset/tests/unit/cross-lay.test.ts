// I6 across the pages' lays (tests/replay/cross-lay.ts, read by lab/typeset/gate-l1.mjs --entry): each unit begun on a pass
// page compared as every page's lay that runs that pass laid it; one laid otherwise is the head pass's known cause where its
// head differs and nothing else but what the head moves, any other cause new.
import { describe, expect, it } from 'vitest'
import type { FitState } from '../../src/fit/types.ts'
import type { UnitLay } from '../../src/lay/page.ts'
import { crossLayOf, layDiffer } from '../replay/cross-lay.ts'

const at = (o: Partial<FitState> = {}): FitState => ({
  lead: 1.3,
  track: 0,
  trackLatin: 0,
  compress: 0,
  borrow: 0,
  scale: 1,
  knob: 'none',
  ...o,
})
const lay = (o: Partial<UnitLay> = {}): UnitLay => ({
  ord: 7,
  page: 4,
  state: 'laid',
  scale: 1,
  at: at(),
  lines: [
    [4, 700, 10],
    [4, 686, 10],
  ],
  ...o,
})

describe('I6 across the pages’ lays', () => {
  it('finds nothing where every lay laid the unit alike', () => {
    expect(layDiffer(lay(), lay())).toEqual({ what: '', head: false })
    const by = new Map([
      [
        7,
        new Map([
          [4, lay()],
          [5, lay()],
        ]),
      ],
    ])
    expect(crossLayOf(by)).toEqual({ units: 1, twice: 1, differ: [] })
  })
  it('tells the head pass’s cause by what it moves: the head, the first frame’s leading, the baselines', () => {
    // (2610.10069v1 p7 t46: head 5.99 by page 7's lay, 1.51 by page 8's, its last line 4.48 lower)
    const a = lay({
      at: at({ head: 5.99 }),
      lines: [
        [4, 690, 10],
        [4, 676, 10],
      ],
    })
    const b = lay({
      at: at({ head: 1.51 }),
      lines: [
        [4, 694.48, 10],
        [4, 680.48, 10],
      ],
    })
    expect(layDiffer(a, b)).toEqual({ what: 'at.head 5.99 / 1.51; lines: baselines', head: true })
    // (one lay asks no head at all: its field absent; the head pass lays it again over the fill's state, its mark `box` with
    // it, where the other kept the layout S.fill.leads found, 2610.11256v1 p5 t16)
    expect(layDiffer(lay(), lay({ at: at({ head: 3.44, lead: 1.2 }) })).head).toBe(true)
    expect(layDiffer(lay(), lay({ at: at({ head: 7.17, box: 1, borrow: 0 }) })).head).toBe(true)
  })
  it('calls any other difference new: a scale, a state, a line more, a field the head pass does not move', () => {
    // (2610.19159v1-ja p57 unit 3883: its set's factor 0.66 by page 57's lay, its own size by page 58's)
    expect(layDiffer(lay({ scale: 0.66, at: at({ scale: 0.66, knob: 'clear' }) }), lay())).toEqual({
      what: 'scale 0.66 / 1; at.knob; at.scale 0.66 / 1',
      head: false,
    })
    expect(layDiffer(lay(), lay({ state: 'unfit', scale: undefined, at: undefined, lines: undefined })).head).toBe(
      false,
    )
    expect(
      layDiffer(
        lay(),
        lay({
          lines: [
            [4, 700, 10],
            [4, 686, 10],
            [4, 672, 10],
          ],
        }),
      ).what,
    ).toBe('lines 2 / 3')
    // (a head with a tracking moved too: not the head pass's alone)
    expect(layDiffer(lay({ at: at({ head: 2 }) }), lay({ at: at({ track: 0.05 }) })).head).toBe(false)
    // (a unit laid a run at a time, fit/runs.ts: its layout's scale and state its first run's, each line drawn at its run's
    // size; two lays that differ in a later run's drawn size alone differ, whatever the head says (lane gate-finds: 2610.40645v1
    // t174, its line before a display at 10.64 pt, its two after it at 10.91 on the next page))
    const runs = (second: number) =>
      lay({
        lines: [
          [4, 108.16, 10.64],
          [5, 709.04, second],
          [5, 693.05, second],
        ],
      })
    expect(layDiffer(runs(10.91), runs(10.91)).what).toBe('')
    expect(layDiffer(runs(10.91), runs(10.64))).toEqual({ what: 'lines: sizes', head: false })
    expect(layDiffer(runs(10.91), { ...runs(10.64), at: at({ head: 2 }) }).head).toBe(false)
    const by = new Map([
      [
        7,
        new Map([
          [4, lay({ at: at({ head: 2 }) })],
          [5, lay()],
        ]),
      ],
      [
        9,
        new Map([
          [4, lay({ ord: 9, scale: 0.66 })],
          [5, lay({ ord: 9 })],
          [6, lay({ ord: 9 })],
        ]),
      ],
    ])
    expect(crossLayOf(by).differ.map((d) => [d.ord, d.by, d.cause])).toEqual([
      [7, [4, 5], 'head'],
      [9, [4, 5, 6], 'other'],
    ])
  })
})
