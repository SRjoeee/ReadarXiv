// U.blocks replayed on the tap's sample: blocks2's eleven arguments as today's run made them, its answer as today gave it.
import { describe, expect, it } from 'vitest'
import { type BlocksInput, blocks } from '../../src/unit/blocks.ts'
import { firstDifference, hasTap, roundsOf, sample } from './tap.ts'

describe.skipIf(!hasTap)('U.blocks: replayed on the tap', () => {
  it('equals today’s blocks2 on every sampled round', () => {
    const s = sample('U.blocks')
    const differ: string[] = []
    let replayed = 0
    for (const e of s.entries)
      for (const [round, c] of roundsOf(e)) {
        const a = c['U.blocks:in'] as BlocksInput | undefined,
          want = c['U.blocks:out']
        if (!a || !want) continue
        replayed++
        const got = blocks(a)
        const d = firstDifference(got, want)
        if (d) differ.push(`${e.pair} ord ${e.ord} round ${round}: ${d}`)
        // (the comparison tells a difference: one hundredth off a baseline is one)
        const off = got.map((b, k) => (k ? b : { ...b, B: b.B.map((y, j) => (j ? y : y + 0.01)) }))
        if (!firstDifference(off, want)) differ.push(`${e.pair} ord ${e.ord}: a changed baseline went unseen`)
      }
    expect(differ).toEqual([])
    expect(replayed).toBe(36)
  })
})
