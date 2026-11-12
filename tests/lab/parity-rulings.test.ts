// @vitest-environment node
// The owner's rulings of 2026-11-12 as the display gate reads them (lab/typeset/parity/rulings.mjs): each class he accepted is a
// condition the gate measures on the page. For each ruling a page inside its class (worse by its measure, now covered by the
// ruling) and one just outside it (still worse). Synthetic pages, each the geometry of the example he saw.
import { describe, expect, it } from 'vitest'
// @ts-expect-error — a plain node module of the lab
import { recount } from '../../lab/typeset/parity/verdict.mjs'
// @ts-expect-error — a plain node module of the lab
import { NO_PAGE_LEFT, RULINGS, rowsOf, rulingsOf, rulingsPass, WHOLE } from '../../lab/typeset/parity/rulings.mjs'

const N = 4
type Diff = { flag: string; unit: string; original: unknown; today: { value: unknown; off: unknown }; v2: { value: unknown; off: unknown }; nearer: string; worse: boolean; covered?: string; relaid?: object }
type Line = { y: number; x0: number | null; x1: number | null; size: number; n: number; text: string }
/** a line of the part's facts on page N: [page, -, x0, x1, baseline, top, bottom, m0, m1, -, size] */
const fact = (x0: number, x1: number, y: number, size = 10, page = N) => [page, 0, x0, x1, y, y + 0.8 * size, y - 0.2 * size, 48, 563, 0, size]
const drawn = (y: number, x0: number, x1: number, size: number, text: string): Line => ({ y, x0, x1, size, n: [...text].filter((c) => c !== '\ufffc' && !/\s/.test(c)).length, text })
/** a worse difference as measurePage writes one */
const worse = (flag: string, unit: string, original: unknown, today: unknown, v2: unknown, off: [unknown, unknown] = [0, 1]): Diff => ({
  flag,
  unit,
  original,
  today: { value: today, off: off[0] },
  v2: { value: v2, off: off[1] },
  nearer: 'today',
  worse: true,
})
type Ctx = { rec: object; v2: object; laid?: object; unsqueezed?: object | null }
/** the pass over one page: its diffs as they come out (each worse or covered, by which ruling) */
const judged = (p: { diffs: Diff[]; units?: object[]; figurePairs?: [number, string][] }, c: Ctx) => {
  const page = { pair: 'p-zh', page: N, worse: 0, units: [], figurePairs: [], ...p }
  rulingsPass([page], { recOf: () => c.rec, v2: c.v2, laid: c.laid ?? {}, unsqueezed: c.unsqueezed ?? null }, recount)
  return { page, out: page.diffs.map((d) => [d.unit, d.worse, d.covered ?? null]) }
}
const rec = (today: object = {}, v2: object = {}, px: object = {}) => ({ page: N, today: { units: [], crops: [], ...today }, v2: { units: [], crops: [], ...v2 }, px })
/** a unit's lines, top first, `k` of them from baseline `top` at pitch `pitch` */
const paragraph = (k: number, top: number, pitch: number, size: number, x0 = 312, x1 = 563) => Array.from({ length: k }, (_, i) => drawn(top - i * pitch, x0, x1, size, '\u5b57'.repeat(20)))
const side = (lines: number, size: number, osize: number, olines: number, more: object = {}) => ({ lines, size, osize, olines, ...more })

