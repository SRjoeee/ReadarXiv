// S.table.settle replayed on every call of the corpus: each group the run settled (the ledgers' `settles`), its cells' pages
// from their U.admit verdicts and their lays' last word (refused, or laid and whether clipped) from their last rounds,
// against the verdict today recorded.
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { tableSettle } from '../../src/shared/table-settle.ts'
import { firstDifference, hasTap, ledger, TAP } from './tap.ts'

type Settle = { group: string; ids: number[]; why: string | null }

describe.skipIf(!hasTap)('S.table.settle: replayed on every call of the corpus', () => {
  it('paints or withholds every group as today did', { timeout: 120_000 }, () => {
    const differ: string[] = []
    const count: Record<string, number> = { groups: 0 }
    for (const f of readdirSync(join(TAP, 'ledgers'))) {
      const pair = f.replace(/\.ledger\.json\.gz$/, '')
      const L = ledger(pair)
      for (const g of (L as unknown as { settles: Settle[] }).settles) {
        count.groups!++
        const cells = g.ids.map((id) => {
          const u = L.units.find((x) => x.ord === id)!
          const admit = u.slots.find((s) => s.by === 'U.admit' && (s.value as { ok?: boolean })?.ok)?.value as
            | { pages: number[] }
            | undefined
          const last = Math.max(...u.slots.map((s) => s.round))
          const out = u.slots.filter((s) => s.round === last && s.step === 'out')
          const walk = out.find((s) => s.by === 'X.walk')?.value as { layout?: { clipped?: boolean } } | undefined
          return {
            pages: admit?.pages ?? [],
            refused: out.some((s) => s.by === 'refused'),
            clipped: !!walk?.layout?.clipped,
          }
        })
        const got = tableSettle(cells)
        count[String(got)] = (count[String(got)] ?? 0) + 1
        const d = firstDifference(got, g.why, 'why')
        if (d) differ.push(`${pair} ${g.group}: ${d}`)
      }
    }
    expect(differ).toEqual([])
    expect(count).toEqual({ groups: 1479, null: 1390, 'a cell unfit': 74, 'on two pages': 15 })
  })
})
