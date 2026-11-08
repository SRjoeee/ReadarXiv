// @vitest-environment node
// The display gate's verdict (lab/typeset/parity/verdict.mjs, #629's review): a page is judged from what each side drew, and the
// gate passes only over the whole of what the run asked. Synthetic pages: one unit or figure text or link drawn or not.
import { describe, expect, it } from 'vitest'
// @ts-expect-error — a plain node module of the lab
import { coverageOf, measurePage, staleOf, verdictOf } from '../../lab/typeset/parity/verdict.mjs'

type Line = { y: number; x0: number; x1: number; size: number; n: number; bold: number; italic: number; word: number; letter: number; text: string }
const line = (y: number, n = 12): Line => ({ y, x0: 72, x1: 300, size: 10, n, bold: 0, italic: 0, word: 0.3, letter: 0, text: 'x'.repeat(n) })
const N = 3
/** a page record as render.mjs writes it: today's and v2's drawn units, figure texts, links */
const rec = (o: { today?: object; v2?: object; original?: number } = {}) => ({
  page: N,
  original: { links: o.original ?? 0 },
  today: { units: [], figures: [], names: [], crops: [], links: 0, linksDrawn: 0, lit: [], ...o.today },
  v2: { committed: true, units: [], crops: [], links: 0, linksDrawn: 0, lit: [], ...o.v2 },
  px: {},
})
/** v2.mjs's file of a pair: the page's members (Page) and the part's facts, the join to today's ords */
const v2Of = (o: { members?: object[]; facts?: object[]; today?: Record<number, { today: number }> } = {}) => ({
  pages: { [N]: { members: o.members ?? [], links: [] } },
  facts: { [N]: { members: o.facts ?? [], links: 0 } },
  today: o.today ?? {},
})
const measure = (v2: ReturnType<typeof v2Of>, r: ReturnType<typeof rec>) =>
  measurePage('p-zh', v2, r, { prepByOrd: new Map(), todayOf: new Map(Object.entries(v2.today).map(([k, t]) => [Number(k), t.today])), turned: new Set() })
const worse = (p: { diffs: { flag: string; worse: boolean }[] }) => p.diffs.filter((d) => d.worse).map((d) => d.flag)

describe('a page measured from what each side drew', () => {
  it('a unit today shows translated that no member of v2 is joined to is a translation missing', () => {
    const p = measure(v2Of(), rec({ today: { units: [{ id: 7, lines: [line(400)] }] } }))
    expect(worse(p)).toEqual(['shown'])
    expect(p.diffs[0].v2.value).toBe("no member of v2's part joined to it")
  })
  it("a unit v2's member leaves the original's names that member's state", () => {
    const v2 = v2Of({ members: [{ ord: 11, state: 'unfit', lines: [] }], facts: [{ ord: 11, kind: 'para', align: 'j', style: { size: 10 }, lines: [] }], today: { 11: { today: 7 } } })
    const p = measure(v2, rec({ today: { units: [{ id: 7, lines: [line(400)] }] } }))
    expect(worse(p)).toEqual(['shown'])
    expect(p.diffs[0].v2.value).toBe('unfit')
  })
  it('figure texts are counted from the groups v2 drew, not the members its Page lays', () => {
    const fig = { ord: 50, kind: 'figure', align: 'l', style: { size: 8 }, lines: [] }
    const v2 = v2Of({ members: [{ ord: 50, state: 'laid', lines: [] }], facts: [fig] })
    const today = { figures: [{ id: 'f1', lines: [line(300, 4)] }] }
    const lost = measure(v2, rec({ today }))
    expect(worse(lost)).toEqual(['figures'])
    expect(lost.measures.figures).toEqual({ today: 1, v2: 0, v2Laid: 1 })
    const drawn = measure(v2, rec({ today, v2: { units: [{ id: 50, lines: [line(300, 4)] }], lit: [50] } }))
    expect(worse(drawn)).toEqual([])
  })
  it('links are the anchors each side drew; a page today shows as arXiv\'s has the original\'s', () => {
    const lost = measure(v2Of(), rec({ original: 3, today: { links: 3, linksDrawn: 3 }, v2: { links: 3, linksDrawn: 2 } }))
    expect(worse(lost)).toEqual(['links'])
    expect(lost.measures.links).toMatchObject({ original: 3, today: 3, v2: 2, v2Laid: 3 })
    const asOriginal = measure(v2Of(), rec({ original: 3, today: { shownOriginal: true, links: 0, linksDrawn: 0 }, v2: { linksDrawn: 3 } }))
    expect(worse(asOriginal)).toEqual([])
  })
  it('a page either side did not draw is an error, not a page judged', () => {
    expect(measure(v2Of(), { ...rec(), error: 'screenshot failed' } as never).error).toBe('screenshot failed')
    expect(measure(v2Of(), rec({ today: { error: 'lay threw' } })).error).toBe("today's page not laid: lay threw")
    const { v2: _gone, ...noV2 } = rec()
    expect(measure(v2Of(), noV2 as never).error).toBe("v2's side not drawn")
  })
})

