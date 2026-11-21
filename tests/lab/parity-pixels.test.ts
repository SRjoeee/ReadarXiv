// @vitest-environment node
// The parity's pixel readings against arXiv's page (lab/typeset/parity/pixels.mjs): synthetic shots of a few device pixels.
import { describe, expect, it } from 'vitest'
// @ts-expect-error — a plain node module of the lab
import { darkOf, overOf, partsOf, pixelsOf, shownOf, strayOf } from '../../lab/typeset/parity/pixels.mjs'
// @ts-expect-error — a plain node module of the lab
import { boxesOf } from '../../lab/typeset/parity/analyse.mjs'
// @ts-expect-error — a plain node module of the lab
import { vacatedOf } from '../../lab/typeset/parity/fidelity.mjs'

const W = 12,
  H = 8
/** a white shot with the given device pixels [x, y] black */
const shot = (ink: [number, number][] = []) => {
  const d = new Uint8ClampedArray(W * H * 4).fill(255)
  for (const [x, y] of ink) d.fill(0, (y * W + x) * 4, (y * W + x) * 4 + 3)
  return d
}
const rect = (x0: number, y0: number, x1: number, y1: number) => {
  const out: [number, number][] = []
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) out.push([x, y])
  return out
}
const all = Int32Array.from({ length: W * H }, (_, i) => i)
const mask = (pts: [number, number][]) => {
  const m = new Uint8Array(W * H)
  for (const [x, y] of pts) m[y * W + x] = 1
  return m
}

describe('pixels: the drawing read against arXiv\'s page', () => {
  it('a PDF box covers the device pixels under it (y up from the view\'s top)', () => {
    // (view [0, 0, 12, 8] at 1 device px a point: the box x 2..4, y 6..8 is the top two rows)
    expect([...pixelsOf([[2, 6, 4, 8]], [0, 0, 12, 8], 1, W, H)]).toEqual([2, 3, 14, 15])
  })
  it('text over ink that stays: the pixels inked in both shots', () => {
    expect(overOf(shot(rect(0, 0, 4, 2)), shot(rect(2, 0, 6, 2)), all)).toBe(4)
    expect(overOf(shot(rect(0, 0, 4, 2)), shot(rect(5, 0, 8, 2)), all)).toBe(0)
  })
  it('the darkness of glyph pixels', () => {
    expect(darkOf(shot(rect(0, 0, 2, 2)), all)).toEqual({ mean: 1, pixels: 4 })
  })
  it('a glyph shown in part is a sliver; one shown whole or not at all is none', () => {
    const glyph = rect(2, 2, 6, 6)
    const a = shot(glyph)
    const region = mask(rect(0, 0, W, H))
    // (the copy shows its top row alone: the stroke's 16 pixels, of which the top row and the row under it, within a device
    // pixel, are shown)
    expect(partsOf(a, shot(rect(2, 2, 6, 3)), region, null, W, H)).toEqual([{ box: [2, 2, 6, 6], size: 16, shown: 8 }])
    expect(partsOf(a, shot(glyph), region, null, W, H)).toEqual([])
    expect(partsOf(a, shot(), region, null, W, H)).toEqual([])
    // (a stroke mostly outside the region is not the region's)
    expect(partsOf(a, shot(rect(2, 2, 6, 3)), mask(rect(2, 2, 6, 3)), null, W, H)).toEqual([])
  })
  it('a moved crop’s ink shows no glyph of arXiv’s, in its place or a device pixel beside it', () => {
    // (round 5's 2610.21312v1-zh p10 t122: the crop of "E[(QD⁻¹Q^⊤)ⱼⱼ]…" drawn 25 pt left and 2.4 pt down, over the place of
    // its own erased "D", whose top stands above the crop's place; the crop's top ink, a device pixel under that edge, made
    // the "D"'s pixels there read as shown, though nothing of arXiv's is left: its place set aside, its ink is not arXiv's
    // anywhere)
    const glyph = rect(2, 1, 6, 6)
    const a = shot(glyph)
    const region = mask(rect(0, 0, W, H))
    const crop = rect(0, 3, 9, 7)
    // (the crop's place rows 3..6, its ink the row 3, under the glyph's rows 1..2 outside its place)
    expect(partsOf(a, shot(rect(2, 3, 6, 4)), region, mask(crop), W, H)).toEqual([])
    // (arXiv's own ink left beside the crop's place still shows: the glyph's top row kept by the side, and the row under it,
    // within a device pixel of it)
    expect(partsOf(a, shot([...rect(2, 1, 6, 2), ...rect(2, 3, 6, 4)]), region, mask(crop), W, H)).toEqual([
      { box: [2, 1, 6, 6], size: 20, shown: 8 },
    ])
  })
  it("how much of an element's ink the copy shows in place", () => {
    const ink = rect(2, 2, 4, 4)
    expect(shownOf(shot(ink), shot(ink), all, W, H)).toEqual({ ink: 4, shown: 4 })
    expect(shownOf(shot(ink), shot(), all, W, H)).toEqual({ ink: 4, shown: 0 })
  })
})

