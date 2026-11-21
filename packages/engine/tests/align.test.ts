import { describe, expect, it } from 'vitest'
import { align, HOW, HUNK } from '../src/align/align.ts'
import { lcs } from '../src/align/myers.ts'
import { docOf } from './helpers/doc.ts'

/** A's glyph text for each B glyph (or '_' where it has none) */
const mapped = (B: ReturnType<typeof docOf>, A: ReturnType<typeof docOf>, bToA: Int32Array) => {
  const flatA = A.pages.flatMap((p) => p.glyphs)
  return B.pages
    .flatMap((p) => p.glyphs)
    .map((_, i) => ((bToA[i] as number) >= 0 ? flatA[bToA[i] as number]!.u : '_'))
    .join('')
}

describe('myers lcs', () => {
  it('equals the dynamic programme’s LCS length, increasing and equal, on 2,000 random cases', () => {
    let seed = 7
    const rnd = (n: number) => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff
      return seed % n
    }
    for (let t = 0; t < 2000; t++) {
      const n = rnd(40)
      const m = rnd(40)
      const k = 1 + rnd(5)
      const a = Int32Array.from({ length: n }, () => rnd(k))
      const b = Int32Array.from({ length: m }, () => rnd(k))
      const dp = Array.from({ length: n + 1 }, () => new Int32Array(m + 1))
      for (let i = 1; i <= n; i++)
        for (let j = 1; j <= m; j++)
          dp[i]![j] = a[i - 1] === b[j - 1] ? dp[i - 1]![j - 1]! + 1 : Math.max(dp[i - 1]![j]!, dp[i]![j - 1]!)
      const { pairs } = lcs(a, b)
      const L = pairs.length / 2
      for (let q = 0; q < L; q++) {
        expect(a[pairs[2 * q]!]).toBe(b[pairs[2 * q + 1]!])
        if (q) expect(pairs[2 * q]! > pairs[2 * q - 2]! && pairs[2 * q + 1]! > pairs[2 * q - 1]!).toBe(true)
      }
      expect(L).toBe(dp[n]![m])
    }
  })
  it('stops past its work and says so', () => {
    const a = Int32Array.from({ length: 400 }, (_, i) => i % 7)
    const b = Int32Array.from({ length: 400 }, (_, i) => (i * 3) % 11)
    expect(lcs(a, b, 10).stopped).toBe(true)
  })
})

describe('align', () => {
  it('maps a page whose keys equal its partner’s by index, wherever its glyphs stand', () => {
    const B = docOf([{ lines: ['Hello world', 'second line'] }])
    const A = docOf([
      {
        lines: [
          { text: 'Hello world', x: 90 },
          { text: 'second line', y: 500 },
        ],
      },
    ])
    const m = align(B, A)
    expect(m.identical).toEqual([true])
    expect(Array.from(m.bToA)).toEqual(Array.from({ length: 22 }, (_, i) => i))
    expect(m.how.every((h) => h === HOW.identical)).toBe(true)
  })
  it('aligns a page that differs, and classes the difference', () => {
    const B = docOf([{ lines: ['The quick fox', 'jumps over'] }])
    const A = docOf([{ lines: ['The quick brown fox', 'jumps over'] }])
    const m = align(B, A)
    expect(m.identical).toEqual([false])
    expect(mapped(B, A, m.bToA)).toBe('The quick fox' + 'jumps over')
    const aonly = A.pages[0]!.glyphs.map((g, i) => (m.hunkA[i] === HUNK.aonly ? g.u : '')).join('')
    expect(aonly).toBe('brown ')
  })
  it('counts a line-end hyphen as the one difference that is equal', () => {
    const B = docOf([{ lines: ['a long para-', 'graph here'] }])
    const A = docOf([{ lines: ['a long paragraph', 'here'] }])
    const m = align(B, A)
    const hy = B.pages[0]!.glyphs.findIndex((g) => g.u === '-')
    expect(m.bToA[hy]).toBe(-1)
    expect(m.hunkB[hy]).toBe(HUNK.hyphen)
  })
  it('tries the Unicode key where another font program’s codes leave a stretch unmatched', () => {
    const B = docOf([{ lines: ['Theorem one holds'] }])
    const A = docOf([{ lines: [{ text: 'Theorem one holds', codeShift: 100 }] }])
    const m = align(B, A)
    expect(m.stretches[0]?.mode).toBe('uni')
    expect(mapped(B, A, m.bToA)).toBe('Theorem one holds')
  })
  it('moves a line across a page break where its partner is unique', () => {
    const B = docOf([{ lines: ['first page text', 'a footnote line'] }, { lines: ['second page text'] }])
    const A = docOf([{ lines: ['first page text'] }, { lines: ['second page text', 'a footnote line'] }])
    const m = align(B, A)
    expect(mapped(B, A, m.bToA)).toBe('first page text' + 'a footnote line' + 'second page text')
    expect(m.moves.length).toBeGreaterThan(0)
  })
  it('keeps a draft frame’s glyphs out of the sequence', () => {
    const B = docOf([
      {
        lines: ['Before', 'fig1.pdf', 'After'],
        points: [
          ['g1a', 6],
          ['g1b', 14],
        ],
      },
    ])
    const A = docOf([{ lines: ['Before', 'x axis', 'After'] }])
    const m = align(B, A)
    expect(Array.from(m.skipB.slice(6, 14))).toEqual(new Array(8).fill(1))
    expect(mapped(B, A, m.bToA)).toBe('Before' + '________' + 'After')
  })
  it('pairs a rule with A’s in the slot between the same glyphs, a path with an image too', () => {
    const B = docOf([{ lines: ['a over b'], boxes: [[2, 0, 72, 690, 90, 691]] }])
    const A = docOf([{ lines: ['a over b'], boxes: [[2, -3, 72, 689.8, 90, 690.8]] }])
    const m = align(B, A)
    expect(m.boxPage[0]![0]).toBe(1)
    expect(m.boxIndex[0]![0]).toBe(0)
    // other counts in the slot: no partner
    const A2 = docOf([
      {
        lines: ['a over b'],
        boxes: [
          [2, 0, 72, 690, 90, 691],
          [2, 0, 72, 680, 90, 681],
        ],
      },
    ])
    expect(align(B, A2).boxPage[0]![0]).toBe(0)
  })
  it('marks a glyph wholly outside its page’s view', () => {
    const B = docOf([{ lines: ['in', { text: 'out', y: 900 }] }])
    const m = align(B, B)
    expect(Array.from(m.offpageB)).toEqual([0, 0, 1, 1, 1])
  })
})