describe('the run judged whole', () => {
  const run = { id: 'r1', pairs: ['a-zh', 'b-ja'], done: true, stopped: null, missing: [] as { pair: string; why: string }[] }
  const raw = (pages: number[], expected: number[], o: object = {}) => ({ run: 'r1', v2: 'd1', expected, pages: pages.map((page) => ({ page })), ...o })
  const page = (pair: string, n: number, o: object = {}) => ({ pair, page: n, worse: 0, ...o })

  it('a raw file is measured only as this run drew it from the pages v2.mjs laid', () => {
    expect(staleOf({ ...run, missing: [{ pair: 'a-zh', why: 'no L1 bundle' }] }, 'a-zh', raw([1], [1]), 'd1')).toBe('not drawn (no L1 bundle)')
    expect(staleOf(run, 'a-zh', null, 'd1')).toBe('no raw file of this run')
    expect(staleOf(run, 'a-zh', raw([1], [1], { run: 'r0' }), 'd1')).toBe("its raw file is another run's")
    expect(staleOf(run, 'a-zh', raw([1], [1]), 'd2')).toBe("v2's pages were laid again after it was drawn")
    expect(staleOf(run, 'a-zh', raw([1], [1]), 'd1')).toBeNull()
  })
  it('nothing drawn, or no manifest, is not a pass', () => {
    expect(coverageOf(null, {})).toHaveLength(1)
    const none = coverageOf({ ...run, pairs: [] }, {})
    expect(none).toEqual(['no page measured'])
    expect(verdictOf(none, []).pass).toBe(false)
  })
  it('an asked pair not drawn, a page not drawn or failed, a drawing that did not finish: each fails the gate', () => {
    const drawn = new Map([['a-zh', raw([1, 2], [1, 2, 3])]])
    const pages = [page('a-zh', 1), page('a-zh', 2, { error: 'screenshot failed' })]
    const got = coverageOf({ ...run, done: false, stopped: 'the disk has under 12 GiB free' }, { notMeasured: new Map([['b-ja', 'not drawn (the disk has under 12 GiB free)']]), drawn, pages })
    expect(got).toEqual([
      'the drawing did not finish: the disk has under 12 GiB free',
      'a-zh p3: not drawn',
      'b-ja: not drawn (the disk has under 12 GiB free)',
      'a-zh p2: screenshot failed',
    ])
    expect(verdictOf(got, pages)).toMatchObject({ pass: false, worse: 0 })
  })
  it('the measure asked other pairs than the drawing drew', () => {
    const drawn = new Map([['a-zh', raw([1], [1])], ['b-ja', raw([1], [1])]])
    const pages = [page('a-zh', 1), page('b-ja', 1)]
    expect(coverageOf(run, { asked: ['a-zh'], drawn, pages })).toEqual(['the measure was asked a-zh, the drawing drew a-zh, b-ja'])
    expect(coverageOf(run, { asked: ['b-ja', 'a-zh'], drawn, pages })).toEqual([])
  })
  it('complete coverage passes with no page worse, and fails with one', () => {
    const drawn = new Map([['a-zh', raw([1], [1])], ['b-ja', raw([1], [1])]])
    const pages = [page('a-zh', 1), page('b-ja', 1)]
    expect(verdictOf(coverageOf(run, { drawn, pages }), pages)).toEqual({ pass: true, worse: 0, incomplete: [] })
    expect(verdictOf([], [page('a-zh', 1, { worse: 2 })])).toMatchObject({ pass: false, worse: 1 })
  })
})
