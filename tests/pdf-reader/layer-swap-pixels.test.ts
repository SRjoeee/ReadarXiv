import { beforeAll, describe, expect, it } from 'vitest'
import { SWAP_PAD, swapRects } from '@/pdf-reader/engine/layer/swap.mjs'

// The swap's rectangles at a reader's own resolution (layer2.mjs drawOps' `k`; the M1 survey of 2608.16117, Chinese page 10):
// a removed glyph's outline grown by SWAP_PAD, 0.6 of a unit, is a device pixel and more at the gate's 2.5 device pixels a
// unit, but staging draws at 85 % and a device pixel ratio of 1, about 1.06 to 1.14 a unit: there the glyph's edge pixel
// straddled the rectangle's edge, which the canvas antialiases too, and a row of the erased line's ascenders was left. The
// lab gate draws at 2.5 alone and cannot see it; these draw the swap as a canvas does, by the area each pixel has of the
// glyph's outline and of the clip, at the reader's resolutions

type L2 = typeof import('@/pdf-reader/engine/layer-proto/layer2.mjs')
let L2: L2
beforeAll(async () => {
  const g = globalThis as { OffscreenCanvas?: unknown }
  g.OffscreenCanvas = class { getContext() { return { font: '', measureText: (s: string) => ({ width: 50 * s.length }) } } }
  L2 = await import('@/pdf-reader/engine/layer-proto/layer2.mjs')
})

/** a canvas context that records the rectangles of each path it fills or clips to */
function recorder() {
  const paths: { op: string; rects: number[][] }[] = []
  let rects: number[][] = []
  const ctx = new Proxy({}, {
    get: (_t, k) => (k === 'canvas' ? {} : k === 'beginPath' ? () => { rects = [] } : k === 'rect' ? (...a: number[]) => rects.push(a) : k === 'clip' || k === 'fill' ? () => paths.push({ op: String(k), rects }) : () => {}),
    set: () => true,
  }) as unknown as CanvasRenderingContext2D
  return { ctx, paths }
}
/** v0's own resolution, the reader's (scale 1.25 at a device pixel ratio of 1): its operations' device pixels a unit */
const V0 = 1.25
/** a PDF box [x0, y0, x1, y1] in v0's device pixels [x, y, w, h] (y down from the page's top, 800 units) */
const dev = (b: number[]) => [b[0]! * V0, (800 - b[3]!) * V0, (b[2]! - b[0]!) * V0, (b[3]! - b[1]!) * V0]
/** the share of a pixel a rectangle [x, y, w, h] covers */
const cover = (px: number, py: number, r: number[]) => Math.max(0, Math.min(px + 1, r[0]! + r[2]!) - Math.max(px, r[0]!)) * Math.max(0, Math.min(py + 1, r[1]! + r[3]!) - Math.max(py, r[1]!))
/** the most a glyph's ink shows through its swap, drawn at k device pixels a unit: over every pixel its outline touches (the
 *  canvas antialiases a glyph by the area of its pixels it covers), what the clip leaves of it (one minus the clip's cover) */
function residueAt(k: number, glyph: number[], snap: boolean) {
  const { ctx, paths } = recorder()
  L2.drawOps(ctx, [{ op: 'swap', page: 1, rects: swapRects([glyph]).map(dev) }] as never, k / V0, () => ({}) as never, snap ? k : null)
  const clip = paths[0]!.rects
  const [x0, y0, w, h] = dev(glyph).map(v => v * (k / V0)) as [number, number, number, number]
  let most = 0
  for (let px = Math.floor(x0); px < Math.ceil(x0 + w); px++) for (let py = Math.floor(y0); py < Math.ceil(y0 + h); py++) {
    if (cover(px, py, [x0, y0, w, h]) <= 0) continue
    most = Math.max(most, 1 - Math.min(1, clip.reduce((a, r) => a + cover(px, py, r), 0)))
  }
  return most
}
// (an ascender's outline box at no pixel's edge, as glyphs stand)
const GLYPH = [100.13, 640.21, 104.71, 647.29]

describe("the swap at a reader's resolution", () => {
  it('leaves none of a removed glyph showing at 85 % and a device pixel ratio of 1, nor at any resolution from 1 to 3', () => {
    // (before: at 1.14 the edge pixels a quarter and more of their ink left, the survey's faint row)
    expect(residueAt(1.14, GLYPH, false)).toBeGreaterThan(0.05)
    for (let k = 1; k <= 3.001; k += 0.02) expect(residueAt(k, GLYPH, true), `k ${k.toFixed(2)}`).toBe(0)
  })

  it('takes the rectangles out to whole device pixels only where the pad is under one of them', () => {
    const ops = [{ op: 'swap', page: 1, rects: [[10.3, 20.6, 30.2, 5.1]] }, { op: 'paper', rects: [[50.5, 20.25, 4.1, 3.3]] }]
    const drawn = (k: number | null) => { const { ctx, paths } = recorder(); L2.drawOps(ctx, ops as never, (k ?? V0) / V0, () => ({}) as never, k); return paths.map(p => p.rects) }
    // (at 0.85 of v0's resolution: the swap's clip and the paper's fill out to whole pixels, each holding what it held)
    expect(drawn(1.0625)).toEqual([[[8, 17, 27, 5]], [[42, 17, 5, 4]]])
    // (from 1 / SWAP_PAD up, and where no k is given, as they were)
    const exact = (r: number[], z: number) => r.map(v => v * z)
    expect(drawn(2 / SWAP_PAD)).toEqual([[exact([10.3, 20.6, 30.2, 5.1], 2 / SWAP_PAD / V0)], [exact([50.5, 20.25, 4.1, 3.3], 2 / SWAP_PAD / V0)]])
    expect(drawn(null)).toEqual([[[10.3, 20.6, 30.2, 5.1]], [[50.5, 20.25, 4.1, 3.3]]])
  })
})
