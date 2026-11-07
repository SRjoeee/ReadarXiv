// S.fill.target replayed on every call of the corpus: the ledgers' passes hold each call's whole input and output
// (baseline/tap/TAP.md §3 L10), 3,014 page passes over the 123 reader dumps.
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { fillTarget, type Voter } from '../../src/shared/fill-target.ts'
import { firstDifference, hasTap, readGz, TAP } from './tap.ts'

type V = { id: number; kind: string; refused?: boolean; fillLead: number | string | null; fitLines: number }
type Pass = { target?: { input: { units: V[]; continuing: V[]; band: number }; output: unknown } }
/** a number as the tap writes it: a non-finite one as its string */
const fin = (v: number | null) => (typeof v === 'number' && !Number.isFinite(v) ? String(v) : v)
const voter = (x: V): Voter => ({
  kind: x.kind,
  refused: x.refused,
  fillLead: typeof x.fillLead === 'string' ? Number(x.fillLead) : x.fillLead,
  fitLines: x.fitLines,
})

describe.skipIf(!hasTap)('S.fill.target: replayed on every call of the corpus', () => {
  it('equals today’s pageTarget on every page pass', { timeout: 120_000 }, () => {
    const differ: string[] = []
    let n = 0
    const files = readdirSync(join(TAP, 'ledgers'))
      .filter((f) => f.endsWith('.ledger.json.gz'))
      .sort()
    expect(files).toHaveLength(123)
    for (const f of files) {
      const L = readGz(join(TAP, 'ledgers', f)) as { pair: string; passes: Pass[] }
      L.passes.forEach((p, i) => {
        if (!p.target) return
        n++
        const { units, continuing, band } = p.target.input
        const r = fillTarget(units.map(voter), continuing.map(voter), band)
        const got = r ? { target: fin(r.target), own: fin(r.own), anchor: fin(r.anchor), body: r.body } : null
        const d = firstDifference(got, p.target.output)
        if (d) differ.push(`${L.pair} pass ${i}: ${d}`)
      })
    }
    expect(differ).toEqual([])
    expect(n).toBe(3014)
  })
})
