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

describe("v0's displayed formulas: the engine's environments", () => {
  it('reads subequations, alignat, flalign, dmath and IEEEeqnarray as displays, not as inline formulas', async () => {
    const { phClass } = await import('@/pdf-reader/engine/layer-proto/layer1.mjs')
    for (const env of ['subequations', 'alignat', 'flalign', 'dmath', 'IEEEeqnarray', 'equation*', 'align'])
      expect(phClass(`\\begin{${env}}x = 1\\end{${env}}`)).toBe('display')
    expect(phClass('\\begin {subequations}x\\end{subequations}')).toBe('display')
    expect(phClass('$x = 1$')).toBe('other')
  })
})

describe('no unit drawn in part: the text run past a display where the slots after it are too few', () => {
  // a line is 100 pt wide at size 10, each 'x' 5 pt (the test's canvas: 50 px a character at 100 px)
  const word = (n: number) => ({ s: 'x'.repeat(n), cls: 'latin', w100: 50 * n, st: {} })
  const space = { space: true, w100: 25 }
  const block = (B: number[], after: number) => ({ page: 1, rects: B.map(b => [1, 0, b - 2, 100, b + 8]), x0: 0, x1: 100, B, exact: B.map(() => true), sizes: B.map(() => 10), pitch0: 12, free: 0, indent: 0, after, centred: false })
  const P = () => ({ ...L2.defaultParams('de'), borrow: 0 })
  // one line of text before a display, three after it, which leaves the original one line below it and three above it
  const blocks = [block([500, 488, 476, 464], 0), block([300], 1)]
  const after = [word(18), space, word(18), space, word(18)]
  it("is clipped in the translation's order, and set whole once the text may run on into the lines above the display", () => {
    const tokens = [word(18), { blockTo: 0, w100: 0 }, ...after]
    expect(L2.layoutUnit2(tokens as never, blocks as never, 10, P() as never, 'de').clipped).toBe(true)
    const flow = L2.layoutUnit2(tokens as never, blocks as never, 10, { ...P(), flowPast: true } as never, 'de')
    expect(flow.clipped).toBe(false)
    expect(flow.scale).toBe(1)
    // the display breaks the line once: its text after it starts on the next line, above the display
    expect(flow.lines.map(l => l.baseline)).toEqual([500, 488, 476, 464])
  })
  it("breaks the line once a region: a placeholder kept in the display's lines after it is no second break", () => {
    const tokens = [word(18), { blockTo: 0, w100: 0 }, word(4), { blockTo: 0, w100: 0 }, word(4)]
    const flow = L2.layoutUnit2(tokens as never, blocks as never, 10, { ...P(), flowPast: true } as never, 'de')
    expect(flow.lines.map(l => l.items.filter(it => it.t.s).length)).toEqual([1, 2])
  })
})
