// A run's style from its characters (unit/lead.ts styleOfChars) on synthetic characters: a formula's characters passed over.
import { describe, expect, it } from 'vitest'
import { type LeadChar, styleOfChars } from '../../src/unit/lead.ts'

const ch = (c: string, x0: number, st: LeadChar['st'] = { fam: 'serif', italic: true, design: 'cm', fill: 0 }) => ({
  ch: c,
  x0,
  x1: x0 + 4,
  page: 3,
  st,
})

describe('U.lead', () => {
  it('styles a run by its first character not a formula’s, the paper’s serif where its font tells no design', () => {
    expect(
      styleOfChars([ch('x', 0, { fam: 'math' }), ch('.', 4, { fam: 'sans', bold: true, fill: 0x112233 })], 'cm'),
    ).toEqual({ fam: 'sans', bold: true, italic: false, caps: false, design: 'cm', color: '#112233' })
    expect(styleOfChars([ch('x', 0, { fam: 'math', fill: 0 })], 'times')).toEqual({
      fam: 'serif',
      bold: false,
      italic: false,
      caps: false,
      design: 'times',
      color: undefined,
    })
  })
})