describe("the pixels off arXiv's page outside the units' boxes (pixels.mjs strayOf, the `pixels` measure)", () => {
  // (an end mark, a 4 × 4 device-pixel box at (6, 1) on A, outside its unit's lines; the lay sets it at the translation's end,
  // (1, 4), inside the drawn line's box. `vacated`: the place a side moved an element's ink from, the source of its crop drawn
  // away from it, render.mjs. A pixel counts where no pixel of either shot within one device pixel matches it, so of a box
  // shown blank its 2 × 2 middle counts, its edge (a white neighbour on A matching the side's white) not: the rule before)
  const mark = rect(6, 1, 10, 5)
  const drawn = rect(1, 4, 5, 8)
  const inside = mask(rect(0, 4, 6, 8))
  const none = new Uint8Array(W * H)
  const vacated = mask(mark)
  const A = shot(mark)
  it("a mark moved to the translation's end, its place left blank, is no stray pixel", () => {
    expect(strayOf(A, shot(drawn), inside, vacated, W, H)).toBe(0)
  })
  it('the same blank place read with no move known is stray, as before (the newly worse page of B13)', () => {
    expect(strayOf(A, shot(drawn), inside, none, W, H)).toBe(4)
  })
  it("a mark drawn twice, left where it stood and drawn at the translation's end, is stray where it was left: every pixel of its ink", () => {
    expect(strayOf(A, shot([...mark, ...drawn]), inside, vacated, W, H)).toBe(16)
  })
  it('a mark lost, erased and drawn nowhere (no crop moved, no place vacated), is stray', () => {
    expect(strayOf(A, shot(), inside, none, W, H)).toBe(4)
  })
  it("ink a side draws outside the boxes where arXiv's page has none is stray; the same ink a device pixel off is not", () => {
    expect(strayOf(shot(), shot(rect(1, 1, 4, 4)), none, none, W, H)).toBe(1)
    expect(strayOf(shot(rect(1, 1, 5, 5)), shot(rect(2, 1, 6, 5)), none, none, W, H)).toBe(0)
    expect(strayOf(A, shot(mark), inside, none, W, H)).toBe(0)
  })
})

