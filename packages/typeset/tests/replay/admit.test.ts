// U.admit replayed on the tap's sample: decide's inputs as today's run held them (U.admit:in: the row, the file's unit, the
// units file's pieces, the bundle's kind and group, the wrap's verdict, the toggles', the pages shown), each row piece's
// class (lanes/L3/replay/U.admit.json.gz); against the verdict today recorded (U.admit:out).
import { describe, expect, it } from 'vitest'
import { type AdmitInput, type Admission, admit, refusalOf, type V0Row } from '../../src/unit/admit.ts'
import { derived, firstDifference, hasDerived, hasTap, roundsOf, sample } from './tap.ts'

type In = {
  c?: { rects?: number[][] }
  u: V0Row
  inK?: boolean
  lu: AdmitInput['lu']
  pieces?: AdmitInput['pieces']
  kind?: string
  group?: string | null
  unhidden?: string | null
  textGroup?: boolean
  shown?: boolean
  N?: number
  symbols?: 'text' | 'strict'
  refusal?: string | null
}

describe.skipIf(!hasTap || !hasDerived('U.admit'))('U.admit: replayed on the tap', () => {
  it('gives today’s verdict on every sampled unit', () => {
    const facts = derived<{ cases: Record<string, { clsProven: (string | null)[] }> }>('U.admit').cases
    const differ: string[] = []
    const codes = new Map<string, number>()
    let n = 0
    for (const e of sample('U.admit').entries)
      for (const [round, c] of roundsOf(e)) {
        const a = c['U.admit:in'] as In | undefined,
          want = c['U.admit:out'] as Admission | undefined
        if (!a || !want) continue
        n++
        const account = a.inK === false
        const i: AdmitInput = {
          row: a.u,
          lu: a.lu,
          pieces: a.pieces,
          clsProven: facts[`${e.pair}|${e.ord}|${round}`]?.clsProven ?? [],
          kind: a.kind,
          group: a.group,
          unhidden: a.unhidden ?? null,
          textGroup: !!a.textGroup,
          shown: a.shown !== false,
          rects: a.c?.rects,
          N: a.N ?? Infinity,
          symbols: a.symbols ?? 'text',
          // (the maker's reason it is not located, B19: the file's, which the verdict alone records)
          unlaid: !want.ok ? (want.unlaid ?? null) : null,
        }
        const got = admit(i, { account })
        const key = got.ok ? 'ok' : String(got.code)
        codes.set(key, (codes.get(key) ?? 0) + 1)
        const d =
          firstDifference(got, want) ??
          (account ? firstDifference(refusalOf(i, a.u), a.refusal ?? null, 'refusal') : null)
        if (d) differ.push(`${e.pair} ord ${e.ord} round ${round}: ${d}`)
      }
    expect(differ).toEqual([])
    expect(n).toBe(27)
    expect(Object.fromEntries(codes)).toEqual({ ok: 3, null: 3, lost: 3, unhidden: 6, unlocated: 12 })
  })
})
