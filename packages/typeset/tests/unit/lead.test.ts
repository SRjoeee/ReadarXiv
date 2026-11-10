// U.lead on synthetic leads: what the tap's capture does not hold (the first line moved to the name's start, the joint's
// conditions, the name's record undone, a joint's style from a formula's characters).
import { describe, expect, it } from 'vitest'
import { jointOf, type LeadChar, type LeadInput, lead, styleOfChars, unlead } from '../../src/unit/lead.ts'

const ch = (c: string, x0: number, st: LeadChar['st'] = { fam: 'serif', italic: true, design: 'cm', fill: 0 }) => ({
  ch: c,
  x0,
  x1: x0 + 4,
  page: 3,
  st,
})
const ld = {
  nm: { page: 3, x0: 57.6, x1: 80.78, size: 9.96, glue: 4.98, occurrence: 2 },
  text: 'Beweis',
  st: { fam: 'serif', bold: false, italic: true, caps: false, design: 'cm' },
  chars: [...'Proof'].map((c, i) => ch(c, 57.6 + 4.6 * i)),
  rec: { drawn: false, why: 'inline: its unit not drawn', chars: [] },
}
const base: LeadInput = {
  ld,
  joint: [ch('.', 80.8)],
  firstPage: 3,
  nameShown: true,
  labelKept: false,
  relabels: true,
  size0: null,
  serif: 'cm',
}

describe('U.lead', () => {
  it('starts the first line where the name does, its glue in em of the name’s size where the file states none', () => {
    const got = lead(base, 72)!
    expect(got.x0).toBe(57.6)
    expect(got.lead.gap).toBe(4.98 / 9.96)
    expect(got.label).toMatchObject({ text: 'Proof.', drawn: 'Beweis.', x1: 84.8 })
    expect(got.rec).toMatchObject({ drawn: true, why: null, size: 9.96, x: 57.6 })
    expect(lead(base, 50)!.x0).toBeNull()
  })

  it('draws a joint anew only where its unit’s label group hides it; a name with no joint whatever', () => {
    expect(lead({ ...base, relabels: false }, 72)).toBeNull()
    expect(lead({ ...base, relabels: false, joint: [] }, 72)?.lead.parts).toEqual([{ text: 'Beweis', st: ld.st }])
    expect(lead({ ...base, joint: null }, 72)).toBeNull()
    expect(lead({ ...base, ld: null }, 72)).toBeNull()
  })

  it('reads the joint only on the name’s page, the name’s group shown, the unit’s label not kept', () => {
    const j = [ch('.', 80.8)]
    expect(jointOf(base, j)).toBe(j)
    expect(jointOf({ ...base, firstPage: 4 }, j)).toBeNull()
    expect(jointOf({ ...base, nameShown: false }, j)).toBeNull()
    expect(jointOf({ ...base, labelKept: true }, j)).toBeNull()
    expect(jointOf({ ...base, ld: null }, j)).toBeNull()
  })

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

  it('undoes the name’s record where its unit is left the original’s after all', () => {
    expect(unlead({ drawn: true, why: null, size: 9.96, x: 57.6, chars: ld.chars }, 'unfit')).toEqual({
      drawn: false,
      why: 'inline: unfit',
      chars: [],
    })
    expect(unlead({ drawn: true, why: null }, undefined).why).toBe('inline: its unit unfit')
  })
})
