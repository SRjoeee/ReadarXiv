// S.fill.page replayed on the tap: every pass of three pairs (a Chinese one laid in runs and grown, a Japanese one with CJK
// cells settled into their bands, a German one), each unit laid by the chain from F2 (round.ts), the pass by fillPass, every
// value the tap read compared (pass.ts), but a pass an owner's ruling changes (pass.ts `ruled`: the gap's and each frame's own
// leading, 2026-11-08; option (i)'s fill leadings and the frames' share, 2026-11-10; a unit under the page's band evened with the
// fit's own knobs, 2026-11-12). The German pair's every pass holds a unit today laid with a borrowed line, which the chain borrows as
// today's walk did. The whole corpus: lab/typeset/replay-fill.mjs.
import { describe, expect, it } from 'vitest'
import { laysOf, passesOf } from './pass.ts'
import { hasDerived, hasTap } from './tap.ts'
import { hasCache } from './today.ts'

const PAIRS = ['2610.21377v1-zh', '1512.03385v1-ja.pack', '1706.03762v7-de.pack']

describe.skipIf(!hasTap || !hasDerived('rules') || !hasCache)('S.fill.page: replayed on the tap', () => {
  for (const pair of PAIRS)
    it(`fills every page of ${pair} as today did`, { timeout: 120_000 }, () => {
      const { lays, differ, lead } = laysOf(pair)
      expect(differ).toEqual([])
      const passes = passesOf(pair, lays, lead.moved)
      expect(passes.filter((r) => r.missing || r.d)).toEqual([])
      expect(passes.reduce((a, r) => a + r.filled, 0)).toBeGreaterThan(0)
    })
  // (a unit whose walk measures a text today's never measured, which the tap's table therefore lacks: named among the chain's
  // differences and laid by no lay, so that its passes read "not replayed" and the pair's other passes replay; it threw out of
  // laysOf and ended the corpus replay at its pair since round 8 B5 (literal-fixes, 1a01e7206): 2608.25210v2-zh's "Comput-")
  it('names a unit whose walk measures a text the tap lacks and replays the rest (2608.25210v2-zh)', {
    timeout: 120_000,
  }, () => {
    const { lays, differ } = laysOf('2608.25210v2-zh')
    expect(differ.filter((d) => /a measure the tap lacks/.test(d)).length).toBeGreaterThan(0)
    expect(lays.size).toBeGreaterThan(0)
    expect(passesOf('2608.25210v2-zh', lays).some((r) => r.missing?.length)).toBe(true)
  })
})
