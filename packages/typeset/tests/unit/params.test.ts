// U.params on synthetic units: the branches the sample does not show (a unit of no glyph read, a formula's style, no pitch to
// read the leading against) and the edges' label part.
import { describe, expect, it } from 'vitest'
import type { Block } from '../../src/unit/blocks.ts'
import { baseStyleOf, cjkAdvance, leadOf, params, sizeOf } from '../../src/unit/params.ts'

const unit = { kind: 'para', pieces: [] }
const block = (pitch0: number | null) => ({ pitch0 }) as Block

describe('U.params', () => {
  it('lays a unit of no glyph read at its lines’ median height over 0.894', () => {
    expect(
      sizeOf({ orig: null }, { cjk: false }, unit, [
        [1, 0, 100, 10, 108.94],
        [1, 0, 80, 10, 89.94],
        [1, 0, 60, 10, 66],
      ]),
    ).toBeCloseTo(10, 9)
    expect(sizeOf({ orig: { size: 9.96 } }, { cjk: true }, unit, [])).toBe(9.96)
  })

  it('sets a unit whose original is a formula’s, or none, in serif, bold for a heading', () => {
    expect(baseStyleOf({ orig: { size: 9, st: { fam: 'math' } } }, 'heading', 'cm')).toEqual({
      fam: 'serif',
      bold: true,
      italic: false,
      caps: false,
      design: 'cm',
    })
    expect(baseStyleOf({ orig: { size: 9, st: { fam: 'sans', bold: true } } }, 'para', 'cm')).toEqual({
      fam: 'sans',
      bold: true,
    })
  })

  it('leads by the script’s leading of a solid-set original, never closer than the original’s pitch', () => {
    expect(leadOf([block(null)], 10, { leadBase: 1.3 })).toBe(1.3)
    expect(leadOf([block(12.5)], 10, { leadBase: 1 })).toBe(1)
    expect(leadOf([block(12.5), block(18), block(15)], 10, { leadBase: 1.3 })).toBe(1.083)
    expect(leadOf([block(30)], 10, { leadBase: 1.3 })).toBe(1)
  })

  it('gives back the em a CJK face’s size correction takes, in a CJK target alone', () => {
    expect(cjkAdvance(true, 0.959)).toBe(0.041)
    expect(cjkAdvance(true, 1)).toBe(0)
    expect(cjkAdvance(false, 0.959)).toBe(0)
  })

  it('tells a first line alone only where no label kept as the original’s stands before it; none for a cell', () => {
    const i = {
      kind: 'para',
      blocks: [block(12)],
      s: 10,
      P: { leadBase: 1 },
      label: { drawn: undefined },
      edges: { first: true, last: false, below: 14 },
      rulesOf: () => null,
      cjkSize: undefined,
      lineskip: null,
      heading: false,
      numbered: false,
    }
    expect(params(i).P.halfLead).toEqual({ head: false, foot: false, below: 14 })
    expect(params({ ...i, label: { drawn: 'Satz 1.' } }).P.halfLead).toEqual({ head: true, foot: false, below: 14 })
    expect(params({ ...i, kind: 'cell' }).P.halfLead).toBeNull()
    expect(params({ ...i, heading: true }).P.lastLines).toBe(true)
    expect(params({ ...i, heading: true, numbered: true }).P.lastLines).toBe(false)
  })
})
