import { describe, expect, it } from 'vitest'
import { flowType } from '@/pdf-reader/engine/pipeline/typeset/flow.mjs'
import { DESIGN, type Design, designFor, heightAtSize, heightRatio, solveType, unitHeights } from '@/pdf-reader/engine/pipeline/typeset/type.mjs'

// The typesetting rule's type and flow (parked/lab/records/typesetting.md), on synthetic units: no TeX

type Type = { lead: number; track?: number; scale?: number; size?: number; h?: number }
type Unit = { i: number; lo: number; bs: number; cap: number; width: (t?: Type) => number }
const near = (a: number, b: number, eps: number) => Math.abs(a - b) <= eps
const linesOf = (w: number) => Math.max(1, w / 24 + 0.5)
/** a unit: its original lines and leading, the ruler's capacity, and its translation's width in em at a CJK type
 *  (wide characters scaled, tracked between them; the rest fixed) — what density.mjs gives */
const unit = (i: number, lo: number, cap: number, wide: number, rest = 0, bs = 12): Unit => ({ i, lo, bs, cap, width: ({ scale = 1, track = 0 } = { lead: 1 }) => wide * scale + Math.max(0, wide - 1) * track + rest })
const units = (n: number, f: (i: number) => Unit) => Array.from({ length: n }, (_, i) => f(i))
const leadsOf = (list: Unit[], design: Design, heights: Map<number, number>, options?: Parameters<typeof flowType>[3]) => flowType(list, design, heights, options).leads

