import { describe, expect, it } from 'vitest'
import { lostInk } from '@/pdf-reader/engine/layer/check.mjs'

// The layer's pixel checker (layer/check.mjs), which the layer gate's instrument loads by its address: lost ink over pixel arrays
// made here. The checks of a laid unit's data (checkPage) were tested over the first layer's fit and went with it
// (parked/engine/tests/layer-check.test.ts)

const W = 40, H = 30
/** a white RGBA page, with black squares [x, y, size] */
function plane(...squares: [number, number, number][]): Uint8ClampedArray {
  const a = new Uint8ClampedArray(W * H * 4).fill(255)
  for (const [x0, y0, n] of squares) for (let y = y0; y < y0 + n; y++) for (let x = x0; x < x0 + n; x++) a.fill(0, 4 * (y * W + x), 4 * (y * W + x) + 3)
  return a
}
const none = () => new Uint8Array(W * H)

describe('lost ink', () => {
  it('a planted lost glyph is found', () => {
    // a 6 x 6 glyph the copy erased and nothing accounts for: one region of 36 pixels, where it was
    const orig = plane([5, 4, 6], [30, 20, 2]), copy = plane()
    const lost = lostInk({ w: W, h: H, orig, copy, accounted: none(), min: 4, page: 3 })
    expect(lost).toEqual([{ page: 3, box: [5, 4, 11, 10], px: 36 }])
    // the 2 x 2 one is 4 pixels, not more than the floor; at a floor of 3 it is found too
    expect(lostInk({ w: W, h: H, orig, copy, accounted: none(), min: 3 }).map(l => l.px)).toEqual([36, 4])
    // ink the copy still shows is not lost, nor is a trace the copy keeps (a grey pixel is no paper)
    expect(lostInk({ w: W, h: H, orig, copy: orig, accounted: none(), min: 4 })).toEqual([])
    const grey = plane()
    for (let y = 4; y < 10; y++) for (let x = 5; x < 11; x++) grey.fill(200, 4 * (y * W + x), 4 * (y * W + x) + 3)
    expect(lostInk({ w: W, h: H, orig, copy: grey, accounted: none(), min: 4 })).toEqual([])
  })

  it('ink the unit accounts for is not lost', () => {
    const orig = plane([5, 4, 6]), copy = plane()
    const accounted = none()
    for (let y = 4; y < 10; y++) accounted.fill(1, y * W + 5, y * W + 11)
    expect(lostInk({ w: W, h: H, orig, copy, accounted, min: 4 })).toEqual([])
    // half of it accounted for: the other half, 18 pixels, is lost
    const half = none()
    for (let y = 4; y < 10; y++) half.fill(1, y * W + 5, y * W + 8)
    expect(lostInk({ w: W, h: H, orig, copy, accounted: half, min: 4 })).toEqual([{ page: 0, box: [8, 4, 11, 10], px: 18 }])
  })
})
