import { beforeAll, describe, expect, it } from 'vitest'

// Step 3 of the layer's new direction (2026-10-07): v0's (and the hybrid's) weak spots, each fixed at its root and
// measured by the layer gate (--engine-kind=proto --proto-tex=lines); these are the fixes' pure rules.

type L2 = typeof import('@/pdf-reader/engine/layer-proto/layer2.mjs')
let L2: L2
beforeAll(async () => {
  // layer2.mjs measures with a canvas made when it loads; the test environment has none, and these rules measure nothing
  const g = globalThis as { OffscreenCanvas?: unknown }
  g.OffscreenCanvas ??= class { getContext() { return { font: '', measureText: (s: string) => ({ width: 50 * s.length }) } } }
  L2 = await import('@/pdf-reader/engine/layer-proto/layer2.mjs')
})

describe("the leading, relative to the original's own pitch", () => {
  const zh = { leadBase: 1.3 }
  const blocks = (...pitches: (number | null)[]) => pitches.map(pitch0 => ({ pitch0 }))
  it("is the script's own where the original is set solid: 10 pt on 12, 11 pt on 13.6 (TeX's), and closer", () => {
    expect(L2.leadOf(blocks(12), 10, zh)).toBe(1.3)
    expect(L2.leadOf(blocks(13.6), 10.91, zh)).toBe(1.3)
    expect(L2.leadOf(blocks(11), 10, zh)).toBe(1.3)
  })
  it("is not stacked on a looser pitch: one and a half spacing takes 1.3 of a solid line, double spacing its own", () => {
    // 1.3 × 1.25 × 11.96 = 19.44 pt against the thesis's 17.93: 1.084, not 1.3 (23.3 pt, 1.95 em)
    expect(L2.leadOf(blocks(17.93), 11.96, zh)).toBeCloseTo(1.084, 3)
    expect(L2.leadOf(blocks(24), 12, zh)).toBe(1)
  })
  it("reads the original's pitch as its blocks' median, and leaves a unit with none, or a leading of 1, as it is", () => {
    expect(L2.leadOf(blocks(null, 18, 18, 12), 12, zh)).toBeCloseTo((1.3 * 1.25 * 12) / 18, 3)
    expect(L2.leadOf(blocks(null), 12, zh)).toBe(1.3)
    expect(L2.leadOf(blocks(18), 12, { leadBase: 1 })).toBe(1)
  })
})