describe('L1: a paragraph a line shorter than today, in the height today takes', () => {
  // (2610.21312v1-zh p1 t7: the original's 13 lines from 404.77 at 11.95; today 10 at 10.16 pt, 15.30 apart; v2 9 at 9.96 pt,
  // 17.21 apart; both last baselines at 267.05)
  const ol = Array.from({ length: 13 }, (_, i) => fact(312, 563, 404.77 - i * 11.95, 9.96))
  const v2 = { facts: { [N]: { members: [{ ord: 7, kind: 'para', align: 'j', style: { size: 9.96 }, lines: ol }], ties: [] } } }
  const page = (o: { vLines?: number; vPitch?: number; vSize?: number; tSize?: number }) => {
    const vl = o.vLines ?? 9,
      vp = o.vPitch ?? 17.21,
      vs = o.vSize ?? 9.96,
      ts = o.tSize ?? 10.16
    return judged(
      {
        diffs: [worse('line-count', 't7 para', 13, 10, vl, [3, 13 - vl])],
        units: [{ key: 't7', kind: 'para', part: 7, align: 'j', sides: { today: side(10, ts, 9.96, 13), v2: side(vl, vs, 9.96, 13) } }],
      },
      { v2, rec: rec({ units: [{ id: 7, lines: paragraph(10, 404.77, 15.3, ts) }] }, { units: [{ id: 7, lines: paragraph(vl, 404.77, vp, vs) }] }) },
    ).out
  }
  it("v2's last line on today's, at the original's size: covered by L1", () => {
    expect(page({})).toEqual([['t7 para', false, 'L1']])
  })
  it("its last line half a line or more over today's (here 9 pt on today's 15.30): not L1's, but L2's look (below)", () => {
    // (v2's 9 lines 16.08 apart end at 276.13, 9.08 pt over today's)
    expect(page({ vPitch: 16.08, tSize: 9.96 })).toEqual([['t7 para', false, 'L2']])
  })
  it("v2 smaller than the original's: worse", () => {
    expect(page({ vSize: 9.5 })).toEqual([['t7 para', true, null]])
  })
  it('two lines fewer than today: worse', () => {
    expect(page({ vLines: 8, vPitch: 19.36 })).toEqual([['t7 para', true, null]])
  })
})

describe('L2: a paragraph a line shorter than today, ending higher: the look he judged, its cause reported, never asked', () => {
  // (2610.40645v1-ja p4 t13: the original's and today's 7 lines from 709.04, 13.99 and 14.01 apart, today at 11.12 pt (the original's
  // 10.91); v2 6 at 10.91, 14.23 apart, its last 12.93 over theirs)
  const ol = Array.from({ length: 7 }, (_, i) => fact(72, 540, 709.04 - i * 14.01, 10.91))
  const v2 = { facts: { [N]: { members: [{ ord: 13, kind: 'para', align: 'j', style: { size: 10.91 }, lines: ol }], ties: [] } } }
  const page = (o: { tSize?: number; vSize?: number; vPitch?: number; vLines?: number; unsqueezed?: number; more?: Diff[] }) => {
    const vl = o.vLines ?? 6,
      ts = o.tSize ?? 11.12,
      vs = o.vSize ?? 10.91
    const { page: p } = judged(
      {
        diffs: [worse('line-count', 't13 para', 7, 7, vl, [0, 7 - vl]), ...(o.more ?? [])],
        units: [{ key: 't13', kind: 'para', part: 13, align: 'j', sides: { today: side(7, ts, 10.91, 7), v2: side(vl, vs, 10.91, 7) } }],
      },
      {
        v2,
        rec: rec({ units: [{ id: 13, lines: paragraph(7, 709.04, 14.01, ts, 72, 540) }] }, { units: [{ id: 13, lines: paragraph(vl, 709.04, o.vPitch ?? 14.23, vs, 72, 540) }] }),
        laid: { [N]: { members: [{ ord: 13, lines: Array.from({ length: vl }, () => []) }] } },
        unsqueezed: o.unsqueezed === undefined ? null : { [N]: { 13: o.unsqueezed } },
      },
    )
    const d = (p.diffs as (Diff & { coveredSays?: string })[]).find((x) => x.flag === 'line-count')
    return [d?.worse, d?.covered ?? null, d?.coveredSays ?? null]
  }
  it('a line fewer, at the original size, under one of its lines higher, the unit whole: covered by L2, its cause reported', () => {
    expect(page({})).toEqual([false, 'L2', 'cause 1: today 1.9 % larger than the original'])
    expect(page({ tSize: 10.91, unsqueezed: 7 })).toEqual([false, 'L2', "cause 2: with no CJK line squeezed v2 sets today's count"])
    // (no cause the page states: the look is what he accepted)
    expect(page({ tSize: 10.91, unsqueezed: 6 })).toEqual([false, 'L2', 'cause not read'])
    expect(page({ tSize: 10.91 })).toEqual([false, 'L2', 'cause not read'])
  })
  it('more than one of its lines over today\'s last: worse', () => {
    // (6 lines 11 apart end at 654.04, 29.88 over today's last on a leading of 11)
    expect(page({ vPitch: 11 })).toEqual([true, null, null])
  })
  it("v2 smaller than the original's: worse", () => {
    expect(page({ vSize: 10.4 })).toEqual([true, null, null])
  })
  it('the unit not whole (an element of it drawn as nothing, a translation missing in it): worse', () => {
    expect(page({ more: [worse('elements', 't13 para', 0, null, 'element 3: drawn as nothing where TeX set ink')] })).toEqual([true, null, null])
    expect(page({ more: [worse('shown', 't13 para', null, 'translated', 'label')] })).toEqual([true, null, null])
  })
})

