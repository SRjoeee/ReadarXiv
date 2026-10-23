import { beforeAll, describe, expect, it } from 'vitest'
import { BUILTIN_RULES, resolveRules } from '@/pdf-reader/engine/rules/layout.mjs'

// The page fill over a unit laid in runs (run.mjs fillUnitsOf, fillPage): a unit's runs are filled as units of the page and
// read by its target once, as one; they grow together, keep one tracking, and keep their text on the pages their fit set it
// (the Opus review of #454, 2026-10-24). Chinese characters 10 pt wide at size 10, ten a line of 100 pt

type L2 = typeof import('@/pdf-reader/engine/layer-proto/layer2.mjs')
type Run = typeof import('@/pdf-reader/engine/layer-proto/run.mjs')
let L2: L2
let R: Run
beforeAll(async () => {
  const g = globalThis as { OffscreenCanvas?: unknown }
  g.OffscreenCanvas ??= class { getContext() { return { font: '', measureText: (s: string) => ({ width: 50 * s.length }) } } }
  L2 = await import('@/pdf-reader/engine/layer-proto/layer2.mjs')
  R = await import('@/pdf-reader/engine/layer-proto/run.mjs')
})

const params = (to: string) => resolveRules(BUILTIN_RULES, to).params
/** a block of n lines 12 pt apart from `top` on `page`, 100 pt wide */
const block = (n = 6, page = 1, top = 500) => { const B = Array.from({ length: n }, (_, k) => top - 12 * k); return { page, rects: B.map(b => [page, 0, b - 2, 100, b + 8]), x0: 0, x1: 100, B, exact: B.map(() => true), sizes: B.map(() => 10), pitch0: 12, free: 0, indent: 0, after: 0, centred: false } }
const chars = (n: number) => Array.from({ length: n }, () => ({ s: '汉', cls: 'cjk', w100: 100, st: {} }))
const P = (o: Record<string, unknown> = {}) => ({ ...params('zh'), borrow: 0, fillLead: 1.8, adaptiveFill: { band: 0.05, track: 0, size: 1.1 }, ...o })
type Unit = { id: number; unit: { kind: string }; pages: number[]; tokens: unknown[]; blocks: ReturnType<typeof block>[]; s: number; P: Record<string, unknown>; layout: { lines: { baseline: number; page: number; from: number }[]; scale: number; state: { lead: number; scale: number; track: number } }; parent?: unknown; fillLead?: number | null; fitLines?: number; runs?: Unit[] }
const laid = (id: number, n: number, PP = P(), blocks = [block()]): Unit => {
  const p = { id, unit: { kind: 'para' }, pages: [...new Set(blocks.map(b => b.page))], tokens: chars(n), blocks, s: 10, P: { ...PP, growTo: 0 } } as unknown as Unit
  p.layout = L2.layoutUnit2(p.tokens as never, p.blocks as never, 10, p.P as never) as never
  return p
}
/** runs `rs` of one unit: the unit as its fit as one leaves it for its page's target (`lead`, `lines`) */
const unitOf = (rs: Unit[], lead: number, lines: number) => { const u = { id: rs[0]!.id, unit: { kind: 'para' }, pages: [1], refused: false, fillLead: lead, fillTop: 3, fitLines: lines, runs: rs } as unknown as Unit; for (const r of rs) r.parent = u; return u }