describe('the type for a paper', () => {
  // Chinese about 0.74 of the original's lines: at its base leading, 1.3, a little short; German about 1.15 of them
  const zhShort = units(40, i => unit(i, 8, 24, 120, 10))
  const deLong = units(40, i => unit(i, 8, 24, 0, 215))
  const zh = solveType(zhShort, DESIGN.Hans)

  it('has CJK knobs and alphabet knobs, with ranges around the base', () => {
    expect([DESIGN.Hans.base.lead, DESIGN.Hans.lead[1], DESIGN.Jpan.base.lead, DESIGN.Latn.size[0], DESIGN.Cyrl.lead[0]]).toEqual([1.3, 1.45, 1, 0.9, 0.95])
  })
  it('gives a short CJK translation room within the ranges, its predicted height the original\'s', () => {
    expect(zh.lead > DESIGN.Hans.base.lead || (zh.track ?? 0) > 0).toBe(true)
    expect(heightRatio(zhShort, DESIGN.Hans, zh)).toBeCloseTo(1, 2)
    expect(zh.lead).toBeGreaterThanOrEqual(1.2 - 1e-9)
    expect(zh.lead).toBeLessThanOrEqual(1.45 + 1e-9)
    expect(zh.track).toBeLessThanOrEqual(0.05 + 1e-9)
    expect(zh.scale).toBeGreaterThanOrEqual(0.92 - 1e-9)
  })
  it('leaves the knobs at their ends, and the ratio short, out of reach', () => {
    const veryShort = units(40, i => unit(i, 8, 24, 80, 5))
    const sat = solveType(veryShort, DESIGN.Hans)
    expect(sat.lead).toBeCloseTo(1.45, 6)
    expect(sat.track).toBeCloseTo(0.05, 6)
    expect(heightRatio(veryShort, DESIGN.Hans, sat)).toBeLessThan(0.95)
  })
  it('sets a long alphabet translation smaller first, the leading taking the rest within its range', () => {
    const de = solveType(deLong, DESIGN.Latn)
    expect(de.size).toBeLessThan(1)
    expect(de.size).toBeGreaterThanOrEqual(0.9 - 1e-9)
    expect(de.lead).toBeGreaterThanOrEqual(0.95 - 1e-9)
    expect(de.lead).toBeLessThanOrEqual(1.1 + 1e-9)
    expect(Math.abs(heightRatio(deLong, DESIGN.Latn, de) - 1)).toBeLessThanOrEqual(0.02)
  })
  it('sets a face with fixed sizes at the size below, as the face sets it (Computer Modern at 10.95 pt)', () => {
    const grid = (lo: number, hi: number) => Array.from({ length: Math.round((hi - lo) / 0.01) + 1 }, (_, k) => Number((lo + k * 0.01).toFixed(2)))
    const cm11 = [...grid(0.9, 0.95).map(size => ({ size, h: 10 / 10.95 })), ...grid(0.96, 0.99).map(size => ({ size, h: 1 })), { size: 1, h: 1 }]
    const de = solveType(deLong, DESIGN.Latn, cm11)
    expect(de.h).toBeCloseTo(10 / 10.95, 9)
    expect(heightRatio(deLong, DESIGN.Latn, de)).toBeCloseTo(1, 2)
  })
  it('takes the smaller of two sizes that both miss: running short rather than long', () => {
    const deGap = units(40, i => unit(i, 8, 24, 0, 1.08 * 7.5 * 24))
    const gap = solveType(deGap, DESIGN.Latn, [{ size: 0.9, h: 0.9 }, { size: 1, h: 1 }])
    expect(gap.size).toBe(0.9)
    expect(heightRatio(deGap, DESIGN.Latn, gap)).toBeLessThanOrEqual(1 + 1e-9)
  })
  it('keeps the paper\'s type for a translation as long as the original', () => {
    const keep = solveType(units(40, i => unit(i, 8, 24, 0, 7.5 * 24)), DESIGN.Latn)
    expect(keep.size).toBeCloseTo(1, 1)
    expect(Math.abs(keep.lead - 1)).toBeLessThanOrEqual(0.02)
  })
  it('designs the type a strategy can set: CJK under CJKutf8 a size and a leading, as an alphabet\'s', () => {
    const xeCJK = { name: 'XeLaTeX + xeCJK', xe: true }, cjkutf8 = { name: 'pdfLaTeX + CJKutf8', xe: false }
    expect(designFor('Hans', xeCJK)).toBe(DESIGN.Hans)
    expect(designFor('Latn', { name: 'own engine', xe: false })).toBe(DESIGN.Latn)
    expect(designFor('Hans', cjkutf8)).toEqual({ cjk: false, scalable: true, base: 1.3, size: [0.92, 1], lead: [1.2, 1.45] })
    expect(designFor('Kore', cjkutf8)).toEqual({ cjk: false, scalable: true, base: 1, size: [0.92, 1], lead: [1, 1.45] })
    expect(designFor('Arab', xeCJK)).toBeNull()
  })
  it('solves CJK under CJKutf8 with its size and leading alone: no glue, no face of its own, every size the face scales to', () => {
    const cjkutf8 = designFor('Jpan', { name: 'pdfLaTeX + CJKutf8', xe: false })
    if (!cjkutf8) throw new Error('no design')
    // Japanese a tenth longer than the original at the paper's leading: smaller, its leading at the floor
    const jaLong = units(40, i => unit(i, 8, 24, 198))
    const t = solveType(jaLong, cjkutf8, [{ size: 0.9, h: 1 }, { size: 1, h: 1 }])
    expect([t.track, t.scale]).toEqual([undefined, undefined])
    expect(t.size).toBeLessThan(1)
    expect(t.size).toBeGreaterThanOrEqual(0.92 - 1e-9)
    expect(t.h).toBe(t.size)
    expect(t.lead).toBeCloseTo(1, 9)
    expect(heightRatio(jaLong, cjkutf8, t)).toBeCloseTo(1, 2)
    // Chinese short of it: the leading looser from its base, the size the paper's
    const zhShort = units(40, i => unit(i, 8, 24, 120, 10)), zh = solveType(zhShort, designFor('Hans', { name: 'pdfLaTeX + CJKutf8', xe: false }) ?? DESIGN.Latn)
    expect(zh.size).toBe(1)
    expect(zh.lead).toBeGreaterThan(1.3)
  })
  it('gives a CJK unit at a smaller face the lines its width × the face fills, each that much closer', () => {
    const wide = unit(0, 10, 30, 0, 285)
    const type = { lead: 1, track: 0, scale: 1 }
    expect(heightAtSize(wide, DESIGN.Kore, type, 0.95)).toBeCloseTo(((285 * 0.95) / 30 + 0.5) * 12 * 0.95, 9)
    expect(heightAtSize(wide, DESIGN.Kore, type, 1)).toBeCloseTo(unitHeights([wide], DESIGN.Kore, type).get(0) ?? 0, 9)
  })
})