describe('S1: a figure\'s labels at their group\'s size', () => {
  // (1512.03385v1-zh p6, Figure 5's "relu" labels: a tie of the part's (a figure's set at one size), v2 translates every one at
  // 4.37 pt; today translates two of them, at 4.95, the rest the original's)
  const labels = [523, 524, 525]
  const v2 = { facts: { [N]: { members: labels.map((o) => ({ ord: o, kind: 'figure', align: 'l', style: { size: 5.46 }, lines: [fact(482, 492, 700 - o, 5.46)] })), ties: [labels] } } }
  const v2Units = (sizes: number[]) => labels.map((o, i) => ({ id: o, lines: [drawn(700 - o, 482, 492, sizes[i] ?? 0, '\u96f7\u9c81')] }))
  const page = (joined: number[], sizes = [4.37, 4.37, 4.37]) =>
    judged({ diffs: [worse('size', 'p525 figure', 5.46, 4.95, sizes[2], [0.09, 0.2])], figurePairs: joined.map((o) => [o, `f${o}`]) }, { v2, rec: rec({}, { units: v2Units(sizes) }) }).out
  it('v2 the whole set at one size, today some of it: covered by S1', () => {
    expect(page([525])).toEqual([['p525 figure', false, 'S1']])
  })
  it('today translating the whole set as well: worse', () => {
    expect(page(labels)).toEqual([['p525 figure', true, null]])
  })
  it("v2's set at two sizes: worse", () => {
    expect(page([525], [4.9, 4.37, 4.37])).toEqual([['p525 figure', true, null]])
  })
})

describe("S2: a table cell's text smaller than today's, kept to its cell", () => {
  // (2608.04322v1-zh p10 t256: v2 at 6.10 pt, 2.67 pt past its cell, where today keeps 6.97 by running 12.98 past it)
  const v2 = { facts: { [N]: { members: [{ ord: 256, kind: 'cell', align: 'c', style: { size: 6.97 }, lines: [fact(400, 430, 404.04, 6.97)] }], ties: [] } } }
  const page = (frame: [number, number] | null) =>
    judged(
      {
        diffs: [
          worse('size', 't256 cell', 6.97, 6.97, 6.1, [0, 0.12]),
          ...(frame ? [{ ...worse('frame', 't256 cell', 0, frame[0], frame[1], frame), nearer: frame[1] < frame[0] ? 'v2' : 'today', worse: frame[1] > frame[0] }] : []),
        ],
        units: [{ key: 't256', kind: 'cell', part: 256, align: 'c', sides: { today: side(1, 6.97, 6.97, 1), v2: side(1, 6.1, 6.97, 1) } }],
      },
      { v2, rec: rec() },
    ).page.diffs.filter((d) => d.flag === 'size').map((d) => [d.unit, d.worse, d.covered ?? null])
  it("v2 smaller, nearer its cell's room than today, which runs past it: covered by S2", () => {
    expect(page([12.98, 2.67])).toEqual([['t256 cell', false, 'S2']])
  })
  it("today inside its cell (no frame difference), or v2 wholly inside with room to spare: worse", () => {
    expect(page(null)).toEqual([['t256 cell', true, null]])
    expect(page([12.98, 0])).toEqual([['t256 cell', true, null]])
  })
})

