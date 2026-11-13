// @vitest-environment node
// The owner's rulings of 2026-11-12 as the display gate reads them (lab/typeset/parity/rulings.mjs): each class he accepted is a
// condition the gate measures on the page. For each ruling a page inside its class (worse by its measure, now covered by the
// ruling) and one just outside it (still worse). Synthetic pages, each the geometry of the example he saw.
import { describe, expect, it } from 'vitest'
// @ts-expect-error — a plain node module of the lab
import { recount } from '../../lab/typeset/parity/verdict.mjs'
// @ts-expect-error — a plain node module of the lab
import { cutBeforeBoundary, NO_PAGE_LEFT, RULINGS, rowsOf, rulingsOf, rulingsPass, WHOLE } from '../../lab/typeset/parity/rulings.mjs'

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
type Ctx = { rec: object; v2: object; laid?: object; unsqueezed?: object | null; todayCut?: ((key: string) => object | null) | null; todayWhy?: ((key: string) => string | null) | null }
/** the pass over one page: its diffs as they come out (each worse or covered, by which ruling) */
const judged = (p: { diffs: Diff[]; units?: object[]; figurePairs?: [number, string][]; pastRoom?: object }, c: Ctx) => {
  const page = { pair: 'p-zh', page: N, worse: 0, units: [], figurePairs: [], ...p }
  rulingsPass([page], { recOf: () => c.rec, v2: c.v2, laid: c.laid ?? {}, unsqueezed: c.unsqueezed ?? null, todayCut: c.todayCut ?? null, todayWhy: c.todayWhy ?? null }, recount)
  return { page, out: page.diffs.map((d) => [d.unit, d.worse, d.covered ?? null]) }
}
const rec = (today: object = {}, v2: object = {}, px: object = {}) => ({ page: N, today: { units: [], crops: [], ...today }, v2: { units: [], crops: [], ...v2 }, px })
/** a unit's lines, top first, `k` of them from baseline `top` at pitch `pitch` */
const paragraph = (k: number, top: number, pitch: number, size: number, x0 = 312, x1 = 563) => Array.from({ length: k }, (_, i) => drawn(top - i * pitch, x0, x1, size, '\u5b57'.repeat(20)))
const side = (lines: number, size: number, osize: number, olines: number, more: object = {}) => ({ lines, size, osize, olines, ...more })

describe("TRS and Fm: the page fill's evening (his rules of 2026-11-12, 17:25), read from what the lay states", () => {
  // (a tight paragraph the page's fill evened: v2's Page member states it, `evened`: the knobs taken, its line count on the page
  // before them, and for the foot the depth its state allows past TeX's text block bottom)
  const ol = Array.from({ length: 6 }, (_, i) => fact(312, 563, 700 - i * 12, 10))
  const v2Of = (evened: object | null) => ({
    facts: { [N]: { members: [{ ord: 40, kind: 'para', align: 'j', style: { size: 10 }, lines: ol }], ties: [] } },
    pages: { [N]: { members: [{ ord: 40, state: 'laid', lines: [], ...(evened ? { evened, fit: { size: 10, lead: 1.3, track: 0, borrowed: 99, ...('over' in evened ? { over: (evened as { over: number }).over } : {}) } } : {}) }] } },
  })
  const page = (diff: Diff, v: { size: number; lines: number; block?: object[] }, evened: object | null, more: Diff[] = []) => {
    const { page: p } = judged(
      { diffs: [{ ...diff }, ...more], units: [{ key: 't40', kind: 'para', part: 40, align: 'j', sides: { today: side(5, 10, 10, 6), v2: side(v.lines, v.size, 10, 6, v.block ? { block: v.block } : {}) } }] },
      { v2: v2Of(evened), rec: rec() },
    )
    const d = (p.diffs as (Diff & { coveredSays?: string })[]).find((x) => x.flag === diff.flag)
    return [d?.worse, d?.covered ?? null, d?.coveredSays ?? null]
  }
  const size = worse('size', 't40 para', 10, 10, 9.75, [0, 0.025])
  const count = worse('line-count', 't40 para', 6, 5, 4, [1, 2])
  it('a unit the lay states evened by size, one fit step under the original: its size covered by TRS', () => {
    expect(page(size, { size: 9.75, lines: 4 }, { by: ['track', 'size'], lines: 5 })).toEqual([false, 'TRS', 'evened by track + size; 5 lines on this page before'])
  })
  it('its line count a line fewer than today, where the knobs took it from today\'s count: covered by TRS', () => {
    expect(page(count, { size: 9.75, lines: 4 }, { by: ['track', 'size'], lines: 5 })).toEqual([false, 'TRS', 'evened by track + size; 5 lines on this page before'])
    expect(page(count, { size: 10, lines: 4 }, { by: ['track'], lines: 5 })).toEqual([false, 'TRS', 'evened by track; 5 lines on this page before'])
  })
  it('one step small with no evening stated, evened by tracking alone yet one step small, a count the knobs do not explain, or not whole: worse', () => {
    expect(page(size, { size: 9.75, lines: 4 }, null)).toEqual([true, null, null])
    expect(page(size, { size: 9.75, lines: 4 }, { by: ['track'], lines: 5 })).toEqual([true, null, null])
    // (two lines fewer than today where the knobs saved one: v2 set 4 before them, today 5, v2 3)
    expect(page(worse('line-count', 't40 para', 6, 5, 3, [1, 3]), { size: 10, lines: 3 }, { by: ['track'], lines: 4 })).toEqual([true, null, null])
    expect(page(size, { size: 9.75, lines: 4 }, { by: ['size'], lines: 5 }, [worse('elements', 't40 para', 0, null, 'element 2: drawn as nothing where TeX set ink')])).toEqual([true, null, null])
    // (two steps under the original, evened by size: the fill takes one step, never two)
    expect(page(worse('size', 't40 para', 10, 10, 9.5, [0, 0.05]), { size: 9.5, lines: 4 }, { by: ['track', 'size'], lines: 5 })).toEqual([true, null, null])
  })
  const block = worse('block', 't40 para', 0, 0, 1)
  it("a line past TeX's text block bottom by no more than the foot's stated depth, TeX's separation to the next ink kept: covered by Fm", () => {
    expect(page(block, { size: 10, lines: 6, block: [{ below: 3.55, toInk: 14, sep: 12 }] }, { by: ['room', 'foot'], lines: 6, over: 3.55 })).toEqual([
      false,
      'Fm',
      "3.55 pt under TeX's text block bottom (the lay's depth 3.55), 14 over the next ink (TeX's separation 12)",
    ])
  })
  it("a line past the bottom with no foot stated, deeper than its stated depth, or nearer the next ink than TeX's separation: worse", () => {
    expect(page(block, { size: 10, lines: 6, block: [{ below: 3.55, toInk: 14, sep: 12 }] }, { by: ['room'], lines: 6 })).toEqual([true, null, null])
    // (a depth the lay states for the borrow (fit.over, 1.2 pt, the fit's bound 1.5), the unit evened by tracking and a size step,
    // not by the foot: a line 3.55 pt under the bottom is neither the borrow's nor the foot's)
    expect(page(block, { size: 10, lines: 6, block: [{ below: 3.55, toInk: 14, sep: 12 }] }, { by: ['track', 'size'], lines: 6, over: 1.2 })).toEqual([true, null, null])
    expect(page(block, { size: 10, lines: 6, block: [{ below: 3.7, toInk: 14, sep: 12 }] }, { by: ['foot'], lines: 6, over: 3.55 })).toEqual([true, null, null])
    expect(page(block, { size: 10, lines: 6, block: [{ below: 3.55, toInk: 10, sep: 12 }] }, { by: ['foot'], lines: 6, over: 3.55 })).toEqual([true, null, null])
  })
})

