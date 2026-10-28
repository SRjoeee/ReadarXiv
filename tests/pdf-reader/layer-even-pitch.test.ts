import { beforeAll, describe, expect, it } from 'vitest'
import { BUILTIN_RULES, resolveRules, SCRIPTS } from '@/pdf-reader/engine/rules/layout.mjs'

// One pitch inside a block at the leading of 1 (lane B's B1, the maintainer's ruling of 2026-10-29, `evenPitch` on in every
// script): a block's lines one pitch apart from its first, where they stood on the original's baselines and so inherited the
// gaps TeX opened under the original's tall lines (the block-level audit's finding 1). The translation's own tall lines open
// by TeX's rule; where TeX set the same formula in the original, by TeX's own distance for it (texRoomOf).

type L2 = typeof import('@/pdf-reader/engine/layer-proto/layer2.mjs')
let L2: L2
beforeAll(async () => {
  // a canvas whose text is 5 pt a character at 10 pt (50 px at 100 px), its ink 0.7 of the size over its baseline and 0.2 under
  const g = globalThis as { OffscreenCanvas?: unknown }
  g.OffscreenCanvas = class { getContext() { return { font: '', measureText: (s: string) => ({ width: 50 * s.length, actualBoundingBoxAscent: 70, actualBoundingBoxDescent: 20 }) } } }
  L2 = await import('@/pdf-reader/engine/layer-proto/layer2.mjs')
})

const face = { id: 'serif', family: 'F', weight: 400, style: 'normal', size: 1 }
const word = (n: number) => ({ s: 'x'.repeat(n), cls: 'latin', w100: 50 * n, st: {}, face })
const space = { space: true, w100: 25 }
/** a crop of a formula 20 pt wide, `up` over its TeX baseline and `down` under it */
const crop = (up: number, down: number) => ({ crop: { crop: [0, 100 - down, 20, 100 + up], baseline: 100 }, cw: 20, w100: 0 })
/** a block on the baselines B, 100 pt wide, at size 10, its pitch 12 (TeX's \baselineskip, the median of its gaps), its even grid
 *  `E` as blocks2 makes it: the gaps TeX's \lineskip rule set (here those wider than the pitch) closed */
const block = (B: number[]) => {
  const opened = B.slice(1).map((y, i) => (B[i] as number) - y > 12.05)
  return { page: 1, rects: B.map(b => [1, 0, b - 2, 100, b + 8]), x0: 0, x1: 100, B, ...(opened.includes(true) ? { E: L2.evenGridOf(B, opened, 12) } : {}), exact: B.map(() => true), sizes: B.map(() => 10), pitch0: 12, free: 0, indent: 0, after: 0, centred: false }
}
/** six lines 12 pt apart from 500, but for the gap of 18.5 TeX opened under the third (a tall formula of the original's) */
const OPENED = [500, 488, 476, 457.5, 445.5, 433.5]
const P = (o: object = {}) => ({ ...resolveRules(BUILTIN_RULES, 'de').params, borrow: 0, hyphen: 0, lineskip: [1, 0], ...o })
/** n lines of text, each of two words of 9 letters (92.5 pt with its space: one a line of 100) */
const lines = (n: number) => Array.from({ length: n }, (_, i) => [...(i ? [space] : []), word(9), space, word(9)]).flat()

describe('the even grid (evenGridOf)', () => {
  it("closes a gap TeX's \\lineskip rule opened under a tall line to the pitch: every line under it moves up by it", () => {
    expect(L2.evenGridOf(OPENED, [false, false, true, false, false], 12)).toEqual([500, 488, 476, 464, 452, 440])
  })
  it("keeps every other gap as the grid's: one that holds something else (a line of another block between), and the file's hundredths", () => {
    // (24: another block's line at 476 stands between; the rule sets no such gap, so blocks2 does not call it opened)
    expect(L2.evenGridOf([488, 464], [false], 12)).toEqual([488, 464])
    // (11.98 and 11.99 under a pitch of 12: the last line stays on the original's last baseline, which the block's foot is)
    expect(L2.evenGridOf([500, 488.02, 476.03], [false, false], 12)).toEqual([500, 488.02, 476.03])
    // (a gap the rule set no wider than the pitch: nothing to close)
    expect(L2.evenGridOf([500, 488, 476], [true, true], 12)).toEqual([500, 488, 476])
  })
})