describe('S3: a heading kept on its one line at a smaller size; a small-capitals heading at the size TeX set it', () => {
  it('(a) on the original\'s one line at 11.06 where today keeps 11.96 on two (2608.16117v1-de p4 t12): covered; today on one line too: worse', () => {
    const v2 = { facts: { [N]: { members: [{ ord: 12, kind: 'heading', align: 'j', style: { size: 11.96 }, lines: [fact(72, 540, 696.14, 11.96)] }], ties: [] } } }
    const page = (tLines: number) =>
      judged(
        {
          diffs: [worse('size', 't12 heading', 11.96, tLines === 2 ? 11.96 : 11.5, 11.06, [0, 0.08])],
          units: [{ key: 't12', kind: 'heading', part: 12, sides: { today: side(tLines, tLines === 2 ? 11.96 : 11.5, 11.96, 1), v2: side(1, 11.06, 11.96, 1) } }],
        },
        { v2, rec: rec() },
      ).out
    expect(page(2)).toEqual([['t12 heading', false, 'S3']])
    expect(page(1)).toEqual([['t12 heading', true, null]])
  })
  it("(b) set in small capitals at 9.96 (its letters 7.97), v2 at 9.96 (2610.21312v1-zh p6 t70): covered; v2 at 10.6: worse", () => {
    const v2 = { facts: { [N]: { members: [{ ord: 70, kind: 'heading', align: 'c', style: { caps: 1, sc: 0.8, size: 9.9626 }, lines: [fact(335, 563, 132.84, 7.97)] }], ties: [] } } }
    const page = (vSize: number) =>
      judged(
        {
          diffs: [worse('size', 't70 heading', 7.97, 9.76, vSize, [0.22, Math.abs(1 - vSize / 7.97)])],
          units: [{ key: 't70', kind: 'heading', part: 70, sides: { today: side(1, 9.76, 7.97, 1), v2: side(1, vSize, 7.97, 1) } }],
        },
        { v2, rec: rec() },
      ).out
    expect(page(9.96)).toEqual([['t70 heading', false, 'S3']])
    expect(page(10.6)).toEqual([['t70 heading', true, null]])
  })
})

describe("S4: a theorem shrunk no more than one fit step under today's", () => {
  // (2610.40645v1-ja p33 t283: a theorem v2 sets at 10.36 pt (two fit steps under the original's 10.91), today at 10.53: 0.61 of a
  // step under today's. Its p22 t174, the example he saw: 10.64 against today's 10.98, 1.26 steps)
  const v2 = { facts: { [N]: { members: [{ ord: 283, kind: 'theorem', align: 'j', style: { size: 10.91 }, lines: [fact(72, 540, 257.9, 10.91)] }], ties: [] } } }
  const page = (t: number, v: number, kind = 'theorem', more: Diff[] = []) => {
    const { page: p } = judged(
      { diffs: [worse('size', `t283 ${kind}`, 10.91, t, v, [Math.abs(1 - t / 10.91), Math.abs(1 - v / 10.91)]), ...more], units: [{ key: 't283', kind, part: 283, sides: { today: side(5, t, 10.91, 6), v2: side(5, v, 10.91, 6) } }] },
      { v2, rec: rec() },
    )
    const d = (p.diffs as (Diff & { coveredSays?: string })[]).find((x) => x.flag === 'size')
    return [d?.worse, d?.covered ?? null, d?.coveredSays ?? null]
  }
  it('0.61 of a fit step under today\'s, the unit whole: covered by S4, its steps reported', () => {
    expect(page(10.53, 10.36363)).toEqual([false, 'S4', "0.61 of a fit step under today's"])
  })
  it("1.26 steps under today's (his own example), a paragraph, or the unit not whole: worse", () => {
    expect(page(10.98, 10.63637)).toEqual([true, null, null])
    expect(page(10.53, 10.36363, 'para')).toEqual([true, null, null])
    expect(page(10.53, 10.36363, 'theorem', [worse('scripts', 't283 theorem', 2, 0, 2)])).toEqual([true, null, null])
  })
})