describe('the leading along the paper', () => {
  // the first half of a German translation runs long, the second short, the whole about right
  const halves = [...units(20, i => unit(i, 8, 24, 0, 200)), ...units(20, i => unit(20 + i, 8, 24, 0, 170))]
  const type = solveType(halves, DESIGN.Latn)
  const heights = unitHeights(halves, DESIGN.Latn, type)
  const worst = (leads: Map<number, number> | null) => { let d = 0, w = 0; for (const u of halves) { d += (heights.get(u.i) ?? 0) * (leads?.get(u.i) ?? type.lead) - u.lo * u.bs; w = Math.max(w, Math.abs(d)) } return w }

  it('gives each unit its predicted lines at the type, times its size and leading one', () => {
    expect(heights.size).toBe(40)
    expect(heights.get(0)).toBeCloseTo(linesOf(200 * (type.h ?? 1)) * (type.size ?? 1) * 12, 9)
  })
  it('sets a stretch that runs long tighter and one that runs short looser, nearer the original\'s flow than one type', () => {
    const flow = leadsOf(halves, DESIGN.Latn, heights, { window: 40 })
    expect(flow.get(2)).toBeLessThan(type.lead)
    expect(flow.get(37)).toBeGreaterThan(type.lead)
    expect([...flow.values()].every(l => l >= 0.95 - 1e-9 && l <= 1.1 + 1e-9)).toBe(true)
    expect(worst(flow)).toBeLessThan(0.5 * worst(null))
    const values = [...flow.values()], span = Math.max(...values) - Math.min(...values)
    const step = Math.max(...[...Array(39).keys()].map(k => Math.abs((flow.get(k + 1) ?? 0) - (flow.get(k) ?? 0))))
    expect(step).toBeLessThanOrEqual(0.4 * span)
  })
  it('over the whole paper is one leading, the one that brings the whole to the original\'s height', () => {
    const whole = leadsOf(halves, DESIGN.Latn, heights, { window: Infinity })
    expect([...whole.values()].every(l => near(l, whole.get(0) ?? 0, 1e-12))).toBe(true)
    expect(heightRatio(halves, DESIGN.Latn, { ...type, lead: whole.get(0) ?? 0 })).toBeCloseTo(1, 2)
  })
  it('keeps CJK within its range, × the paper\'s leading', () => {
    const zhShort = units(40, i => unit(i, 8, 24, 120, 10)), zh = solveType(zhShort, DESIGN.Hans)
    const flow = leadsOf(zhShort, DESIGN.Hans, unitHeights(zhShort, DESIGN.Hans, zh), { window: 40 })
    expect([...flow.values()].every(l => l >= 1.2 - 1e-9 && l <= 1.45 + 1e-9)).toBe(true)
    expect(Math.abs((flow.get(5) ?? 0) - zh.lead)).toBeLessThanOrEqual(0.01)
  })
  it('takes back after a stretch what the floor kept it from giving, not giving it away', () => {
    // Korean sets no tighter than the paper's own leading: a first half 10 % long and a second 10 % short
    const floor = units(40, i => unit(i, 8, 24, 0))
    const fh = new Map(floor.map(u => [u.i, (u.i < 20 ? 1.1 : 0.9) * 96]))
    const leads = leadsOf(floor, DESIGN.Kore, fh, { window: 40 })
    expect(floor.reduce((t, u) => t + (fh.get(u.i) ?? 0) * (leads.get(u.i) ?? 0), 0) / (40 * 96)).toBeLessThanOrEqual(1.01)
    expect([...leads.values()].every(l => l >= 1 - 1e-9)).toBe(true)
  })
  it('with a window of 0, sets each unit at its original\'s height where the range allows', () => {
    const each = leadsOf(halves, DESIGN.Latn, heights, { window: 0, horizon: 40 })
    expect(each.get(2) ?? 0).toBeLessThan(each.get(37) ?? 0)
    expect(worst(each)).toBeLessThan(0.5 * worst(null))
  })
})

