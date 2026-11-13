// S.table.settle replayed on every call of the corpus: each group the run settled (the ledgers' `settles`), its cells' lays' last
// word (refused, or laid and whether clipped) from their last rounds, against the verdict today recorded; but a group today
// withheld whole for its cells' two pages, which the rule lays like any other (PDF-READER §18.72): its verdict counted apart.
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { tableSettle } from '../../src/shared/table-settle.ts'
import { firstDifference, hasTap, ledger, TAP } from './tap.ts'

type Settle = { group: string; ids: number[]; why: string | null }

describe.skipIf(!hasTap)('S.table.settle: replayed on every call of the corpus', () => {
  it('paints or withholds every group as today did, but a group on two pages, painted where its cells are', { timeout: 120_000 }, () => {
    const differ: string[] = []
    const count: Record<string, number> = { groups: 0 }
    for (const f of readdirSync(join(TAP, 'ledgers'))) {
      const pair = f.replace(/\.ledger\.json\.gz$/, '')
      const L = ledger(pair)
      for (const g of (L as unknown as { settles: Settle[] }).settles) {
        count.groups!++
        const cells = g.ids.map((id) => {
          const u = L.units.find((x) => x.ord === id)!
          const last = Math.max(...u.slots.map((s) => s.round))
          const out = u.slots.filter((s) => s.round === last && s.step === 'out')
          const walk = out.find((s) => s.by === 'X.walk')?.value as { layout?: { clipped?: boolean } } | undefined
          return {
            refused: out.some((s) => s.by === 'refused'),
            clipped: !!walk?.layout?.clipped,
          }
        })
        const got = tableSettle(cells)
        const key = g.why === 'on two pages' ? `on two pages, now ${String(got)}` : String(got)
        count[key] = (count[key] ?? 0) + 1
        if (g.why === 'on two pages') continue
        const d = firstDifference(got, g.why, 'why')
        if (d) differ.push(`${pair} ${g.group}: ${d}`)
      }
    }
    expect(differ).toEqual([])
    // (the 15 groups today withheld for their two pages: every cell of each laid by its last round, each painted)
    expect(count).toEqual({ groups: 1479, null: 1390, 'a cell unfit': 74, 'on two pages, now null': 15 })
  })
})