describe("T2: a table's header row with a cell kept as the original, the others translated (his answer ①, 15:22)", () => {
  const page = (unit: string, today: string, v2: string) =>
    judged({ diffs: [worse('groups', unit, 'whole', today, v2)] }, { v2: { facts: { [N]: { members: [], ties: [] } } }, rec: rec() }).out
  it("a header row v2 draws mixed where today keeps it whole the original's (1810.04805 p7) or translates it whole (2608.06701 p10): covered", () => {
    expect(page('group 4:h', 'original', 'mixed')).toEqual([['group 4:h', false, 'T2']])
    expect(page('group 7:h', 'target', 'mixed')).toEqual([['group 7:h', false, 'T2']])
  })
  it('a column group drawn mixed, or a header row v2 keeps whole where today translates it: worse', () => {
    expect(page('group 4:c2', 'target', 'mixed')).toEqual([['group 4:c2', true, null]])
    expect(page('group 4:h', 'target', 'original')).toEqual([['group 4:h', true, null]])
  })
})

describe('E1: a web or e-mail address cut over two lines at its own break point', () => {
  // (2608.06701v1-zh p12 t321: "https://" | "swe-agent.com/…" from one line of arXiv's page, drawn at the end of v2's first line
  // and the start of its second)
  const el = (literal: number) => ['4', 'other', [[70.54, 121.2, 262.34, 130.18, 123.38]], 1, 1, 0, 0, literal, '\\url{https://swe-agent.com/}']
  const v2 = (literal: number) => ({ facts: { [N]: { members: [{ ord: 331, kind: 'reference', align: 'j', style: { size: 9.96 }, lines: [fact(70.54, 300, 135.33, 9.96), fact(70.54, 290.64, 123.38, 9.96)], els: [el(literal)] }], ties: [] } } })
  const lines = [drawn(135.33, 70.54, 238, 9.96, 'x'.repeat(30)), drawn(123.38, 234.75, 244.71, 9.96, ',')]
  /** [unit, x0, y0, x1, y1, piece, sx0, sy0, sx1, sy1, source page] */
  const cut = [
    [331, 238.9, 132.8, 267.2, 142.5, '1', 70.2, 120.8, 98.5, 130.6, N],
    [331, 70.5, 120.8, 234.7, 130.6, '1', 98.5, 120.8, 262.7, 130.6, N],
  ]
  const page = (literal: number, crops: unknown[]) =>
    judged(
      { diffs: [worse('elements', 't321 reference', 0, null, 'element 1: its 2 pieces TeX set on one line drawn apart', [0, 1])], units: [{ key: 't321', kind: 'reference', part: 331 }] },
      { v2: v2(literal), rec: rec({}, { units: [{ id: 331, lines }], crops }) },
    ).out
  it("a URL's pieces, the first ending v2's line and the next opening the line under it: covered by E1", () => {
    expect(page(1, cut)).toEqual([['t321 reference', false, 'E1']])
  })
  it('the element not one TeX sets as written (a formula): worse', () => {
    expect(page(0, cut)).toEqual([['t321 reference', true, null]])
  })
  it('its pieces apart on one line (a gap, no line end between them): worse', () => {
    const apart = [cut[0], [331, 140, 132.8, 304.2, 142.5, '1', 98.5, 120.8, 262.7, 130.6, N]]
    expect(page(1, apart)).toEqual([['t321 reference', true, null]])
  })
})