describe("TRS through a size tie (PDF-READER §18.64): a member laid at its tie's one size, the step its tie-mate's evening took", () => {
  // (2608.25210v2-zh p11: t211 and t212 one paragraph of TeX's (parts 199 and 200), both at 8.74 where the original sets 8.97: 200
  // evened by a size step, 199 laid at the tie's size; the measure reads the tie's size as one difference, `tie t211, t212`)
  const ol = (n: number, top: number) => Array.from({ length: n }, (_, i) => fact(312, 563, top - i * 11, 8.97))
  const v2Of = (m199: object, m200: object) => ({
    facts: {
      [N]: {
        members: [
          { ord: 199, kind: 'para', align: 'j', style: { size: 8.97 }, lines: ol(2, 500) },
          { ord: 200, kind: 'para', align: 'j', style: { size: 8.97 }, lines: ol(5, 470) },
        ],
        ties: [[199, 200]],
      },
    },
    pages: { [N]: { members: [{ ord: 199, state: 'laid', lines: [], ...m199 }, { ord: 200, state: 'laid', lines: [], ...m200 }] } },
  })
  const tie = { tie: { scale: 0.975, by: 200 } }
  const step = { ...tie, evened: { by: ['track', 'size'], lines: 5 } }
  const page = (diff: Diff, m199: object, m200: object, size200 = 8.75) => {
    const { page: p } = judged(
      {
        diffs: [{ ...diff }],
        units: [
          { key: 't211', kind: 'para', part: 199, align: 'j', sides: { today: side(2, 8.97, 8.97, 2), v2: side(2, 8.75, 8.97, 2) } },
          { key: 't212', kind: 'para', part: 200, align: 'j', sides: { today: side(5, 8.97, 8.97, 5), v2: side(4, size200, 8.97, 5) } },
        ],
      },
      { v2: v2Of(m199, m200), rec: rec() },
    )
    const d = (p.diffs as (Diff & { coveredSays?: string })[]).find((x) => x.flag === diff.flag)
    return [d?.worse, d?.covered ?? null, d?.coveredSays ?? null]
  }
  const tied = worse('size', 'tie t211, t212', 1, 1, 0.97, [0, 0.03])
  const own = worse('size', 't211 para', 8.97, 8.97, 8.75, [0, 0.22])
  it("the tie's size, each member stating the tie by the one whose evening took the step: covered by TRS", () => {
    expect(page(tied, tie, step)).toEqual([false, 'TRS', 'its size tie at the step of its member 200, evened by track + size; 5 lines on this page before'])
  })
  it('a member stating the tie, its own size one step under: covered by TRS through the member that took the step', () => {
    expect(page(own, tie, step)).toEqual([false, 'TRS', 'its size tie at the step of its member 200, evened by track + size; 5 lines on this page before'])
  })
  it('a member stating no tie, a member that took the step stating no size, or that member two steps small: worse', () => {
    expect(page(tied, {}, step)).toEqual([true, null, null])
    expect(page(tied, tie, { ...tie, evened: { by: ['track'], lines: 5 } })).toEqual([true, null, null])
    expect(page(own, tie, step, 8.52)).toEqual([true, null, null])
  })
})

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
  it("a count read over the pages a unit spans (verdict.mjs linesPass) is no count on the page: L1's condition is stated on the page", () => {
    const { out } = judged(
      {
        diffs: [{ ...worse('line-count', 't7 para', 13, 10, 9, [3, 4]), pages: [N, N + 1] } as Diff],
        units: [{ key: 't7', kind: 'para', part: 7, align: 'j', sides: { today: side(10, 10.16, 9.96, 13), v2: side(9, 9.96, 9.96, 13) } }],
      },
      { v2, rec: rec({ units: [{ id: 7, lines: paragraph(10, 404.77, 15.3, 10.16) }] }, { units: [{ id: 7, lines: paragraph(9, 404.77, 17.21, 9.96) }] }) },
    )
    expect(out).toEqual([['t7 para', true, null]])
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

describe("L1R: a paragraph a line shorter than today's, the page's fill spreading it into TeX's room (L1 and TRS composed)", () => {
  // (2610.21312v1-zh p2 t17: the original's 11 lines from 703.23, 11.95 apart; today 10 at 10.16 pt, 14.82 apart, its last at
  // 569.82; v2 9 at the original's 9.96, its fit's 9, evened by TeX's room alone: 17.81 apart, its last at 560.73, 9.09 pt under
  // today's, past half a line)
  const ol = Array.from({ length: 11 }, (_, i) => fact(312, 563, 703.23 - i * 11.95, 9.96))
  const v2Of = (evened: object | null) => ({
    facts: { [N]: { members: [{ ord: 17, kind: 'para', align: 'j', style: { size: 9.96 }, lines: ol }], ties: [] } },
    pages: { [N]: { members: [{ ord: 17, state: 'laid', lines: [], fit: { size: 9.96, lead: 1.49, track: -0.03, borrowed: 99 }, ...(evened ? { evened } : {}) }] } },
  })
  const page = (o: { evened?: object | null; vLines?: number; vSize?: number; past?: boolean; more?: Diff[] } = {}) => {
    const vl = o.vLines ?? 9,
      vs = o.vSize ?? 9.96
    const { page: p } = judged(
      {
        diffs: [worse('line-count', 't17 para', 11, 10, vl, [1, 11 - vl]), ...(o.more ?? [])],
        units: [{ key: 't17', kind: 'para', part: 17, align: 'j', sides: { today: side(10, 10.16, 9.96, 11), v2: side(vl, vs, 9.96, 11) } }],
        ...(o.past ? { pastRoom: { today: [], v2: ['t17'] } } : {}),
      },
      {
        v2: v2Of(o.evened === undefined ? { by: ['room'], lines: 9 } : o.evened),
        rec: rec({ units: [{ id: 17, lines: paragraph(10, 703.23, 14.823, 10.16) }] }, { units: [{ id: 17, lines: paragraph(vl, 703.23, 17.8125, vs) }] }),
      },
    )
    const d = (p.diffs as Diff[]).find((x) => x.flag === 'line-count')
    return [d?.worse, d?.covered ?? null]
  }
  it("a line fewer at the original's size, its fit's count, evened by TeX's room alone, its lines inside TeX's room: covered by L1R", () => {
    expect(page()).toEqual([false, 'L1R'])
  })
  it("no evening stated, evened by more than the room, a count the knobs moved, a line past TeX's room, smaller, or not whole: worse", () => {
    expect(page({ evened: null })).toEqual([true, null])
    expect(page({ evened: { by: ['track', 'room'], lines: 9 } })).toEqual([true, null])
    // (two lines fewer, or the knobs' count: TRS's to judge, L1R's never)
    expect(page({ vLines: 8 })).toEqual([true, null])
    expect(page({ past: true })).toEqual([true, null])
    expect(page({ vSize: 9.71 })).toEqual([true, null])
    expect(page({ more: [worse('elements', 't17 para', 0, null, 'element 2: drawn as nothing where TeX set ink')] })).toEqual([true, null])
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

describe("S2: a table cell's text smaller than today's, kept to its cell's room", () => {
  // (2608.04322v1-zh p10 t256: a centred header; its room [251.88, 286.53] (its advances widened half way to the glyphs beside it,
  // PDF-READER §18.13); v2 at 6.10 pt inside it, where today keeps 6.97 and runs 9.99 pt past it)
  const v2 = { facts: { [N]: { members: [{ ord: 256, kind: 'cell', align: 'c', style: { size: 6.97 }, lines: [fact(255, 283, 404.04, 6.97)] }], ties: [] } } }
  const page = (o: { vFrame?: number; tFrame?: number; x0?: number; x1?: number }) => {
    const { page: p } = judged(
      {
        diffs: [worse('size', 't256 cell', 6.97, 6.97, 6.1, [0, 0.12])],
        units: [{ key: 't256', kind: 'cell', part: 256, align: 'c', room: [251.88, 286.53], sides: { today: side(1, 6.97, 6.97, 1, { frame: o.tFrame ?? 9.99 }), v2: side(1, 6.1, 6.97, 1, { frame: o.vFrame ?? 0 }) } }],
      },
      { v2, rec: rec({}, { units: [{ id: 256, lines: [drawn(404.04, o.x0 ?? 252.2, o.x1 ?? 286.2, 6.1, 'Avg. HS')] }] }) },
    )
    return p.diffs.map((d) => [d.worse, d.covered ?? null])
  }
  it("v2 smaller, inside the cell's room where today runs past it, at the largest step its text fits: covered by S2", () => {
    // (its 34 pt line one step larger, at 6.27 pt, is 35 wide on its middle 269.2: 251.7 to 286.7, past the room)
    expect(page({})).toEqual([[false, 'S2']])
  })
  it('v2 shrunk more than the room asks (one step larger still fits), past the room itself, or today inside it too: worse', () => {
    expect(page({ x0: 260, x1: 278 })).toEqual([[true, null]])
    expect(page({ vFrame: 2.67 })).toEqual([[true, null]])
    expect(page({ tFrame: 0 })).toEqual([[true, null]])
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

describe("S4: a theorem a step under the original's size, or within a step of today's", () => {
  // (2610.40645v1-ja p22 t174, his example: v2 at 10.64 pt, one step (2.5 %) under the original's 10.91; today at 10.98, above the
  // original by its misread, 1.26 steps over v2. Its p33 t283: v2 at 10.36, two steps under the original, today at 10.53, 0.62 of a
  // step over v2. A step: SIZE_STEP of the original's size, 0.2727 pt)
  const v2 = { facts: { [N]: { members: [{ ord: 174, kind: 'theorem', align: 'j', style: { size: 10.91 }, lines: [fact(72, 540, 108.16, 10.91)] }], ties: [] } } }
  const page = (t: number, v: number, kind = 'theorem', more: Diff[] = []) => {
    const { page: p } = judged(
      { diffs: [worse('size', `t174 ${kind}`, 10.91, t, v, [Math.abs(1 - t / 10.91), Math.abs(1 - v / 10.91)]), ...more], units: [{ key: 't174', kind, part: 174, sides: { today: side(1, t, 10.91, 2), v2: side(1, v, 10.91, 2) } }] },
      { v2, rec: rec() },
    )
    const d = (p.diffs as (Diff & { coveredSays?: string })[]).find((x) => x.flag === 'size')
    return [d?.worse, d?.covered ?? null, d?.coveredSays ?? null]
  }
  it("one step under the original's size, the unit whole: covered by S4, today's size and the steps reported", () => {
    expect(page(10.98, 10.64)).toEqual([false, 'S4', "one step under the original's: today 10.98 pt (1.006 of the original's), v2 1.25 of a step under it"])
  })
  it("two steps under the original's but within a step of today's (2610.40645 p33): covered by S4", () => {
    expect(page(10.53, 10.36)).toEqual([false, 'S4', "within a step of today's: today 10.53 pt (0.965 of the original's), v2 0.62 of a step under it"])
  })
  it("more than a step under today's and not one step under the original's, a paragraph, or the unit not whole: worse", () => {
    // (10.70 against 10.36: 1.25 steps under today's; 10.36 two steps under the original's)
    expect(page(10.7, 10.36)).toEqual([true, null, null])
    // (today on the original's, v2 two steps under it)
    expect(page(10.91, 10.36)).toEqual([true, null, null])
    expect(page(10.98, 10.64, 'para')).toEqual([true, null, null])
    expect(page(10.53, 10.36, 'para')).toEqual([true, null, null])
    expect(page(10.98, 10.64, 'theorem', [worse('scripts', 't174 theorem', 2, 0, 2)])).toEqual([true, null, null])
    expect(page(10.53, 10.36, 'theorem', [worse('scripts', 't174 theorem', 2, 0, 2)])).toEqual([true, null, null])
  })
})

describe("L3: a proof one line longer than today's, in the room under it", () => {
  // (2610.40645v1-ja p12 t80: TeX's and today's 4 lines from 405.35, today at 10.57 pt; v2 5 at the original's 10.91 in the room
  // under it (the block measure: no line past TeX's room); TeX's end box at 532.12-539.4 on the last line. Its p30 t253: today at
  // 10.85, 0.55 % under the original's, within the size floor)
  const ol = (measure: number) => [405.35, 391.8, 376.66, 361.21].map((y) => [N, 0, 72, 540, y, y + 8.73, y - 2.18, 72, measure, 0, 10.91])
  const v2Of = (measure: number) => ({ facts: { [N]: { members: [{ ord: 80, kind: 'theorem', align: 'j', style: { size: 10.91 }, lines: ol(measure) }], ties: [] } } })
  const page = (o: { tSize?: number; vSize?: number; vLines?: number; past?: boolean; kind?: string; measure?: number; more?: Diff[] } = {}) => {
    const vl = o.vLines ?? 5,
      ts = o.tSize ?? 10.57,
      vs = o.vSize ?? 10.91,
      kind = o.kind ?? 'theorem'
    const { page: p } = judged(
      {
        diffs: [worse('line-count', `t80 ${kind}`, 4, 4, vl, [0, vl - 4]), ...(o.more ?? [])],
        units: [{ key: 't80', kind, part: 80, align: 'j', sides: { today: side(4, ts, 10.91, 4), v2: side(vl, vs, 10.91, 4) } }],
        ...(o.past ? { pastRoom: { today: [], v2: ['t80'] } } : {}),
      },
      {
        v2: v2Of(o.measure ?? 563),
        rec: rec(
          { units: [{ id: 80, lines: [...paragraph(3, 405.35, 14.6, ts, 72, 542), drawn(361.52, 72, 541.33, ts, 'x'.repeat(30))] }] },
          { units: [{ id: 80, lines: paragraph(vl, 405.35, 14.6, vs, 72, 542) }], crops: [[80, 531.72, 347.09, 539.8, 355.6, '-2', 531.72, 360.63, 539.8, 369.14, N]] },
        ),
      },
    )
    const d = (p.diffs as (Diff & { coveredSays?: string })[]).find((x) => x.flag === 'line-count')
    return [d?.worse, d?.covered ?? null, d?.coveredSays ?? null]
  }
  it('one line more than today, at the original size in the room the borrow keeps: covered by L3, what today does there reported', () => {
    expect(page()).toEqual([false, 'L3', "today 10.57 pt (0.969 of the original's); today's last line ends at 541.33, past TeX's end box (532.12-539.4): drawn over it"])
  })
  it("today's size not asked: today within the size floor of the original's (2610.40645 p30, 10.85) is covered too", () => {
    expect(page({ tSize: 10.85 })).toEqual([false, 'L3', "today 10.85 pt (0.995 of the original's); today's last line ends at 541.33, past TeX's end box (532.12-539.4): drawn over it"])
  })
  it("today's line past TeX's measure is reported beside", () => {
    // (TeX's measure ending at 540: today's lines end at 542, 2 pt past it)
    expect(page({ tSize: 10.85, measure: 540 })[2]).toBe(
      "today 10.85 pt (0.995 of the original's); today's line at 405.35 ends at 542, 2 pt past TeX's measure (540); today's last line ends at 541.33, past TeX's end box (532.12-539.4): drawn over it",
    )
  })
  it("a line past TeX's room, two lines more, v2 under the original's size, a paragraph, or the unit not whole: worse", () => {
    expect(page({ past: true })).toEqual([true, null, null])
    expect(page({ vLines: 6 })).toEqual([true, null, null])
    expect(page({ vSize: 10.64 })).toEqual([true, null, null])
    expect(page({ kind: 'para' })).toEqual([true, null, null])
    expect(page({ tSize: 10.85, more: [worse('elements', 't80 theorem', 0, null, 'element 2: drawn as nothing where TeX set ink')] })).toEqual([true, null, null])
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

describe("T1: a line of an algorithm's pseudocode kept as the original (his ruling 5 of 2026-11-08, stated by the prepare)", () => {
  // (2608.25210v2-zh p8 t164, v2's ord 152: today translates the line, v2 leaves it the original's; the run's dump states it
  // `keptBy: 'pseudocode'` (lane keep-reasons), v2.mjs's `pseudocode`)
  const page = (o: { pseudocode?: number[]; member?: object; drawn?: boolean; today?: string } = {}) => {
    const { page: p } = judged(
      {
        diffs: [worse('shown', 't164 para', null, o.today ?? 'translated', 'none', [null, null])],
        units: [{ key: 't164', kind: 'para', part: 152, align: 'l', sides: { today: side(1, 5.98, 5.98, 1) } }],
      },
      {
        v2: { facts: { [N]: { members: [], ties: [] } }, pages: { [N]: { members: [{ ord: 152, state: 'none', off: 0, lines: [], ...(o.member ?? {}) }] } }, ...(o.pseudocode ? { pseudocode: o.pseudocode } : {}) },
        rec: rec({}, o.drawn ? { units: [{ id: 152, lines: [drawn(449.48, 100, 140, 5.98, '\u6587\u5b57')] }] } : {}),
      },
    )
    const d = (p.diffs as (Diff & { coveredSays?: string })[])[0]!
    return [d.worse, d.covered ?? null]
  }
  it('stated kept as pseudocode, drawn as the original where today translates it: covered by T1', () => {
    expect(page({ pseudocode: [152] })).toEqual([false, 'T1'])
  })
  it('no statement (a dump before lane keep-reasons, or a unit kept for no stated reason), another member stated, or v2 drawing it: worse', () => {
    expect(page()).toEqual([true, null])
    expect(page({ pseudocode: [144] })).toEqual([true, null])
    expect(page({ pseudocode: [152], drawn: true })).toEqual([true, null])
    expect(page({ pseudocode: [152], member: { state: 'laid', lines: [[449.48, 100, 140, []]] } })).toEqual([true, null])
    expect(page({ pseudocode: [152], member: { off: 1 } })).toEqual([true, null])
  })
})

describe("AN: a note of the author block follows the block's option (the owner, 2026-11-13)", () => {
  // (1706.03762v7-zh p1: today translates the \thanks of \author{…}, v2 leaves it the original's with the names off; the part
  // states the member `of: 'author'`, v2.mjs's facts carry it)
  const page = (o: { fact?: object; member?: object } = {}) => {
    const { page: p } = judged(
      {
        diffs: [worse('shown', 't2 footnote', null, 'translated', 'none', [null, null])],
        units: [{ key: 't2', kind: 'footnote', part: 2, align: 'j', sides: { today: side(1, 8, 8, 1) } }],
      },
      {
        v2: { facts: { [N]: { members: [{ ord: 2, kind: 'footnote', ...(o.fact ?? { of: 'author' }) }], ties: [] } }, pages: { [N]: { members: [{ ord: 2, state: 'left', off: 0, lines: [], ...(o.member ?? {}) }] } } },
        rec: rec(),
      },
    )
    const d = (p.diffs as Diff[])[0]!
    return [d.worse, d.covered ?? null]
  }
  it('left by the options, the part stating it a note of the block or an ink unit of the names: covered by AN', () => {
    expect(page()).toEqual([false, 'AN'])
    expect(page({ fact: { kind: 'inknames' } })).toEqual([false, 'AN'])
  })
  it('no such statement, or v2 not leaving it (laid, or the original for another reason): worse', () => {
    expect(page({ fact: {} })).toEqual([true, null])
    expect(page({ member: { state: 'none' } })).toEqual([true, null])
    expect(page({ member: { state: 'laid', lines: [[100, 72, 300, []]] } })).toEqual([true, null])
  })
})

describe("CT: which of a table's cells is language is decided from the source and the table's structure (the owner, 2026-11-13)", () => {
  // (2611.03953v2-zh p7, Table 2's first column: today keeps MedQA (t107) by its name rule and "Avg. Recovery" (t111) by its
  // group's decision; v2 lays "Avg. Recovery" (its block under its own rule) and, here, MedQA. t110 a cell today draws and v2
  // keeps: R1 (its prepare `keptBy: 'words'`), R2 (`paperNames`) or R4 (`namesBlock`))
  type O = { why?: Record<string, string>; member?: (ord: number) => object; kind?: string; v2?: object }
  const ctx = (o: O) => ({
    v2: {
      facts: { [N]: { members: [107, 110, 111].map((ord) => ({ ord, kind: o.kind ?? 'cell' })), ties: [] } },
      pages: { [N]: { members: [107, 110, 111].map((ord) => ({ ord, state: ord === 110 ? 'kept' : 'laid', off: 0, lines: ord === 110 ? [] : [[600 - ord, 72, 120, []]], ...(o.member?.(ord) ?? {}) })) } },
      ...(o.v2 ?? { words: [110] }),
    },
    rec: rec(),
    todayWhy: (key: string) => (o.why ?? { t107: 'kept', t111: 'row: kept' })[key] ?? null,
  })
  const units = [107, 110, 111].map((o) => ({ key: `t${o}`, kind: 'cell', part: o, align: 'l', sides: { today: side(1, 8, 8, 1) } }))
  const one = (d: Diff, o: O = {}) => {
    const { page: p } = judged({ diffs: [d], units }, ctx(o))
    const x = (p.diffs as (Diff & { coveredSays?: string })[])[0]!
    return [x.worse, x.covered ?? null, x.coveredSays ?? null]
  }
  const size = (unit: string, o: O = {}) => one(worse('size', `${unit} cell`, 8, 8, 7.2, [0, 0.1]), o)
  const shown = (o: O = {}) => one(worse('shown', 't110 cell', null, 'translated', 'none', [null, null]), o)
  const column = (o: O & { today?: string[]; v2Original?: string[] } = {}) =>
    one({ ...worse('groups', 'group 2:c0', 'whole', 'original', 'mixed'), cells: ['t107', 't110', 't111'], asOriginal: { today: o.today ?? ['t107', 't110', 't111'], v2: o.v2Original ?? ['t107', 't110'] } } as Diff, o)
  it("(a) a cell today keeps by its name rule or its group's decision and v2 lays: every difference of it covered", () => {
    expect(size('t107')).toEqual([false, 'CT', "the cell kept by today's name rule, laid by v2"])
    expect(size('t111')).toEqual([false, 'CT', "the cell kept by today's group decision, laid by v2"])
    expect(one(worse('shown', 't111 cell', null, 'none', 'translated', [null, null]))).toEqual([false, 'CT', "the cell kept by today's group decision, laid by v2"])
  })
  it('(b) a cell today draws and v2 keeps as written by R1, R2 or its block (R4): covered', () => {
    expect(shown()).toEqual([false, 'CT', 'the cell laid by today, kept by v2 (R1: no ordinary word)'])
    expect(shown({ v2: { paperNames: [110] } })).toEqual([false, 'CT', "the cell laid by today, kept by v2 (R2: the paper's own names)"])
    expect(shown({ v2: { namesBlock: [110] } })).toEqual([false, 'CT', "the cell laid by today, kept by v2 (R4: a names block of the paper's tables)"])
  })
  it('(c) a cell today withholds with its group on two pages and v2 lays: covered', () => {
    expect(size('t107', { why: { t107: 'group: on two pages' } })).toEqual([false, 'CT', 'the cell withheld by today with its group on two pages, laid by v2'])
    expect(column({ why: { t111: 'group: on two pages' } })).toEqual([false, 'CT', 'its cells t111 withheld by today with its group on two pages, laid by v2'])
    expect(size('t107', { why: { t107: 'group: on two pages' }, member: (ord) => (ord === 107 ? { state: 'unfit', lines: [] } : {}) })).toEqual([true, null, null])
  })
  it('a column the two draw otherwise only by such cells, either way: covered', () => {
    expect(column()).toEqual([false, 'CT', "its cells t111 kept by today's group decision, laid by v2"])
    expect(column({ today: ['t107', 't111'], v2Original: ['t107', 't110'] })).toEqual([false, 'CT', "its cells t110, t111 laid by today, kept by v2 (R1: no ordinary word); kept by today's group decision, laid by v2"])
  })
  it('today leaving it for another reason, v2 keeping it for another (one pitch, a pseudocode, a decorated word) or not at all, a unit no cell, a moved cell no such: worse', () => {
    expect(size('t107', { why: { t107: 'unfit' } })).toEqual([true, null, null])
    expect(size('t107', { member: (ord) => (ord === 107 ? { state: 'unfit', lines: [] } : {}) })).toEqual([true, null, null])
    expect(shown({ why: { t110: 'unfit' } })).toEqual([true, null, null])
    expect(shown({ v2: { pitch: [110] } })).toEqual([true, null, null])
    // (kept with no rule of the prepare's stated)
    expect(shown({ v2: {} })).toEqual([true, null, null])
    // (a line of an algorithm's pseudocode is T1's, never CT's)
    expect(shown({ v2: { pseudocode: [110] } })[1]).toBe('T1')
    // (a cell held whole for a decorated word is T5's, never CT's)
    expect(shown({ v2: { decorated: [110] } })[1]).toBe('T5')
    expect(shown({ member: (ord) => (ord === 110 ? { state: 'unfit' } : {}) })).toEqual([true, null, null])
    expect(size('t107', { kind: 'para' })).toEqual([true, null, null])
    expect(shown({ kind: 'para' })).toEqual([true, null, null])
    expect(column({ v2Original: ['t107', 't111'] })).toEqual([true, null, null])
  })
})

describe('CU: a cell that cannot be drawn stays the original by itself; today kept the whole group for it (the coordinator, 2026-11-13)', () => {
  // (2602.23285v2-ja p19, Table 7's column: Method (t170) and two cells of latent-ODE (t173, t174) whose reply does not fit them;
  // today's settle withheld the column whole, v2 lays Method and leaves the two the original's, each `unfit`)
  type O = { why?: Record<string, string>; member?: (ord: number) => object; today?: string[]; v2?: string[]; units?: number[]; words?: number[]; namesBlock?: number[]; pitch?: number[] }
  const ords = [170, 173, 174]
  const ctx = (o: O) => ({
    v2: {
      ...(o.words ? { words: o.words } : {}),
      ...(o.namesBlock ? { namesBlock: o.namesBlock } : {}),
      ...(o.pitch ? { pitch: o.pitch } : {}),
      today: Object.fromEntries(ords.map((ord) => [ord, { today: ord }])),
      facts: { [N]: { members: ords.map((ord) => ({ ord, kind: 'cell' })), ties: [] } },
      pages: {
        [N]: {
          members: ords.map((ord) => ({
            ord,
            ...(ord === 170 ? { state: 'laid', off: 1, lines: [[460, 330, 358, []]] } : { state: 'unfit', off: 0, lines: [] }),
            ...(o.member?.(ord) ?? {}),
          })),
        },
      },
    },
    rec: rec(),
    todayWhy: (key: string) => (o.why ?? { t170: 'group: a cell unfit', t173: 'group: a cell unfit', t174: 'group: a cell unfit' })[key] ?? null,
  })
  const unitsOf = (os: number[]) => os.map((o) => ({ key: `t${o}`, kind: 'cell', part: o, align: 'l', sides: { today: side(1, 9, 9, 1) } }))
  const column = (o: O = {}) => {
    const d = { ...worse('groups', 'group 7:c1', 'whole', 'original', 'mixed'), cells: ['t170', 't173', 't174'], asOriginal: { today: o.today ?? ['t170', 't173', 't174'], v2: o.v2 ?? ['t173', 't174'] } } as Diff
    const { page: p } = judged({ diffs: [d], units: unitsOf(o.units ?? ords) }, ctx(o))
    const x = (p.diffs as (Diff & { coveredSays?: string })[])[0]!
    return [x.worse, x.covered ?? null, x.coveredSays ?? null]
  }
  it("a group today withheld for a cell it could not draw, v2 leaving that cell the original's and laying the others: covered by CU", () => {
    expect(column()).toEqual([false, 'CU', "its cells t173, t174 the original's by themselves (unfit), t170 laid; today withheld the group for them"])
    expect(column({ why: { t170: 'group: a cell not drawn', t173: 'unfit', t174: 'group: a cell not drawn' } })[1]).toBe('CU')
    // (a cell neither side draws has no unit on the page: v2's ord read from its join to today's)
    expect(column({ units: [170] })[1]).toBe('CU')
  })
  it("a cell v2 leaves the original's kept as written (R1, R2 or its block), the others laid: covered by CU (2602.23285v2-ja p19's latent-ODE)", () => {
    const kept = (ord: number) => (ord === 170 ? {} : { state: 'kept' })
    expect(column({ member: kept, words: [173, 174] })).toEqual([false, 'CU', "its cells t173, t174 the original's by themselves (kept), t170 laid; today withheld the group for them"])
    expect(column({ member: kept, namesBlock: [173, 174] })[1]).toBe('CU')
    // (kept with no rule stated: not this rule's)
    expect(column({ member: kept })).toEqual([true, null, null])
    // (kept for another reason of the prepare's, one pitch: not this rule's)
    expect(column({ member: kept, pitch: [173] })).toEqual([true, null, null])
  })
  it("not a cell v2 leaves the original's that today draws translated: worse", () => {
    expect(column({ today: ['t173', 't174'], v2: ['t170', 't173', 't174'] })).toEqual([true, null, null])
    expect(column({ today: ['t173', 't174'] })).toEqual([true, null, null])
  })
  it('not a group today held for another reason (on two pages, CT\'s; a spanning cell, for which v2 holds the group too)', () => {
    // (a group today withheld for its two pages, which v2 lays like any other: CT's (c), never CU's)
    expect(column({ why: { t170: 'group: on two pages', t173: 'group: on two pages', t174: 'group: on two pages' } })[1]).toBe('CT')
    expect(column({ member: (ord) => (ord === 170 ? { state: 'cells', off: 0, lines: [] } : {}) })).toEqual([true, null, null])
    expect(column({ member: (ord) => (ord === 173 ? { state: 'cells' } : {}) })).toEqual([true, null, null])
  })
  it('not a cell v2 lays past the block or leaves for no failure of its own (no row): worse', () => {
    expect(column({ member: (ord) => (ord === 170 ? { fit: { size: 9, lead: 1.2, over: 3.5 } } : {}) })).toEqual([true, null, null])
    expect(column({ member: (ord) => (ord === 174 ? { state: 'none' } : {}) })).toEqual([true, null, null])
  })
})

describe('T4: figure texts held whole as the original for a decorated word, counted fewer than today (his answer to W11 (a))', () => {
  // (2608.06701v1-zh p1: today draws 45 figure texts translated, v2 24; v2's prepare holds 15 figure members whole for a decorated
  // word in their label (the dump's `keptBy: 'decorated'`), in which 21 of today's drawn texts stand)
  const held = Array.from({ length: 15 }, (_, i) => 300 + i)
  const page = (o: { decorated?: number; ords?: number[]; laid?: (ord: number) => object; drawn?: number; v2?: number; more?: object } = {}) => {
    const ords = o.ords ?? held
    const members = ords.map((ord) => ({ ord, state: 'unwrapped', off: 0, lines: [], ...(o.laid?.(ord) ?? {}) }))
    const figures = { today: 45, v2: o.v2 ?? 24, v2Laid: 30, ...(ords.length ? { decorated: o.decorated ?? 21, decoratedOrds: ords } : {}), ...(o.more ?? {}) }
    const { page: p } = judged(
      { diffs: [{ ...worse('figures', null as unknown as string, null, 45, o.v2 ?? 24), off: null } as Diff], measures: { figures } } as never,
      {
        v2: { facts: { [N]: { members: [], ties: [] } }, pages: { [N]: { members } } },
        rec: rec({}, o.drawn === undefined ? {} : { units: [{ id: o.drawn, lines: [drawn(500, 100, 140, 5, '\u6587\u5b57')] }] }),
      },
    )
    const d = (p.diffs as (Diff & { coveredSays?: string })[])[0]!
    return [d.worse, d.covered ?? null, d.coveredSays ?? null]
  }
  it('fewer by no more than the texts standing in the held members, each drawn as the original: covered by T4, the count reported', () => {
    expect(page()).toEqual([false, 'T4', "today 45, v2 24: 21 of today's texts stand in the 15 held for a decorated word, drawn as the original"])
    // (with the measure's own set-asides: 2 kept by a mark, 1 no row serves, 18 in the held members)
    expect(page({ decorated: 18, more: { pitch: 2, unmeasured: 1 } })).toEqual([
      false,
      'T4',
      "today 45, v2 24: 18 of today's texts stand in the 15 held for a decorated word, drawn as the original; 2 kept by a mark; 1 no row serves",
    ])
  })
  it('fewer than the held members explain, one of them drawn or laid or a group of it off, or no statement: worse', () => {
    // (a figure text v2 leaves the original's with no statement: 3 more than the held members hold)
    expect(page({ decorated: 18 })).toEqual([true, null, null])
    expect(page({ drawn: 303 })).toEqual([true, null, null])
    expect(page({ laid: (ord) => (ord === 305 ? { state: 'laid', lines: [[500, 100, 140, []]] } : {}) })).toEqual([true, null, null])
    expect(page({ laid: (ord) => (ord === 305 ? { off: 1 } : {}) })).toEqual([true, null, null])
    expect(page({ ords: [] })).toEqual([true, null, null])
  })
})

describe("CT (d): figure texts kept as written (R1, R2), counted fewer than today (the owner's direction, 2026-11-13)", () => {
  // (2608.06701v1-zh p1: today 45 figure texts drawn translated, v2 23; 21 of today's texts stand in the 15 members held for a
  // decorated word (T4's), 1 more in a member R1 keeps; here 3 members kept as written, 2 of today's texts in them)
  const written = [400, 401, 402]
  const page = (o: { asWritten?: number; ords?: number[]; v2?: number; laid?: (ord: number) => object; decorated?: number } = {}) => {
    const ords = o.ords ?? written
    const members = ords.map((ord) => ({ ord, state: 'kept', off: 0, lines: [], ...(o.laid?.(ord) ?? {}) }))
    const figures = { today: 45, v2: o.v2 ?? 23, v2Laid: 30, ...(o.decorated ? { decorated: o.decorated, decoratedOrds: [] } : {}), ...(ords.length ? { asWritten: o.asWritten ?? 2, asWrittenOrds: ords } : {}) }
    const { page: p } = judged({ diffs: [{ ...worse('figures', null as unknown as string, null, 45, o.v2 ?? 23), off: null } as Diff], measures: { figures } } as never, {
      v2: { facts: { [N]: { members: [], ties: [] } }, pages: { [N]: { members } } },
      rec: rec(),
    })
    const d = (p.diffs as (Diff & { coveredSays?: string })[])[0]!
    return [d.worse, d.covered ?? null, d.coveredSays ?? null]
  }
  it('fewer by no more than the texts in the members kept as written and those held for a decorated word: covered by CT', () => {
    expect(page({ decorated: 20 })).toEqual([false, 'CT', "today 45, v2 23: 2 of today's texts stand in the 3 figure members kept as written (R1, R2), 20 in those held for a decorated word, drawn as the original"])
    expect(page({ v2: 43 })[1]).toBe('CT')
  })
  it('fewer than they explain, one of them laid or a group of it off, or none kept as written: worse', () => {
    expect(page({ v2: 42 })).toEqual([true, null, null])
    expect(page({ v2: 42, laid: (ord) => (ord === 401 ? { state: 'laid', lines: [[500, 100, 140, []]] } : {}) })).toEqual([true, null, null])
    expect(page({ v2: 43, laid: (ord) => (ord === 401 ? { off: 1 } : {}) })).toEqual([true, null, null])
    expect(page({ ords: [], v2: 44 })).toEqual([true, null, null])
  })
})

describe('T5: a cell or a figure label held whole as the original for a decorated word, where today translates it (his answer to W11 (a))', () => {
  // (2111.09276v1-zh p4, a table's body: cells each holding a decorated word, held whole as the original by v2 (the dump's
  // `keptBy: 'decorated'`, v2.mjs's `decorated`), translated by today; two of its columns drawn mixed by them where today translates
  // them whole. Three cells here: 28 and 30 held, 29 translated by both)
  type O = { decorated?: number[]; member?: (ord: number) => object; drawn?: number }
  const ctx = (o: O) => ({
    v2: {
      facts: { [N]: { members: [], ties: [] } },
      pages: { [N]: { members: [28, 29, 30].map((ord) => ({ ord, ...(ord === 29 ? { state: 'laid', off: 0, lines: [[690, 300, 330, []]] } : { state: 'unwrapped', off: 0, lines: [] }), ...(o.member?.(ord) ?? {}) })) } },
      ...(o.decorated ? { decorated: o.decorated } : {}),
    },
    rec: rec({}, { units: [{ id: 29, lines: [drawn(690, 300, 330, 8.19, '\u6587\u5b57')] }, ...(o.drawn === undefined ? [] : [{ id: o.drawn, lines: [drawn(690, 200, 230, 8.19, '\u6587\u5b57')] }])] }),
  })
  const units = [28, 29, 30].map((o) => ({ key: `t${o}`, kind: 'cell', part: o, align: 'c', sides: { today: side(1, 8.19, 8.19, 1) } }))
  const one = (d: Diff, o: O) => {
    const { page: p } = judged({ diffs: [d], units }, ctx(o))
    const x = (p.diffs as (Diff & { coveredSays?: string })[])[0]!
    return [x.worse, x.covered ?? null]
  }
  const shown = (o: O = {}) => one(worse('shown', 't28 cell', null, 'translated', 'unwrapped', [null, null]), o)
  /** the column's difference as fidelity.mjs writes it: its cells, and those each side draws as the original */
  const column = (o: O & { today?: string; asOriginal?: string[] | null } = {}) =>
    one({ ...worse('groups', 'group 1:c0', 'whole', o.today ?? 'target', 'mixed'), cells: ['t28', 't29', 't30'], ...(o.asOriginal === null ? {} : { asOriginal: { today: o.today === 'original' ? ['t28', 't29', 't30'] : [], v2: o.asOriginal ?? ['t28', 't30'] } }) } as Diff, o)
  it('stated held for a decorated word, drawn as the original where today translates it: covered by T5', () => {
    expect(shown({ decorated: [28, 30] })).toEqual([false, 'T5'])
  })
  it('no statement, another member stated, or v2 drawing it, laying it or turning a group of it off: worse', () => {
    expect(shown()).toEqual([true, null])
    expect(shown({ decorated: [30] })).toEqual([true, null])
    expect(shown({ decorated: [28, 30], drawn: 28 })).toEqual([true, null])
    expect(shown({ decorated: [28, 30], member: (ord) => (ord === 28 ? { state: 'laid', lines: [[690, 200, 230, []]] } : {}) })).toEqual([true, null])
    expect(shown({ decorated: [28, 30], member: (ord) => (ord === 28 ? { off: 1 } : {}) })).toEqual([true, null])
  })
  it('a group today translates whole that v2 draws mixed only by cells so held, each drawn as the original: covered by T5', () => {
    expect(column({ decorated: [28, 30] })).toEqual([false, 'T5'])
  })
  it('a cell v2 leaves the original\'s with no statement, one held cell drawn, a group today keeps whole, or no cells stated: worse', () => {
    expect(column({ decorated: [28] })).toEqual([true, null])
    expect(column({ decorated: [28, 30], drawn: 30 })).toEqual([true, null])
    expect(column({ decorated: [28, 30], today: 'original' })).toEqual([true, null])
    expect(column({ decorated: [28, 30], asOriginal: null })).toEqual([true, null])
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

describe('WB: no word is cut by a boundary between runs (the coordinator\'s ruling of 2026-11-13), read from today\'s dumps', () => {
  // (today's two dumps of a unit, as baseline/reader and baseline/tap hold them: the reader dump's drawn lines with their text,
  // today's copy writing a space after a Latin line's last word unless the breaker hyphenated it; the tap's X.cut slot, its lines
  // [page, baseline, x0, x1, mode, block, items] and its blocks' `after`. The example: 2608.16117v1-de t28, whose line before
  // display (33) today ends "Periodizitätsbezie-" (p10); the same paper's t35 carries the fact too (p14, "erhal-") and reads
  // nothing worse, its v2 lay no other than today's in size and line count)
  const laid = [
    [N, 500, 72, 300, 'just', 0, 5],
    [N, 488, 72, 300, 'just', 1, 5],
    [N, 476, 72, 200, 'last', 1, 3],
  ]
  const tap = (after: number[]) => [{ by: 'X.cut', round: 1, value: { layoutLines: laid, walkedBlocks: after.map((a) => ({ after: a })) } }]
  const reader = (end: string, y = 500) => [
    { page: N, x0: 72, x1: 300, baseline: y, text: `abc abcd${end}` },
    { page: N, x0: 72, x1: 300, baseline: 488, text: 'efgh ijk lmn ' },
    { page: N, x0: 72, x1: 200, baseline: 476, text: 'opq rst ' },
  ]
  it('reads the fact where the line before a kept region ends in the breaker\'s hyphen, joined by page and baseline as the harness pairs them', () => {
    expect(cutBeforeBoundary(reader('-'), tap([0, 1]))).toEqual({ page: N, baseline: 500, text: 'abc abcd-' })
    expect(cutBeforeBoundary(reader('-', 500.04), tap([0, 1]))).toEqual({ page: N, baseline: 500.04, text: 'abc abcd-' })
  })
  it('reads none for a hard hyphen there (a space after it in today\'s copy), a hyphen on a line inside a run, or a line the harness would not pair', () => {
    expect(cutBeforeBoundary(reader('- '), tap([0, 1]))).toBeNull()
    expect(cutBeforeBoundary(reader('-'), tap([0, 0]))).toBeNull()
    expect(cutBeforeBoundary(reader('-', 500.06), tap([0, 1]))).toBeNull()
    expect(cutBeforeBoundary(undefined, tap([0, 1]))).toBeNull()
  })
  // (the page: v2 a step smaller than today and two lines fewer, the unit whole)
  const v2 = { facts: { [N]: { members: [], ties: [] } }, pages: { [N]: { members: [] } } }
  const unit = { key: 't28', kind: 'para', part: 28, align: 'j', sides: { today: side(17, 10.46, 11.96, 22), v2: side(15, 10.16, 11.96, 22) } }
  const diffs = () => [worse('size', 't28 para', 11.96, 10.46, 10.16, [0.125, 0.15]), worse('line-count', 't28 para', 22, 17, 15, [5, 7])]
  const cutOf = (fact: object | null) => (key: string) => (key === 't28' ? fact : null)
  it("a unit today reached its size and line count by such a cut: both covered by WB, today's cut reported", () => {
    const { out, page } = judged({ diffs: diffs(), units: [unit] }, { v2, rec: rec(), todayCut: cutOf(cutBeforeBoundary(reader('-'), tap([0, 1]))) })
    expect(out).toEqual([
      ['t28 para', false, 'WB'],
      ['t28 para', false, 'WB'],
    ])
    expect((page.diffs[0] as Diff & { coveredSays?: string }).coveredSays).toBe(`today ends its line before a boundary between runs on p${N} at 500 in the breaker's hyphen ("…abc abcd-")`)
  })
  it('the same unit without the fact in today\'s dumps, with none stated, or not whole: worse', () => {
    expect(judged({ diffs: diffs(), units: [unit] }, { v2, rec: rec(), todayCut: cutOf(cutBeforeBoundary(reader('- '), tap([0, 1]))) }).out).toEqual([
      ['t28 para', true, null],
      ['t28 para', true, null],
    ])
    expect(judged({ diffs: diffs(), units: [unit] }, { v2, rec: rec() }).out).toEqual([
      ['t28 para', true, null],
      ['t28 para', true, null],
    ])
    const fact = cutOf(cutBeforeBoundary(reader('-'), tap([0, 1])))
    expect(judged({ diffs: [...diffs(), worse('elements', 't28 para', 0, null, 'element 2: drawn as nothing where TeX set ink')], units: [unit] }, { v2, rec: rec(), todayCut: fact }).out.slice(0, 2)).toEqual([
      ['t28 para', true, null],
      ['t28 para', true, null],
    ])
  })
})

describe('the rulings file', () => {
  it('states each ruling with its class, condition, verdict, date and example; one with no condition says why', () => {
    for (const r of RULINGS) {
      expect(r.id).toMatch(/^[A-Z][A-Za-z0-9]{0,2}$/)
      expect(r.title.length).toBeGreaterThan(10)
      // (his verdicts: accepted, taken, option 1 (T2), agreed with the recommendation (T4); T1 his ruling of 2026-11-08 as the
      // record states it, relayed in English)
      // (WB the coordinator's ruling of 2026-11-13 on the owner's report of the day before, the law it rests on built in B.break;
      // AN the owner's ruling of 2026-11-13 on the author block's notes, built in lane f2-author; CT his choice of 2026-11-13 on a
      // table's cells, built in lane cells-like-body; CU the coordinator's ruling (c) of 2026-11-13 under it, the same lane)
      expect(r.id === 'T2' ? r.verdict.startsWith('\u2460') : r.id === 'T1' ? r.verdict === 'pseudocode kept' : r.id === 'WB' || r.id === 'CU' ? r.verdict === "the coordinator's ruling" : r.id === 'AN' || r.id === 'CT' ? r.verdict === "the owner's ruling" : ['\u53ef\u4ee5\u63a5\u53d7', '\u91c7\u7528', '\u540c\u610f\u4f60\u7684\u5efa\u8bae'].includes(r.verdict)).toBe(true)
      expect(r.date).toBe(r.id === 'T1' ? '2026-11-08' : r.id === 'WB' || r.id === 'AN' || r.id === 'CT' || r.id === 'CU' ? '2026-11-13' : '2026-11-12')
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
