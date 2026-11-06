// Sentence alignment in wire coordinates (src/core/protector/alignment.ts): lengths into intervals that tile each text
import { describe, expect, it } from 'vitest'
import { boundariesOf, sentencePairs } from '@/core/protector/alignment'

describe('sentence alignment', () => {
  it('expands into per-sentence intervals that tile each text', () => {
    const src = 'One sentence. Two here.'
    const tgt = 'Una frase. Dos.'
    expect(boundariesOf([14, 9])).toEqual([0, 14, 23])
    expect(sentencePairs({ source: [14, 9], target: [11, 4] })).toEqual([
      { index: 0, source: { from: 0, to: 14 }, target: { from: 0, to: 11 } },
      { index: 1, source: { from: 14, to: 23 }, target: { from: 11, to: 15 } },
    ])
    expect(src.slice(0, 14)).toBe('One sentence. ')
    expect(tgt.slice(11, 15)).toBe('Dos.')
  })
})