describe('A1: a last line of one character', () => {
  // (2610.30034v1-zh p7 t139: an item of a theorem, its text from 336.2 after "(i)", a display under it; v2 at the original's 9.96
  // on its two lines, the second the one character before the display, at the item's margin)
  const v2 = { facts: { [N]: { members: [{ ord: 139, kind: 'theorem', align: 'j', style: { size: 9.96 }, lines: [fact(336.2, 552.1, 497.54, 9.96), fact(383.6, 515.6, 473.63, 9.96)] }], ties: [] } } }
  const page = (last: Line) =>
    judged(
      {
        diffs: [worse('align', 't139 theorem', 'justified', null, null, [0, 47.39])],
        units: [{ key: 't139', kind: 'theorem', part: 139, align: 'j', sides: { today: side(1, 9.71, 9.96, 2), v2: side(2, 9.96, 9.96, 2) } }],
      },
      { v2, rec: rec({}, { units: [{ id: 139, lines: [drawn(497.54, 331.2, 568.3, 9.96, `\uff08${'\u5b57'.repeat(16)}`), last] }] }) },
    ).out
  it("the last line one character at the item's margin: covered by A1", () => {
    expect(page(drawn(485.59, 336.2, 346.2, 9.96, '\u5219'))).toEqual([['t139 theorem', false, 'A1']])
  })
  it('a last line of two characters, or one character away from the margin: worse', () => {
    expect(page(drawn(485.59, 336.2, 356.2, 9.96, '\u5219\u5b57'))).toEqual([['t139 theorem', true, null]])
    expect(page(drawn(485.59, 383.6 + 40, 433.6, 9.96, '\u5219'))).toEqual([['t139 theorem', true, null]])
  })
})

describe('O: a translated figure text touching the figure where today keeps it English', () => {
  // (2610.21312v1-zh p5 p325: Figure 2(c)'s "(isotropic)" translated at its place and size, 173 device px over the bar; today keeps
  // it the original's; the page's figure texts 190, 17 of another text)
  const v2 = { facts: { [N]: { members: [{ ord: 325, kind: 'figure', align: 'l', style: { size: 7.61 }, lines: [fact(400, 440, 705.43, 7.61)] }, { ord: 315, kind: 'figure', align: 'l', style: { size: 7.61 }, lines: [fact(300, 340, 600, 7.61)] }], ties: [] } } }
  const page = (o: { joined?: boolean; anchor?: number; other?: number } = {}) =>
    judged(
      {
        diffs: [worse('over', 'p325 figure', 0, 0, 173, [0, 173]), worse('over', 'figure texts', 0, 0, 173 + (o.other ?? 17), [0, 173 + (o.other ?? 17)])],
        units: [{ key: 'p325', kind: 'figure', part: 325, align: 'l', sides: { v2: side(1, 7.61, 7.61, 1, { anchor: { off: o.anchor ?? 0 }, align: { off: 0.03 } }) } }],
        figurePairs: o.joined ? [[325, 'f9']] : [],
      },
      { v2, rec: rec({}, { units: [{ id: 325, lines: [drawn(705.43, 400, 446, 7.61, '\uff08\u5404\u5411\u540c\u6027\uff09')] }] }, { fidelity: { over: { today: {}, v2: { 'p:325': 173, 'p:315': o.other ?? 17 } } } }) },
    ).out
  it('translated at its place and size where today keeps it, the rest of the figure texts within the floor: covered by O', () => {
    expect(page()).toEqual([
      ['p325 figure', false, 'O'],
      ['figure texts', false, 'O'],
    ])
  })
  it("today translating it too, or v2's text 3 pt off its place: worse; another text 40 px over the figure: the page's figure texts worse", () => {
    expect(page({ joined: true }).map((x) => x[1])).toEqual([true, true])
    expect(page({ anchor: 3 }).map((x) => x[1])).toEqual([true, true])
    expect(page({ other: 40 })).toEqual([
      ['figure texts', true, null],
      ['p325 figure', false, 'O'],
    ])
  })
})

