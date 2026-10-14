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
/** a crop cut from a layout file's segment (cropOfBox: the box and the antialias margin of 0.3 pt around it), the segment's
 *  own box `up` over its TeX baseline and `down` under it */
const boxed = (up: number, down: number) => ({ crop: { crop: [-0.4, 100 - down - 0.3, 20.4, 100 + up + 0.3], baseline: 100, gap: { box: { x0: 0, x1: 20, top: 100 + up, bottom: 100 - down, baseline: 100, lines: 1 } } }, cw: 20, w100: 0 })
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
  it("reads a crop cut from a segment by the segment's box, never by the margin it is drawn with", () => {
    const line = { items: [{ t: boxed(9, 4) }] }
    expect(L2.lineExtent(line as never, 10, 1)).toMatchObject({ a: 9, d: 4 })
    expect(L2.lineExtent(line as never, 10, 0.5)).toMatchObject({ a: 4.5, d: 2 })
    // the ink 11.8 from the next line's top (4.8 deep, 7 high of a 12 pitch): clear by 0.2, under the margin's 0.3; the
    // rectangle drawn (5.1 deep) would have opened the line; the ink does not
    const unitOf = (c: object) => [c, space, word(14), space, word(18), space, word(18)]
    const ink = L2.layoutUnit2(unitOf(boxed(7.5, 4.8)) as never, [block(4)] as never, 10, P([1, 0]) as never)
    expect(ink.lines.map(x => x.baseline)).toEqual([500, 488, 476])
    expect(ink.opened).toBe(0)
    // the ink 0.1 past the next line's top opens it, by 5.1 + 7 + 1 - 12, the ink's own measure
    expect(L2.layoutUnit2(unitOf(boxed(7.5, 5.1)) as never, [block(4)] as never, 10, P([1, 0]) as never).lines.map(x => x.baseline)).toEqual([500, 486.9, 474.9])
  })
  it('opens nothing where the two fit, and never sets two lines closer than their slots', () => {
    expect(L2.layoutUnit2(unit(7.5, 3) as never, [block(4)] as never, 10, P([1, 0]) as never).lines.map(x => x.baseline)).toEqual([500, 488, 476])
    // lineskiplimit 2: a gap of 1 is under it, but depth + height + lineskip (4 + 7 + 1) is the slot's own 12
    expect(L2.layoutUnit2(unit(7.5, 4) as never, [block(4)] as never, 10, P([1, 2]) as never).lines.map(x => x.baseline)).toEqual([500, 488, 476])
    // a gap of 0 under it: 5 + 7 + 1 = 13, one more than the slot's
    expect(L2.layoutUnit2(unit(7.5, 5) as never, [block(4)] as never, 10, P([1, 2]) as never).lines.map(x => x.baseline)).toEqual([500, 487, 475])
  })
  it("opens nothing with no values, the paper's none (a layout file without them, v0 alone), and counts what it would have", () => {
    const l = L2.layoutUnit2(unit(7.5, 6) as never, [block(4)] as never, 10, P(null) as never)
    expect(l.lines.map(x => x.baseline)).toEqual([500, 488, 476])
    expect([l.opened, l.unopened]).toEqual([0, 1])
    expect([L2.layoutUnit2(unit(7.5, 6) as never, [block(4)] as never, 10, P([1, 0]) as never)].map(x => [x.opened, x.unopened])).toEqual([[1, 0]])
  })
  it("holds across a paragraph v0 split in two blocks that follow each other in the file, never across v0's own blocks", () => {
    // block 0 two lines at 500 and 488, block 1 from 476 (12 below: one paragraph's lines); the formula on 488, 6 deep
    const B = (from: number, n: number, flow?: number, after = 0) => ({ ...block(n), B: Array.from({ length: n }, (_, k) => from - 12 * k), rects: Array.from({ length: n }, (_, k) => [1, 0, from - 12 * k - 2, 100, from - 12 * k + 8]), after, ...(flow === undefined ? {} : { flow }) })
    const tokens = [word(18), space, crop(7.5, 6), space, word(14), space, word(18), space, word(18)]
    const split = L2.layoutUnit2(tokens as never, [B(500, 2, 0), B(476, 3, 0)] as never, 10, P([1, 0]) as never)
    expect(split.lines.map(x => x.baseline)).toEqual([500, 488, 474, 462])
    // (v0's own blocks, a unit the file does not hold: nothing says the line below is the next one)
    const own = L2.layoutUnit2(tokens as never, [B(500, 2), B(476, 3)] as never, 10, P([1, 0]) as never)
    expect(own.lines.map(x => x.baseline)).toEqual([500, 488, 476, 464])
    // blocks the file does not run on from one to the other are two flows
    const apart = L2.layoutUnit2(tokens as never, [B(500, 2, 0), B(476, 3, 1)] as never, 10, P([1, 0]) as never)
    expect(apart.lines.map(x => x.baseline)).toEqual([500, 488, 476, 464])
  })
  it("sets two blocks in one flow where only the unit's own lines lie between them in the file, in one frame", () => {
    // two blocks of v0 (a gap of 36 pt splits them: a paragraph's lines TeX opened, or the unit's two parts), 500, 488 | 440, 428
    const rects = [500, 488, 440, 428].map(y => [1, 0, y - 2, 100, y + 8])
    const info = (js: number[], frames = [0, 0, 0, 0]) => new Map(rects.map((r, i) => [`${r[0]}|${r.slice(1).join()}`, { baseline: (r[2] ?? 0) + 2, size: 10, exact: true, file: true, j: js[i], frame: frames[i] }]))
    const flows = (js: number[], frames?: number[]) => L2.blocks2(rects as never, [[0, 0, 612, 792]], null, info(js, frames) as never).map(b => b.flow)
    // the second block's first line the file's next after the first block's last
    expect(flows([10, 11, 12, 13])).toEqual([0, 0])
    // a line between them the unit keeps and no block holds (a superscript's row the text beside it holds: 1810.04805's page 6)
    // is its own: still TeX's paragraph; kept, in no block
    const row = [1, 90, 463, 100, 468]
    const five = [rects[0]!, rects[1]!, row, rects[2]!, rects[3]!]
    const infoFive = new Map(five.map((r, i) => [`${r[0]}|${r.slice(1).join()}`, { baseline: (r[2] ?? 0) + 2, size: 10, exact: true, file: true, j: [10, 11, 12, 13, 14][i], frame: 0 }]))
    const withRow = L2.blocks2(five as never, [[0, 0, 612, 792]], new Set([`1|${row.slice(1).join()}`]), infoFive as never)
    expect(withRow.map(b => b.rects.length)).toEqual([2, 2])
    expect(withRow.map(b => b.flow)).toEqual([0, 0])
    // another unit's lines between them (an outer list item that goes on after a nested list, in the same column and page)
    expect(flows([10, 11, 20, 21])).toEqual([0, 1])
    // the next line of the file, but in another frame (a column or a page on)
    expect(flows([10, 11, 12, 13], [0, 0, 1, 1])).toEqual([0, 1])
    // lines that are not the file's (v0's own): no flow of TeX's
    const own = new Map(rects.map((r, i) => [`${r[0]}|${r.slice(1).join()}`, { baseline: (r[2] ?? 0) + 2, size: 10, exact: false }]))
    expect(L2.blocks2(rects as never, [[0, 0, 612, 792]], null, own as never).map(b => b.flow)).toEqual([0, 1])
  })
  it("fails the state when the opened line itself is moved past its foot (`over`), as the slot drop does for the lines after it", () => {
    // two lines in two slots: the formula on the first, 6 deep, the second line's text 7 high: it opens 2 down, to 486, under
    // its block's foot (the last baseline, 488); at this state nothing is drawn clipped, and the fit's smaller state sets it
    const one = L2.layoutUnit2(unit(7.5, 6).slice(0, 5) as never, [block(2)] as never, 10, P([1, 0], { order: [] }) as never)
    expect(one.clipped).toBe(true)
    // (the line was set 2 under its foot: the state stands clipped, and a clipped layout is never drawn)
    expect(one.lines.at(-1)?.baseline).toBe(486)
    const fit = L2.layoutUnit2(unit(7.5, 6).slice(0, 5) as never, [block(2)] as never, 10, P([1, 0]) as never)
    expect(fit.clipped).toBe(false)
    expect(Math.min(...fit.lines.map(x => x.baseline))).toBeGreaterThanOrEqual(488)
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