describe('the page fill over a unit laid in runs', () => {
  it('reads the unit once, as one: its runs do not each vote in the page target, a neighbour keeps its leading', () => {
    const n = laid(9, 20)
    n.fillLead = 1.5
    n.fitLines = 2
    // (a run of one line tells nothing, a run of two tells the original's pitch: voting a run at a time would move the target)
    const a = laid(1, 6), b = laid(1, 20)
    a.fillLead = 1.8
    a.fitLines = 1
    b.fillLead = 1
    b.fitLines = 2
    const c = laid(1, 20)
    c.fillLead = 1
    c.fitLines = 2
    const u = unitOf([a, b, c], 1.5, 5)
    const handed = R.fillUnitsOf([u, n] as never, [])
    expect(handed.units).toEqual([a, b, c, n])
    expect(handed.voters).toEqual([u, n])
    expect(R.pageTarget(handed.voters as never, [], 0.05)?.target).toBe(1.5)
    expect(R.pageTarget(handed.units as never, [], 0.05)?.target).not.toBe(1.5)
    expect(R.fillPage(handed.units as never, P() as never, () => {}, handed as never)?.target).toBe(1.5)
  })

  it("grows a unit's runs together: a run of one line grows with its unit's others where the unit has more than one", () => {
    const one = laid(1, 6), two = laid(1, 20)
    unitOf([one, two], 1.8, 3)
    R.fillPage([one, two] as never, P() as never)
    expect(one.layout.lines).toHaveLength(1)
    expect([one.layout.scale, two.layout.scale]).toEqual([1.1, 1.1])
    // (a unit of one line keeps its size, as before)
    const lone = laid(2, 6), other = laid(3, 20)
    R.fillPage([lone, other] as never, P() as never)
    expect([lone.layout.scale, other.layout.scale]).toEqual([1, 1.1])
  })

  it("keeps one tracking a paragraph: a run the fill would track further takes its unit's other runs' least", () => {
    const PT = P({ adaptiveFill: { band: 0.05, track: 0.05, size: 1 } })
    // (a run with room and a run that fills its frame: the first alone would take tracking)
    const roomy = laid(1, 20, PT), full = laid(1, 60, PT)
    const fit0 = roomy.layout.state.track
    R.fillPage([roomy, full] as never, PT as never)
    expect(roomy.layout.state.track).toBeGreaterThan(fit0)
    const roomy2 = laid(1, 20, PT), full2 = laid(1, 60, PT)
    const fitTrack = roomy2.layout.state.track
    unitOf([roomy2, full2], 1.2, 8)
    R.fillPage([roomy2, full2] as never, PT as never)
    // (the full run takes none: the roomy run neither)
    expect(roomy2.layout.state.track).toBe(fitTrack)
  })

  it('keeps a run\'s text on the pages its fit set it: a looser leading does not carry a line of page 1 over to page 2', () => {
    // (two frames of eight lines on pages 1 and 2: the fit sets six lines on page 1 and one on page 2; the fill's leading of
    // 1.5 holds five on page 1, and carried a line of page 1's text over, 2610.21884v1's unit 10 in Chinese)
    const pages = (p: Unit) => p.layout.lines.map(l => l.page).join('')
    const onFirst = (p: Unit) => p.layout.lines.filter(l => l.page === 1).length
    const alone = laid(1, 70, P(), [block(8, 1), block(8, 2)])
    expect(pages(alone)).toBe('1111112')
    R.fillPage([alone] as never, P() as never)
    expect(onFirst(alone)).toBe(5)
    // (a run is held to its fit's pages; a unit of one run is filled as before, above)
    const run = laid(1, 70, P(), [block(8, 1), block(8, 2)])
    const fitLead = run.layout.state.lead
    unitOf([run], 1.8, 7)
    R.fillPage([run] as never, P() as never)
    expect(onFirst(run)).toBe(6)
    // (still filled: its fill leading the loosest that keeps its pages (fillLeadsOf), not refused for the looser one)
    expect(run.layout.state.lead).toBeGreaterThan(fitLead)
    // (and where its fill leading was told it from outside, the fill's own tries are held too: fillPage's `free`)
    const told = laid(1, 70, P(), [block(8, 1), block(8, 2)]) as Unit & { fillTop?: number }
    unitOf([told], 1.8, 7)
    Object.assign(told, { fillLead: 1.5, fillTop: 3, fitLines: 7 })
    R.fillPage([told] as never, P() as never)
    expect(onFirst(told)).toBe(6)
  })
})