describe('the preview\'s places', () => {
  const even = units(40, i => unit(i, 8, 24, 0))
  const heights = new Map(even.map(u => [u.i, 96]))
  const preview = new Map(even.map(u => [u.i, 96]))
  const jumped = new Map(even.map(u => [u.i, u.i >= 20 ? 60 : 0]))   // the preview 60 pt late from unit 20 on

  it('takes back a jump the preview measured, after it, and most of it by the end', () => {
    expect([...leadsOf(even, DESIGN.Latn, heights, { window: 0, horizon: 40 }).values()].every(l => near(l, 1, 1e-9))).toBe(true)
    const seen = leadsOf(even, DESIGN.Latn, heights, { window: 0, horizon: 40, measured: { drift: jumped, preview } })
    expect(seen.get(10)).toBeCloseTo(1, 9)
    expect(seen.get(21)).toBeLessThan(0.99)
    expect(seen.get(21)).toBeGreaterThanOrEqual(0.95 - 1e-9)
    let left = 60
    for (const u of even) if (u.i >= 20) left += 96 * (seen.get(u.i) ?? 0) - 96
    expect(left).toBeLessThan(20)
  })
  it('leaves noise under the threshold to the heights, takes a jump past it a little before it', () => {
    const noisy = new Map(even.map(u => [u.i, u.i === 0 ? 0 : u.i % 2 ? 30 : -20]))
    expect([...leadsOf(even, DESIGN.Latn, heights, { window: 0, horizon: 40, measured: { drift: noisy, preview, snap: 60 } }).values()].every(l => near(l, 1, 1e-9))).toBe(true)
    const snapped = leadsOf(even, DESIGN.Latn, heights, { window: 0, horizon: 40, measured: { drift: jumped, preview, snap: 40 } })
    expect(snapped.get(21)).toBeLessThan(0.99)
    expect((snapped.get(18) ?? 1) < 1 - 1e-6 || (snapped.get(19) ?? 1) < 1 - 1e-6).toBe(true)
  })
  it('takes the first reading under the threshold: the front matter\'s offset (Korean 2608.21180\'s title)', () => {
    const front = leadsOf(even, DESIGN.Latn, heights, { window: 0, horizon: 40, measured: { drift: new Map([[0, -20]]), preview, snap: 60 } })
    expect(front.get(0)).toBeGreaterThan(1 + 1e-6)
  })
  it('leaves out one reading far off when the units around it read level (Korean 2608.06701)', () => {
    const spike = new Map(even.map(u => [u.i, u.i === 10 ? 225 : 0]))
    expect([...leadsOf(even, DESIGN.Latn, heights, { window: 0, horizon: 40, measured: { drift: spike, preview, snap: 40 } }).values()].every(l => near(l, 1, 1e-9))).toBe(true)
  })
  it('moves a unit\'s leading at most `rate` from the window\'s however far behind the text is', () => {
    const big = new Map(even.map(u => [u.i, u.i >= 20 ? 240 : 0]))
    expect(leadsOf(even, DESIGN.Latn, heights, { window: 0, horizon: 40, measured: { drift: big, preview } }).get(21)).toBeCloseTo(0.95, 9)
    const paced = leadsOf(even, DESIGN.Latn, heights, { window: 0, horizon: 40, rate: 0.02, measured: { drift: big, preview } })
    expect([...paced.values()].every(l => l >= 0.98 - 1e-9 && l <= 1 + 1e-9)).toBe(true)
    expect(paced.get(21)).toBeCloseTo(0.98, 9)
  })
  it('starts again after a forced break, where the preview and the final both start a page (Korean 2608.05876)', () => {
    // the preview's heights 5 pt a unit past the original's up to the break, which takes the 100 pt
    const longBefore = new Map(even.map(u => [u.i, u.i < 20 ? 101 : 96]))
    const drift = new Map(even.map(u => [u.i, u.i < 20 ? 5 * u.i : 0]))
    expect(leadsOf(even, DESIGN.Latn, longBefore, { window: 0, horizon: 40, measured: { drift, preview: longBefore, snap: 40 } }).get(22)).toBeGreaterThan(1.05)
    const anchored = leadsOf(even, DESIGN.Latn, longBefore, { window: 0, horizon: 40, measured: { drift, preview: longBefore, snap: 40, breaks: new Set([20]) } })
    expect(even.every(u => near((longBefore.get(u.i) ?? 0) * (anchored.get(u.i) ?? 0), 96, 1e-6))).toBe(true)
  })
  it('takes a forced break before a unit it does not measure at the next unit it does (Chinese 2608.09038: a \\clearpage before a paragraph holding a display)', () => {
    const longBefore = new Map(even.map(u => [u.i, u.i < 20 ? 101 : 96]))
    const drift = new Map(even.map(u => [u.i, u.i < 20 ? 5 * u.i : 0]))
    const flowed = even.filter(u => u.i !== 20)
    const at = (breaks: Set<number>) => leadsOf(flowed, DESIGN.Latn, longBefore, { window: 0, horizon: 40, measured: { drift, preview: longBefore, snap: 40, breaks } })
    expect([...at(new Set([20]))]).toEqual([...at(new Set([21]))])
    expect([...at(new Set([20]))]).not.toEqual([...at(new Set())])
    expect(flowed.every(u => near((longBefore.get(u.i) ?? 0) * (at(new Set([20])).get(u.i) ?? 0), 96, 1e-6))).toBe(true)
  })
})

