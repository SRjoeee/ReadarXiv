// @vitest-environment node
// The parity's pixel readings against arXiv's page (lab/typeset/parity/pixels.mjs): synthetic shots of a few device pixels.
import { describe, expect, it } from 'vitest'
// @ts-expect-error — a plain node module of the lab
import { darkOf, overOf, partsOf, pixelsOf, shownOf } from '../../lab/typeset/parity/pixels.mjs'

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
