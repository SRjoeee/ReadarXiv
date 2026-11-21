// S.settle and S.overFollower on synthetic cases: the branches the corpus decides by facts its pages hold in one way only.
import { describe, expect, it } from 'vitest'
import type { FitBlock, FitParams, Layout, Tokens } from '../../src/fit/types.ts'
import { type OverFollowerInput, overFollower } from '../../src/shared/over-follower.ts'
import { clearLines, settleLayout } from '../../src/shared/settle.ts'

describe('S.settle', () => {
  it('moves a line on its original’s baseline into its band by the least that keeps its em box in, and no other', () => {
    const bands = new Map([[0, [{ B: 100, lo: 98, hi: 108 }]]])
    const lines = [
      { block: 0, baseline: 100 },
      { block: 0, baseline: 90 },
      { block: 1, baseline: 100 },
    ]
    clearLines(lines, bands, 10)
    // (its em box 0.88 of 10 over the baseline: the band's top 108 holds it at 99.2)
    expect(lines.map((l) => l.baseline)).toEqual([99.2, 90, 100])
  })
  it('settles nothing without bands, and at the size the layout is drawn at', () => {
    const lines = [{ block: 0, baseline: 100 }]
    settleLayout({ clear: null, s: 10 }, { lines, scale: 0.5 })
    expect(lines[0]!.baseline).toBe(100)
    settleLayout({ clear: { bands: new Map([[0, [{ B: 100, lo: 99.9, hi: 106 }]]]) }, s: 10 }, { lines, scale: 0.5 })
    expect(lines[0]!.baseline).toBeCloseTo(100.5, 9)
  })
})

describe('S.overFollower', () => {
  const block = {
    page: 1,
    B: [700],
    rects: [[1, 72, 690, 200, 710]],
    x0: 72,
    x1: 200,
    centred: false,
  } as unknown as FitBlock
  const layout = { clipped: true, lines: [] } as unknown as Layout
  const laid = { layout: { clipped: false, lines: [] } as unknown as Layout, tokens: [] as Tokens }
  const base: OverFollowerInput = {
    kind: 'heading',
    follower: { id: 7, open: true, row: { page: 1, baseline: 700 }, first: { page: 1, x1: 520 } },
    kept: false,
    pages: [1],
    layout,
    tokens: [] as Tokens,
    blocks: [block],
    s: 10,
    P: {} as FitParams,
  }
  const cut = (_t: Tokens, blocks: readonly FitBlock[]) => ({ ...laid, layout: { ...laid.layout, blocks } as never })
  it('runs its last block on to the follower’s first line’s end where it fits so', () => {
    const got = overFollower(base, cut)
    expect(got?.id).toBe(7)
    expect(got?.blocks[0]?.x1).toBe(520)
  })
  it('is not taken where something stays between, for a cell, unclipped, or a follower not laid', () => {
    expect(overFollower({ ...base, kept: true }, cut)).toBeNull()
    expect(overFollower({ ...base, kind: 'cell' }, cut)).toBeNull()
    expect(overFollower({ ...base, layout: { ...layout, clipped: false } }, cut)).toBeNull()
    expect(overFollower({ ...base, follower: { ...base.follower!, open: false } }, cut)).toBeNull()
    expect(overFollower({ ...base, follower: null }, cut)).toBeNull()
  })
  it('is taken where its fit shrank it and over its row it is set larger: the row before the size (2611.03178v1-zh p16)', () => {
    const shrunk = { ...layout, clipped: false, scale: 0.85 } as unknown as Layout
    const at = (scale: number) => () => ({
      layout: { clipped: false, lines: [], scale } as unknown as Layout,
      tokens: [] as Tokens,
    })
    expect(overFollower({ ...base, layout: shrunk }, at(1))?.blocks[0]?.x1).toBe(520)
    expect(overFollower({ ...base, layout: shrunk }, at(0.85))).toBeNull()
    expect(overFollower({ ...base, layout: { ...shrunk, scale: 1 } as unknown as Layout }, at(1))).toBeNull()
  })
  it('is not taken off the row’s page, over two pages, past a block of two lines, centred, or short of its end', () => {
    expect(overFollower({ ...base, follower: { ...base.follower!, first: { page: 2, x1: 520 } } }, cut)).toBeNull()
    expect(overFollower({ ...base, pages: [1, 2] }, cut)).toBeNull()
    const two = { ...block, rects: [block.rects[0], block.rects[0]] } as FitBlock
    expect(overFollower({ ...base, blocks: [two] }, cut)).toBeNull()
    expect(overFollower({ ...base, blocks: [{ ...block, centred: true } as FitBlock] }, cut)).toBeNull()
    expect(overFollower({ ...base, follower: { ...base.follower!, first: { page: 1, x1: 200.05 } } }, cut)).toBeNull()
    expect(overFollower(base, () => ({ layout: { ...layout, clipped: true }, tokens: [] as Tokens }))).toBeNull()
  })
})
