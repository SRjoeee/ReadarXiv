// The stored plan (src/plan.ts): what its writer, storedInstrumentOf, stores is what its reader, planOf, reads back, field by
// field (the options as the marked compile gave them, Maps and Sets as such, `decorated` and `lineskip` where they are, the
// .bbl's bytes, the original's facts), B and the log as they were given; and a plan whose options would not read back is not
// stored at all. Every value is made here.
import { describe, expect, test } from 'vitest'
import { FROM_UTF8, planOf, storedInstrumentOf, unkeep } from '../src/plan.ts'

const B = new Uint8Array([37, 80, 68, 70, 45, 49, 46, 53])
const LOG = 'This is pdfTeX, Version 3.141592653-2.6-1.40.26 (TeX Live 2024)\nOutput written on main.pdf (1 page).\n'
const FACTS = { pages: 3, day: 1_700_000_000, banner: '2024' }
/** every byte value, a length whose base64 ends in a pad */
const BBL = { path: 'main.bbl', bytes: Uint8Array.from({ length: 257 }, (_, i) => i % 256) }
const OPTIONS = {
  texts: new Map([['\\hlg', 'All good.']]),
  inkless: new Set(['\\noink']),
  lineskip: [1, 0],
  decorated: [['\\hlg', 'All good.']],
}

describe('the stored plan, written and read back', () => {
  test('the reader reads what the writer wrote: each option, the .bbl and the facts; B and the log as given', () => {
    const stored = storedInstrumentOf({ finalPdf: B, log: LOG, options: OPTIONS, bbl: BBL, facts: FACTS })
    if (!stored) throw new Error('the writer kept no plan')
    expect(Object.keys(stored)).toEqual(['b.pdf', 'log', 'plan', 'definitions'])
    expect(stored['b.pdf']).toBe(B)
    expect(FROM_UTF8.decode(stored.log)).toBe(LOG)
    expect(FROM_UTF8.decode(stored.definitions)).toBe('{"front":"today","definitions":null}')
    const read = planOf(stored)
    if (!read) throw new Error('the reader read no plan')
    expect([read.front, read.v]).toEqual(['today', 1])
    expect(unkeep(read.texts)).toStrictEqual(OPTIONS.texts)
    expect(unkeep(read.inkless)).toStrictEqual(OPTIONS.inkless)
    expect(read.lineskip && unkeep(read.lineskip)).toStrictEqual(OPTIONS.lineskip)
    expect(read.decorated && unkeep(read.decorated)).toStrictEqual(OPTIONS.decorated)
    expect(read.bbl?.path).toBe(BBL.path)
    expect(read.bbl?.bytes).toEqual(BBL.bytes)
    expect(read.facts).toEqual(FACTS)
  })
  test('the plan in the order of its keys, the .bbl as padded base64, an option the compile gave none of absent', () => {
    const stored = storedInstrumentOf({
      finalPdf: B,
      log: LOG,
      options: { texts: null, inkless: OPTIONS.inkless },
      bbl: null,
      facts: { ...FACTS, day: null, banner: null },
    })
    if (!stored) throw new Error('the writer kept no plan')
    expect(FROM_UTF8.decode(stored.plan)).toBe(
      '{"front":"today","v":1,"texts":null,"inkless":{"set":["\\\\noink"]},"bbl":null,"facts":{"pages":3,"day":null,"banner":null}}',
    )
    const read = planOf(stored)
    expect(read && [read.lineskip, read.decorated, read.bbl]).toEqual([undefined, undefined, null])
    const withBbl = storedInstrumentOf({ finalPdf: B, log: LOG, options: OPTIONS, bbl: BBL, facts: FACTS })
    const json = JSON.parse(FROM_UTF8.decode(withBbl?.plan ?? new Uint8Array())) as { bbl: { bytes: string } }
    expect(json.bbl.bytes).toBe(Buffer.from(BBL.bytes).toString('base64'))
  })
  test('options that would not read back as they are: no plan stored', () => {
    expect(
      storedInstrumentOf({ finalPdf: B, log: LOG, options: { ...OPTIONS, texts: 1n }, bbl: null, facts: FACTS }),
    ).toBe(null)
  })
})
