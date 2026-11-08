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
  it("how much of an element's ink the copy shows in place", () => {
    const ink = rect(2, 2, 4, 4)
    expect(shownOf(shot(ink), shot(ink), all, W, H)).toEqual({ ink: 4, shown: 4 })
    expect(shownOf(shot(ink), shot(), all, W, H)).toEqual({ ink: 4, shown: 0 })
  })
})
