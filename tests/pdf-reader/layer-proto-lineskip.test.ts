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
  it('never sets a line nearer than its slot where the limit is over the skip: the rule only opens', () => {
    // \lineskip -1, \lineskiplimit 2: a clearance of 0 (5 deep, 7 high, 12 apart) is under the limit, and TeX would set the
    // two 5 + 7 - 1 = 11 apart, and every line after them nearer too; the slots stay, and the line with them
    const l = L2.layoutUnit2(unit(7.5, 5) as never, [block(4)] as never, 10, P([-1, 2], { order: [] }) as never)
    expect(l.clipped).toBe(false)
    expect(l.lines.map(x => x.baseline)).toEqual([500, 488, 476])
    expect([l.opened, ...l.lines.map(x => x.opened ?? 0)]).toEqual([0, 0, 0, 0])
    // five lines of text 12 apart, 7 high and 2 deep, \lineskip 1 and \lineskiplimit 4: each pair clear by 3, under the
    // limit, which TeX would set 10 apart. Moved up alone, every other line stood 10 and 14 from its neighbours; on its
    // slots, the paragraph keeps one pitch
    const text = [word(18), space, word(18), space, word(18), space, word(18), space, word(18)]
    expect(L2.layoutUnit2(text as never, [block(5)] as never, 10, P([1, 4], { order: [] }) as never).lines.map(x => x.baseline)).toEqual([500, 488, 476, 464, 452])
    // a \lineskiplimit of \maxdimen (\offinterlineskip at the body's start, as the file writes it): every pair under it;
    // moved up, each line touched the one above (500, 491, 482, …) and the unit ended a line short
    expect(L2.layoutUnit2(text as never, [block(5)] as never, 10, P([0, 16322.79], { order: [] }) as never).lines.map(x => x.baseline)).toEqual([500, 488, 476, 464, 452])
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
  it("lets a block's line go on into the room of its flow's next block only where the gap is TeX's own for a tall line, the file's line boxes and \\lineskip", () => {
    // two blocks of one paragraph, 500, 488 | 464, 452 (a gap of 24 where the pitch is 12); \lineskip 1
    const ys = [500, 488, 464, 452]
    const rects = ys.map(y => [1, 0, y - 2, 100, y + 8])
    const lines = (depth: number, height: number) => new Map(rects.map((r, i) => [`${r[0]}|${r.slice(1).join()}`, { baseline: ys[i]!, size: 10, top: ys[i]! + (i === 2 ? height : 7), bottom: ys[i]! - (i === 1 ? depth : 2), exact: true, file: true, j: 10 + i, frame: 0 }]))
    const through = (info: Map<string, object>, skip: [number, number] | null = [1, 0]) => L2.blocks2(rects as never, [[0, 0, 612, 792]], null, info as never, null, null, skip)[0]?.through
    // the last line 12.5 deep (a formula), the next 10.5 high: 12.5 + 10.5 + 1 = 24, the gap
    expect(through(lines(12.5, 10.5))).toBe(true)
    // a shallower last line, or a lower next one: the gap is more than TeX's rule gives these two lines
    expect(through(lines(8, 10.5))).toBe(false)
    expect(through(lines(12.5, 6))).toBe(false)
    // within the hundredth the file is written in, still TeX's; 0.1 short of it is not
    expect(through(lines(12.49, 10.5))).toBe(true)
    expect(through(lines(12.4, 10.5))).toBe(false)
    // with no \lineskip values (a file that has none), no line opens, and no room is gone into
    expect(through(lines(12.5, 10.5), null)).toBe(false)
    // lines the file gives no boxes for: none
    expect(through(new Map([...lines(12.5, 10.5)].map(([k, v]) => [k, { ...v, top: undefined, bottom: undefined }])))).toBe(false)
    // 1810.04805's page 6, unit 81 (ko): the row j10 of a script inside the last line (it splits the blocks), the last line
    // 9.64 deep (the formula), the next 7.45 high, \lineskip 1: 9.64 + 7.45 + 1 = 18.09 for a gap of 18.02
    const a = [445.61, 431.06, 413.04, 399.49]
    const real = a.map(y => [1, 0, y - 2.35, 100, y + 7.45])
    const script = [1, 90, 438.17 - 2, 100, 442.38]
    const rows = [real[0]!, real[1]!, script, real[2]!, real[3]!]
    const boxes = [[453.3, 443.23], [442.38, 421.42], [442.38, 435.28], [420.49, 410.66], [406.9, 397.1]]
    const info = (js: number[]) => new Map(rows.map((r, i) => [`${r[0]}|${r.slice(1).join()}`, { baseline: i === 2 ? 438.17 : a[i > 2 ? i - 1 : i]!, size: 10.91, top: boxes[i]![0], bottom: boxes[i]![1], exact: true, file: true, j: js[i], frame: 1 }]))
    const unit81 = (js = [8, 9, 10, 11, 12]) => L2.blocks2(rows as never, [[0, 0, 612, 792]], new Set([`1|${script.slice(1).join()}`]), info(js) as never, null, null, [1, 0])
    expect(unit81().map(b => [b.flow, b.through])).toEqual([[0, true], [0, undefined]])
    // a kept line lower than the last line, in the gap: the block's foot stays its own
    const held = [1, 90, 420, 100, 428]
    const withHeld = [real[0]!, real[1]!, held, real[2]!, real[3]!]
    const heldInfo = new Map(withHeld.map((r, i) => [`${r[0]}|${r.slice(1).join()}`, { ...(info([8, 9, 10, 11, 12]).get(`${rows[i]![0]}|${rows[i]!.slice(1).join()}`) as object), ...(i === 2 ? { baseline: 422 } : {}) }]))
    expect(L2.blocks2(withHeld as never, [[0, 0, 612, 792]], new Set([`1|${held.slice(1).join()}`]), heldInfo as never, null, null, [1, 0]).map(b => [b.flow, b.through])).toEqual([[0, false], [0, undefined]])
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
    // (a stretch of rows of the unit's own that no rectangle holds is a break: `j` is the unit's own row in the file, so
    // another unit's lines never show in it; they are not rows of the unit, and `through`, below, is what stays clear of them)
    expect(flows([10, 11, 20, 21])).toEqual([0, 1])
    // the next line of the file, but in another frame (a column or a page on)
    expect(flows([10, 11, 12, 13], [0, 0, 1, 1])).toEqual([0, 1])
    // lines with no frame are in none, not in one: two flows
    expect(flows([10, 11, 12, 13], [undefined, undefined, undefined, undefined] as never)).toEqual([0, 1])
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
  it('pushes the later slots only as far as their pitch under the line set lower: a gap of the original wider than it takes the push in', () => {
    // one block whose original opened a gap of 18 (a tall line of its own) between 488 and 470: the formula on 500, 6 deep,
    // opens the second line by 2, to 486; 470 is still 16 under it, more than the pitch: it stays on its baseline. On the
    // original's own baselines (evenPitch off): with it on, the grid holds no such gap (layer-even-pitch.test.ts)
    const opened = (B: number[]) => ({ ...block(B.length), B, rects: B.map(b => [1, 0, b - 2, 100, b + 8]) })
    const four = [crop(7.5, 6), space, word(14), space, word(18), space, word(18), space, word(18)]
    expect(L2.layoutUnit2(four as never, [opened([500, 488, 470, 458])] as never, 10, P([1, 0], { evenPitch: false }) as never).lines.map(x => x.baseline)).toEqual([500, 486, 470, 458])
    // a gap of 14 takes 2 of a push of 3 (the formula 7 deep): the slots under it move 1, those after them with them (the
    // last, 450, past the foot by it, dropped and not needed)
    expect(L2.layoutUnit2([crop(7.5, 7), ...four.slice(1)] as never, [opened([500, 488, 474, 462, 450])] as never, 10, P([1, 0], { evenPitch: false }) as never).lines.map(x => x.baseline)).toEqual([500, 485, 473, 461])
    // (evenPitch on, the 18 TeX's \\lineskip rule set closed (blocks2's `E`): every line a pitch under the one before it but the
    // second, which the formula opens; a block with no `E`, its gaps none the rule set, stands on the original's grid, as above)
    const E = L2.evenGridOf([500, 488, 470, 458], [false, true, false], 12)
    expect(L2.layoutUnit2(four as never, [{ ...opened([500, 488, 470, 458]), E }] as never, 10, P([1, 0]) as never).lines.map(x => x.baseline)).toEqual([500, 486, 474, 462])
    expect(L2.layoutUnit2(four as never, [opened([500, 488, 470, 458])] as never, 10, P([1, 0]) as never).lines.map(x => x.baseline)).toEqual([500, 486, 470, 458])
  })
  it("sets a line its rule moves past its block's foot into the room of its flow's next block, where nothing kept lies between", () => {
    // block 0 at 500 and 488, block 1 from 470 (v0 split one paragraph at the 18 TeX opened there): the second line, opened
    // by 2 to 486, is under block 0's foot but in the paragraph's own room; the third stays on 470. At full size, no state
    // further (order: none)
    const B = (from: number, n: number, through?: boolean) => ({ ...block(n), B: Array.from({ length: n }, (_, k) => from - 12 * k), rects: Array.from({ length: n }, (_, k) => [1, 0, from - 12 * k - 2, 100, from - 12 * k + 8]), flow: 0, ...(through === undefined ? {} : { through }) })
    const three = unit(7.5, 6)
    const room = L2.layoutUnit2(three as never, [B(500, 2, true), B(470, 3)] as never, 10, P([1, 0], { order: [] }) as never)
    expect(room.clipped).toBe(false)
    expect(room.lines.map(x => x.baseline)).toEqual([500, 486, 470])
    // a line the unit keeps in that gap (no `through`): the opened line stays above its block's foot, and the state fails
    const kept = L2.layoutUnit2(three as never, [B(500, 2), B(470, 3)] as never, 10, P([1, 0], { order: [] }) as never)
    expect(kept.clipped).toBe(true)
    expect(kept.lines.at(-1)?.baseline).toBe(486)
    // a gap smaller than TeX's rule gives (12, the pitch: boxes a \lineskiplimit under 0 lets overlap), which blocks2 still
    // takes for the paragraph's (`through` bounds the gap from above alone), holds no room: the push goes on into the next
    // block, its lines moved with it (474, not 476), and none is set under its foot
    const tight = L2.layoutUnit2(three as never, [B(500, 2, true), B(476, 3)] as never, 10, P([1, 0], { order: [] }) as never)
    expect(tight.clipped).toBe(false)
    expect(tight.lines.map(x => x.baseline)).toEqual([500, 486, 474])
  })
  it('starts the text after a kept display in the first slot below it, when the line before the display opens and drops slots above it', () => {
    // block 0 (500 to 464) above a display, block 1 (400, 388, 376) below it. The second line, which the display's break
    // token closes, opens by 2 (the formula 6 deep, its text 7 high), and the slot at 464 is pushed past block 0's foot and
    // dropped. The text after the display still starts on 400, the first slot under it, not on the slot after that
    const display = { blockTo: 0, w100: 0 }
    const tokens = [crop(7.5, 6), space, word(14), space, word(18), display, space, word(18)]
    const B = (from: number, n: number, after: number) => ({ ...block(n), B: Array.from({ length: n }, (_, k) => from - 12 * k), rects: Array.from({ length: n }, (_, k) => [1, 0, from - 12 * k - 2, 100, from - 12 * k + 8]), after })
    const l = L2.layoutUnit2(tokens as never, [B(500, 4, 0), B(400, 3, 1)] as never, 10, P([1, 0], { order: [] }) as never)
    expect(l.clipped).toBe(false)
    expect(l.lines.map(x => x.baseline)).toEqual([500, 486, 400])
  })
  it('holds the slots after a dropped one to the last slot that stays: a dropped slot moves nothing', () => {
    // block 0 at 500, 488, 476 and block 1 at 464, 452, one flow, no room of the paragraph's own between them (`through`
    // false: block 0's foot is its own, 476). The second line opens by 2, to 486, and block 0's slot at 476 is pushed past
    // its foot and dropped. Block 1's first slot is held to the line set at 486, 22 above it, not to the dropped slot:
    // it stays on 464, and the four lines fit (held to 476, it went to 462, 450 was dropped, and the state clipped)
    const B = (from: number, n: number) => ({ ...block(n), B: Array.from({ length: n }, (_, k) => from - 12 * k), rects: Array.from({ length: n }, (_, k) => [1, 0, from - 12 * k - 2, 100, from - 12 * k + 8]), flow: 0 })
    const four = [...unit(7.5, 6), space, word(18)]
    const l = L2.layoutUnit2(four as never, [B(500, 3), B(464, 2)] as never, 10, P([1, 0], { order: [] }) as never)
    expect(l.clipped).toBe(false)
    expect(l.lines.map(x => x.baseline)).toEqual([500, 486, 464, 452])
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