describe("the gaps TeX's \\lineskip rule set, closed in blocks2's `E`", () => {
  // one block of four lines of the file, 500, 488, 469.5 and 457.5 (18.5 under the second: a formula of its own, `depth` deep,
  // over a line 7 high; its pitch, the median of its gaps, 12); \lineskip 1
  const ys = [500, 488, 469.5, 457.5]
  const rects = ys.map(y => [1, 0, y - 2, 100, y + 8])
  const info = (depth: number) => new Map(rects.map((r, i) => [`${r[0]}|${r.slice(1).join()}`, { baseline: ys[i]!, size: 10, top: ys[i]! + 7, bottom: ys[i]! - (i === 1 ? depth : 2), exact: true, file: true, j: 10 + i, frame: 0 }]))
  const even = (depth: number, skip: [number, number] | null = [1, 0]) => L2.blocks2(rects as never, [[0, 0, 612, 792]], null, info(depth) as never, null, null, skip).map(b => b.E)
  it('is a gap no wider than the two lines\' boxes and \\lineskip: 10.5 + 7 + 1 for 18.5, within the file\'s hundredths; closed in `E`', () => {
    expect(even(10.5)).toEqual([[500, 488, 476, 464]])
    expect(even(10.49)).toEqual([[500, 488, 476, 464]])
  })
  it('is not one wider than the rule sets for those lines (something else holds it), nor any where the file tells no \\lineskip: no `E`', () => {
    expect(even(5)).toEqual([undefined])
    expect(even(10.5, null)).toEqual([undefined])
    // (a block of three lines, 500, 488 and 469.5, takes the wider of its two gaps for its pitch, 18.5: nothing to close, a limit)
    expect(L2.blocks2(rects.slice(0, 3) as never, [[0, 0, 612, 792]], null, info(10.5) as never, null, null, [1, 0]).map(b => b.E)).toEqual([undefined])
  })
})

describe('a unit laid at the leading of 1', () => {
  it("stands on the original's baselines, gaps and all, where the rule is off (before the ruling)", () => {
    const l = L2.layoutUnit2(lines(6) as never, [block(OPENED)] as never, 10, P({ order: [], evenPitch: false }) as never)
    expect(l.clipped).toBe(false)
    expect(l.lines.map(x => x.baseline)).toEqual(OPENED)
  })
  it('stands one pitch apart where it is on: the room the closed gap frees stays at its foot', () => {
    const l = L2.layoutUnit2(lines(6) as never, [block(OPENED)] as never, 10, P({ order: [], evenPitch: true }) as never)
    expect(l.clipped).toBe(false)
    expect(l.lines.map(x => x.baseline)).toEqual([500, 488, 476, 464, 452, 440])
  })
  it("opens a line only where the translation's own line is tall, TeX's rule: the formula on its second line", () => {
    // the formula 6 deep on line 2, the third line's text 7 high: 13 against a pitch of 12, so the third line opens by 2
    // (6 + 7 + 1 - 12) and every line under it with it; the room the original opened under its third line is not taken
    const unit = [word(9), space, word(9), space, crop(7.5, 6), space, word(14), space, word(18), space, word(18), space, word(18)]
    const on = L2.layoutUnit2(unit as never, [block(OPENED)] as never, 10, P({ order: [], evenPitch: true }) as never)
    expect(on.lines.map(x => x.baseline)).toEqual([500, 488, 474, 462, 450])
    expect(on.opened).toBe(1)
    const off = L2.layoutUnit2(unit as never, [block(OPENED)] as never, 10, P({ order: [], evenPitch: false }) as never)
    // (off: the third line opens too, and the gap the original opened under its own third line follows on the fourth)
    expect(off.lines.map(x => x.baseline)).toEqual([500, 488, 474, 457.5, 445.5])
  })
  it('changes nothing off the leading of 1: a leading of 1.3 is one pitch apart from the first line in either case', () => {
    const at = (o: object) => L2.layoutUnit2(lines(4) as never, [block(OPENED)] as never, 10, P({ order: [], leadBase: 1.3, ...o }) as never).lines.map(x => x.baseline)
    expect(at({ evenPitch: true })).toEqual(at({ evenPitch: false }))
  })
})

// (a formula TeX set in the original, 11 deep on the block's third line (476) and 5 high, its crop on the page and across the
// block; TeX opened 18.5 under that line. The rule on the ink opens 11 + 7 + 1 = 19 under it, 0.5 more than TeX did, where its
// ink is clear at TeX's 18.5 already: 1706.03762's Spanish unit 33, 2.35 by the ink under the fraction TeX opened 2.26 under)
const texCrop = (up: number, down: number) => ({ crop: { page: 1, crop: [40, 476 - down, 60, 476 + up], baseline: 476 }, cw: 20, w100: 0 })
/** six lines: two of two 9-letter words, the formula between two 6-letter words, three more of two 9-letter words; `at` the line
 *  (0-based) the formula's line is */
const withFormula = (at: number, down = 11) => Array.from({ length: 6 }, (_, i) => [...(i ? [space] : []), ...(i === at ? [word(6), space, texCrop(5, down), space, word(6)] : [word(9), space, word(9)])]).flat()

