import { beforeAll, describe, expect, it } from 'vitest'
import { BUILTIN_RULES, resolveRules } from '@/pdf-reader/engine/rules/layout.mjs'

// A line opens by TeX's own rule (the math placement round, part C): where a laid line comes nearer the one before it
// than the paper's \lineskiplimit, its top to that line's foot, the two baselines are set the depth and height plus
// \lineskip apart, as TeX sets them. A line's extent is its drawn text's ink (the measure that gives its width) and its
// crops' over and under their TeX baselines. The layer gate measures what it draws (cropTextOverlap); these are the rule's.

type L2 = typeof import('@/pdf-reader/engine/layer-proto/layer2.mjs')
let L2: L2
beforeAll(async () => {
  // a canvas whose text is 5 pt a character at 10 pt (50 px at 100 px), its ink 0.7 of the size over its baseline and
  // 0.2 under
  const g = globalThis as { OffscreenCanvas?: unknown }
  g.OffscreenCanvas = class { getContext() { return { font: '', measureText: (s: string) => ({ width: 50 * s.length, actualBoundingBoxAscent: 70, actualBoundingBoxDescent: 20 }) } } }
  L2 = await import('@/pdf-reader/engine/layer-proto/layer2.mjs')
})

const face = { id: 'serif', family: 'F', weight: 400, style: 'normal', size: 1 }
const word = (n: number) => ({ s: 'x'.repeat(n), cls: 'latin', w100: 50 * n, st: {}, face })
const space = { space: true, w100: 25 }
/** a crop of a formula 20 pt wide, `up` over its TeX baseline and `down` under it */
const crop = (up: number, down: number) => ({ crop: { crop: [0, 100 - down, 20, 100 + up], baseline: 100 }, cw: 20, w100: 0 })
/** one block of lines 12 pt apart from 500, 100 pt wide, at size 10 */
const block = (n: number) => { const B = Array.from({ length: n }, (_, k) => 500 - 12 * k); return { page: 1, rects: B.map(b => [1, 0, b - 2, 100, b + 8]), x0: 0, x1: 100, B, exact: B.map(() => true), sizes: B.map(() => 10), pitch0: 12, free: 0, indent: 0, after: 0, centred: false } }
const P = (lineskip: [number, number] | null, o: object = {}) => ({ ...resolveRules(BUILTIN_RULES, 'de').params, borrow: 0, hyphen: 0, lineskip, ...o })
/** a formula of `up` and `down` first, then two lines of text */
const unit = (up: number, down: number) => [crop(up, down), space, word(14), space, word(18), space, word(18)]

describe("a laid line's extent", () => {
  it("is its text's ink and its crops' over and under their TeX baselines, a superscript raised as it is drawn", () => {
    const line = { items: [{ t: word(3) }, { t: crop(9, 4) }] }
    expect(L2.lineExtent(line as never, 10, 1)).toEqual({ a: 9, d: 4, text: { a: 7, d: 2 } })
    // (at a layout's scale, the crop as it is drawn; text by the size it is drawn at)
    expect(L2.lineExtent(line as never, 10, 0.5)).toMatchObject({ a: 7, d: 2 })
    // a superscript at 0.62 of the size, 0.36 em up: 3.6 + 0.62 × 7 over, nothing under (its foot is above the baseline)
    const sup = L2.lineExtent({ items: [{ t: { ...word(1), sup: true } }] } as never, 10, 1)
    expect(sup.a).toBeCloseTo(3.6 + 0.62 * 7, 6)
    expect(sup.d).toBe(0)
  })
})

describe("a line opens by TeX's rule", () => {
  it('sets a line whose top comes within lineskiplimit of a crop hanging over it depth + height + lineskip under it', () => {
    // the formula 6 deep, the next line's text 7 high: 13 against a pitch of 12; with \lineskip 1, 14 apart
    const l = L2.layoutUnit2(unit(7.5, 6) as never, [block(4)] as never, 10, P([1, 0]) as never)
    expect(l.clipped).toBe(false)
    expect(l.lines.map(x => x.baseline)).toEqual([500, 486, 474])
    expect(l.lines.map(x => x.opened ?? 0)).toEqual([0, 2, 0])
  })
  it('opens nothing where the two fit, and never sets two lines closer than their slots', () => {
    expect(L2.layoutUnit2(unit(7.5, 3) as never, [block(4)] as never, 10, P([1, 0]) as never).lines.map(x => x.baseline)).toEqual([500, 488, 476])
    // lineskiplimit 2: a gap of 1 is under it, but depth + height + lineskip (4 + 7 + 1) is the slot's own 12
    expect(L2.layoutUnit2(unit(7.5, 4) as never, [block(4)] as never, 10, P([1, 2]) as never).lines.map(x => x.baseline)).toEqual([500, 488, 476])
    // a gap of 0 under it: 5 + 7 + 1 = 13, one more than the slot's
    expect(L2.layoutUnit2(unit(7.5, 5) as never, [block(4)] as never, 10, P([1, 2]) as never).lines.map(x => x.baseline)).toEqual([500, 487, 475])
  })
  it("opens nothing with no values, the paper's none (a layout file without them, v0 alone)", () => {
    expect(L2.layoutUnit2(unit(7.5, 6) as never, [block(4)] as never, 10, P(null) as never).lines.map(x => x.baseline)).toEqual([500, 488, 476])
  })
  it("drops the block's slots its lines are moved past the foot of, so that the fit takes its next state, never runs past", () => {
    // three lines in three slots: the third, moved 2 down, is past the block's foot (476): this state does not set it
    const one = L2.layoutUnit2(unit(7.5, 6) as never, [block(3)] as never, 10, P([1, 0], { order: [] }) as never)
    expect(one.clipped).toBe(true)
    expect(Math.min(...one.lines.map(x => x.baseline))).toBeGreaterThanOrEqual(476)
    // with the fit's states, a smaller size sets it whole within its three lines
    const fit = L2.layoutUnit2(unit(7.5, 6) as never, [block(3)] as never, 10, P([1, 0]) as never)
    expect(fit.clipped).toBe(false)
    expect(fit.scale).toBeLessThan(1)
    expect(Math.min(...fit.lines.map(x => x.baseline))).toBeGreaterThanOrEqual(476)
  })
})