describe('a stretch at the floor set at a smaller face (option A in steps)', () => {
  const ko = units(40, i => unit(i, 8, 24, 0))
  const stepped = (hs: Map<number, number>) => ({ steps: [0.975, 0.95], lines: 3, heightAt: (i: number, f: number) => (hs.get(i) ?? 0) * f * f })
  const lateAt = (hs: Map<number, number>, r: ReturnType<typeof flowType>) => ko.reduce((d, u) => d + (hs.get(u.i) ?? 0) * (r.sizes.get(u.i) ?? 1) ** 2 * (r.leads.get(u.i) ?? 0) - 96, 0)
  /** the faces: one run of units, at one face */
  const oneRun = (sizes: Map<number, number>) => { const ids = [...sizes.keys()].sort((a, b) => a - b); return ids.length > 0 && ids.every((i, k) => k === 0 || i === (ids[k - 1] ?? Number.NaN) + 1) && new Set(sizes.values()).size === 1 }
  const tail = new Map(ko.map(u => [u.i, u.i >= 25 ? 104 : 96]))
  const preBreak = new Map(ko.map(u => [u.i, u.i >= 10 && u.i < 20 ? 104 : 96]))

  it('sets nothing smaller without it: a long tail at the floor ends 120 pt late', () => {
    const r = flowType(ko, DESIGN.Kore, tail, { window: 0, horizon: 40 })
    expect(r.sizes.size).toBe(0)
    expect(lateAt(tail, r)).toBeCloseTo(120, 6)
  })
  it('sets the tail\'s last units at one face, a run to the end, and the end within a line of level', () => {
    const r = flowType(ko, DESIGN.Kore, tail, { window: 0, horizon: 40, shrink: stepped(tail) })
    expect(oneRun(r.sizes)).toBe(true)
    expect(r.sizes.has(39)).toBe(true)
    expect(Math.min(...r.sizes.keys())).toBeGreaterThanOrEqual(25)
    expect(Math.abs(lateAt(tail, r))).toBeLessThan(12)
    expect(r.trace).toHaveLength(40)
    expect(r.trace.every((t, k) => t.i === k && t.x === r.leads.get(t.i))).toBe(true)
    expect(Math.abs(r.trace[39]?.end ?? Number.NaN)).toBeLessThan(12)
  })
  it('sets nothing smaller where the end is late by less than the threshold, or the text took it back before the end', () => {
    const short = new Map(ko.map(u => [u.i, u.i >= 35 ? 100 : 96]))
    expect(flowType(ko, DESIGN.Kore, short, { window: 0, horizon: 40, shrink: stepped(short) }).sizes.size).toBe(0)
    const middle = new Map(ko.map(u => [u.i, u.i >= 10 && u.i < 20 ? 104 : u.i >= 20 ? 90 : 96]))
    expect(flowType(ko, DESIGN.Kore, middle, { window: 0, horizon: 40, shrink: stepped(middle) }).sizes.size).toBe(0)
  })
  it('takes a segment\'s lateness back before its forced break, the next segment untouched', () => {
    const drift = new Map(ko.map(u => [u.i, u.i < 20 ? Math.max(0, u.i - 10) * 8 : 0]))
    const r = flowType(ko, DESIGN.Kore, preBreak, { window: 0, horizon: 40, shrink: stepped(preBreak), measured: { drift, preview: preBreak, snap: 40, breaks: new Set([20]) } })
    expect(oneRun(r.sizes)).toBe(true)
    expect(Math.max(...r.sizes.keys())).toBe(19)
    expect(Math.min(...r.sizes.keys())).toBeGreaterThanOrEqual(10)
  })
  it('leaves a segment that started a page late, and runs no later, to the one before the break (Japanese 2608.18090)', () => {
    const drift = new Map(ko.map(u => [u.i, u.i >= 20 ? 600 : Math.max(0, u.i - 10) * 8]))
    const r = flowType(ko, DESIGN.Kore, preBreak, { window: 0, horizon: 40, shrink: stepped(preBreak), measured: { drift, preview: preBreak, snap: 40, breaks: new Set([20]) } })
    expect(r.sizes.size).toBeGreaterThan(0)
    expect(Math.max(...r.sizes.keys())).toBeLessThanOrEqual(19)
  })
  it('sets nothing smaller for a float the preview moved mid-way, level again by the end', () => {
    const flat = new Map(ko.map(u => [u.i, 96]))
    const drift = new Map(ko.map(u => [u.i, u.i >= 20 && u.i < 26 ? 200 : 0]))
    expect(flowType(ko, DESIGN.Kore, flat, { window: 0, horizon: 40, shrink: stepped(flat), measured: { drift, preview: flat, snap: 40 } }).sizes.size).toBe(0)
  })
})