describe("TeX's own room for a formula (texRoomOf)", () => {
  it('is the distance TeX set between the line the formula stands on and the next, or the one before', () => {
    const b = block(OPENED)
    expect(L2.texRoomOf([b] as never, texCrop(5, 11).crop, true)).toBe(18.5)
    expect(L2.texRoomOf([b] as never, texCrop(5, 11).crop, false)).toBe(12)
    // (none where no line of the blocks stands on the crop's page and baseline, or across it)
    expect(L2.texRoomOf([b] as never, { ...texCrop(5, 11).crop, page: 2 }, true)).toBe(-Infinity)
    expect(L2.texRoomOf([b] as never, { ...texCrop(5, 11).crop, baseline: 470 }, true)).toBe(-Infinity)
    expect(L2.texRoomOf([b] as never, { ...texCrop(5, 11).crop, crop: [140, 465, 160, 481] }, true)).toBe(-Infinity)
    // (the last line has no line after it)
    expect(L2.texRoomOf([b] as never, { page: 1, crop: [40, 430, 60, 440], baseline: 433.5 }, true)).toBe(-Infinity)
  })
  it("is the room of the line the formula stands on, not of another block's line on its baseline whose block it overlaps", () => {
    // (a unit's two blocks on one page with a line each at 476 (the review of #496): the first, x 0 to 150 by its overfull second
    // line, 18.5 under its 476; the second, a column beside it from 140, 12 under its own 476, where the formula stands: its
    // centre, 150.5, is on the second block's line and on none of the first's)
    const left = { page: 1, x0: 0, x1: 150, rects: [[1, 0, 498, 100, 508], [1, 0, 486, 150, 496], [1, 0, 474, 100, 484], [1, 0, 455.5, 100, 465.5]], B: [500, 488, 476, 457.5] }
    const right = { page: 1, x0: 140, x1: 240, rects: [[1, 140, 474, 240, 484], [1, 140, 462, 240, 472]], B: [476, 464] }
    const crop = { page: 1, crop: [141, 470, 160, 482], baseline: 476 }
    expect(L2.texRoomOf([left, right] as never, crop, true)).toBe(12)
    expect(L2.texRoomOf([right, left] as never, crop, true)).toBe(12)
    // (a formula on the first block's line takes that line's room)
    expect(L2.texRoomOf([left, right] as never, { ...crop, crop: [40, 470, 60, 482] }, true)).toBe(18.5)
    // (a line its rectangles cut in two on one baseline: the rectangle that holds the formula's centre)
    const split = { page: 1, x0: 0, x1: 240, rects: [[1, 0, 474, 100, 484], [1, 140, 474, 240, 484], [1, 0, 462, 240, 472]], B: [476, 476, 464] }
    expect(L2.texRoomOf([split] as never, crop, true)).toBe(12)
  })
  it("sets the formula's pair at TeX's distance where that keeps their ink clear: the unit keeps its foot at the size of 1", () => {
    const l = L2.layoutUnit2(withFormula(2) as never, [block(OPENED)] as never, 10, P({ order: [], evenPitch: true }) as never)
    expect(l.clipped).toBe(false)
    expect(l.lines.map(x => x.baseline)).toEqual(OPENED)
    expect(l.opened).toBe(1)
  })
  it('moves the room with its formula: set a line higher, TeX\'s room opens under that line, and the foot is where it was', () => {
    const l = L2.layoutUnit2(withFormula(1) as never, [block(OPENED)] as never, 10, P({ order: [], evenPitch: true }) as never)
    expect(l.clipped).toBe(false)
    expect(l.lines.map(x => x.baseline)).toEqual([500, 488, 469.5, 457.5, 445.5, 433.5])
  })
  it("opens by the rule on the ink where TeX's distance would leave the ink nearer than \\lineskiplimit: a deeper formula", () => {
    // (12 deep: 12 + 7 = 19 over TeX's 18.5, so the ink rule's 20; the unit then runs past its foot at the size of 1)
    const l = L2.layoutUnit2(withFormula(2, 12) as never, [block([...OPENED, 421.5])] as never, 10, P({ order: [], evenPitch: true }) as never)
    expect(l.lines.slice(0, 4).map(x => x.baseline)).toEqual([500, 488, 476, 456])
  })
})

describe('the rule in the rule set', () => {
  it('is on in every script of the built-in set (the ruling of 2026-10-29)', () => {
    for (const s of SCRIPTS) expect(BUILTIN_RULES.scripts[s].evenPitch, s).toBe(true)
    for (const t of ['zh', 'ja', 'ko', 'de', 'ru']) expect(resolveRules(BUILTIN_RULES, t).params.evenPitch, t).toBe(true)
  })
})