describe("the places a side moved an element's ink from, over the pair's pages (fidelity.mjs vacatedOf)", () => {
  // (a proof's end mark on page 10, a 4.5 × 4.5 pt box at 293.8, 510.8, outside its unit's lines there; a shorter translation
  // ends on page 9, where the lay sets the mark at its last line's end. Each record: a page's crops, [group, x0, y0, x1, y1
  // drawn, piece, sx0, sy0, sx1, sy1 its source, its source's page]. Red before: the places were read off the page's own record
  // alone, which draws no crop of it, so page 10's blank place read as stray)
  const src = [293.8, 510.8, 298.3, 515.3]
  const moved = [195, 120.1, 523.6, 124.6, 528.1, '-2', ...src, 10]
  const p9 = { page: 9, v2: { crops: [moved] }, today: { crops: [] } }
  const p10 = { page: 10, v2: { crops: [] }, today: { crops: [] } }
  // (page 10's pixels at 1 device px a point from the view's top-left corner (290, 517): the mark's ink the device pixels x 4..8,
  // y 1..6; its source box covers x 3..9, y 1..7)
  const [vx, , , vy] = [290, 505, 302, 517] as const
  const markPx = rect(4, 1, 8, 6)
  const maskBoxes = (boxes: [number, number, number, number][]) =>
    mask(boxes.flatMap(([x0, y0, x1, y1]) => rect(Math.floor(x0 - vx), Math.floor(vy - y1), Math.ceil(x1 - vx), Math.ceil(vy - y0))))
  const none = new Uint8Array(W * H)
  it("a crop drawn on another page vacates its source's place on its own page", () => {
    expect(vacatedOf([p9, p10], 10)).toEqual({ today: [], v2: [src] })
    expect(vacatedOf([p9, p10], 9)).toEqual({ today: [], v2: [] })
    // (the moved mark's place shown blank on page 10: no stray pixel; read off page 10's record alone, 6 as before)
    expect(strayOf(shot(markPx), shot(), none, maskBoxes(vacatedOf([p9, p10], 10).v2), W, H)).toBe(0)
    expect(strayOf(shot(markPx), shot(), none, maskBoxes(vacatedOf([p10], 10).v2), W, H)).toBe(6)
  })
  it('a crop is in place by the page it is drawn on: one drawn on page 9 at its page-10 source\'s coordinates is moved', () => {
    const same = [195, ...src, '-2', ...src, 10]
    expect(vacatedOf([{ page: 9, v2: { crops: [same] } }, p10], 10).v2).toEqual([src])
    expect(vacatedOf([{ page: 10, v2: { crops: [same] } }], 10).v2).toEqual([])
  })
  it('still stray: the mark left on its source page and drawn on page 9 (every pixel of it); a mark erased and drawn nowhere', () => {
    expect(strayOf(shot(markPx), shot(markPx), none, maskBoxes(vacatedOf([p9, p10], 10).v2), W, H)).toBe(20)
    expect(strayOf(shot(markPx), shot(), none, maskBoxes(vacatedOf([{ ...p9, v2: { crops: [] } }, p10], 10).v2), W, H)).toBe(6)
  })
})

describe("the units' boxes the pixels off arXiv's page are counted outside (analyse.mjs boxesOf)", () => {
  // (a head's label "Proposition 1 (" at 48.96–113.52 on page 3, its line on A after it; a side that draws the label anew draws
  // over the label's place, the unit's own: 2610.21312v1 p5, two theorem heads relabelled by v2, 522 device pixels "off arXiv's
  // page" where the original's label stood)
  const label = { ink: [3, 48.96, 256.26, 113.52, 265.18, 258.3], kind: 'head', name: ['Proposition', [3, 48.96, 256.26, 98.04, 265.18, 258.3]] }
  const line3 = [3, 0, 113.52, 300, 258.3, 266.3, 256.3, 48, 300, 0, 10]
  const member = { ord: 21, kind: 'theorem', label, lines: [line3] }
  const facts = { 3: { members: [member] } }
  it("holds each unit's label's ink beside its lines on A", () => {
    expect(boxesOf({ page: 3 }, { facts }, 3)).toEqual([
      [112.52, 255.3, 301, 267.3],
      [47.96, 255.26, 114.52, 266.18],
    ])
  })
  it("a label on another page is not this page's", () => {
    const line4 = [4, 0, 72, 300, 700, 708, 698, 48, 300, 0, 10]
    expect(boxesOf({ page: 4 }, { facts: { 4: { members: [{ ...member, lines: [line3, line4] }] } } }, 4)).toEqual([[71, 697, 301, 709]])
  })
})