describe("A2: a reference's next line set flush where the original indents it, as today's", () => {
  // (2610.10069v1-zh p27 t238, every switch on: its second line drawn at 72 on both sides where the original's starts at 83.7;
  // today's a row of crops alone, which the measure read no start of)
  const v2 = { facts: { [N]: { members: [{ ord: 238, kind: 'reference', align: 'j', style: { size: 11.96 }, lines: [fact(72, 540, 168.2, 11.96), fact(83.7, 370.1, 150.27, 11.96)] }], ties: [] } } }
  const page = (row: Line, at: number) =>
    judged(
      {
        diffs: [worse('align', 't238 reference', 'justified', null, null, [0, 11.7])],
        units: [{ key: 't238', kind: 'reference', part: 238, align: 'j', sides: { today: side(2, 11.96, 11.96, 2), v2: side(2, 11.96, 11.96, 2) } }],
      },
      {
        v2,
        rec: rec(
          { units: [{ id: 238, lines: [drawn(168.2, 72, 530, 11.96, 'x'.repeat(40)), row] }], crops: [[238, at, 143.7, at + 45, 152.7, '11', 325.5, 149.7, 370.5, 158.7, N]] },
          { units: [{ id: 238, lines: [drawn(168.2, 72, 539.77, 11.96, 'x'.repeat(40)), drawn(144.29, 72, 102.37, 11.96, 'xyz')] }] },
        ),
      },
    ).out
  const crops = { y: 144.28, x0: null, x1: null, size: 11.96, n: 0, text: '\ufffc'.repeat(9) }
  it("today's same line a row of crops alone starting where v2's starts: covered by A2", () => {
    expect(page(crops, 72)).toEqual([['t238 reference', false, 'A2']])
  })
  it("today's row of crops at the original's indent, or today's line of text: worse", () => {
    expect(page(crops, 83.7)).toEqual([['t238 reference', true, null]])
    expect(page(drawn(144.28, 72, 120, 11.96, 'xyz'), 72)).toEqual([['t238 reference', true, null]])
  })
})

describe('the rulings file', () => {
  it('states each ruling with its class, condition, verdict, date and example; one with no condition says why', () => {
    for (const r of RULINGS) {
      expect(r.id).toMatch(/^[A-Z]\d?$/)
      expect(r.title.length).toBeGreaterThan(10)
      expect(r.id === 'T2' ? r.verdict.startsWith('\u2460') : r.verdict === '\u53ef\u4ee5\u63a5\u53d7').toBe(true)
      expect(r.date).toBe('2026-11-12')
      expect(r.example.length).toBeGreaterThan(20)
      expect(r.condition === null ? r.unstated : r.condition).toBeTruthy()
      expect(r.condition === null).toBe(r.holds === null)
    }
    expect(NO_PAGE_LEFT.map((x: { id: string }) => x.id)).toEqual(['W'])
    expect(WHOLE).toEqual(['shown', 'elements', 'scripts', 'labels'])
  })
  it('names each ruling\'s pages in the sheet\'s summary, a covered page apart from a worse one', () => {
    const pages = [
      { pair: 'a-zh', page: 1, worse: 0, covered: 1, diffs: [{ flag: 'line-count', covered: 'L1' }] },
      { pair: 'b-zh', page: 2, worse: 1, covered: 1, diffs: [{ flag: 'line-count', covered: 'L1' }, { flag: 'shown', worse: true }] },
    ]
    const l1 = rulingsOf(pages).rulings.find((r: { id: string }) => r.id === 'L1')
    expect(l1.pages).toEqual(['a-zh p1', 'b-zh p2 (worse beside it)'])
    expect(l1.differences).toBe(2)
  })
  it("reads a crop's row on the baseline of the original line its source stands on, moved as the crop is", () => {
    // (a crop drawn 20 pt under its source, which stands on the original line at 400: its row at 380)
    expect(rowsOf([{ id: 1, lines: [drawn(410, 72, 300, 10, 'x')] }], [[1, 72, 377, 90, 388, 'k', 72, 397, 90, 408, N]], 1, [fact(72, 300, 400)], 10)).toEqual([410, 380])
  })
})
