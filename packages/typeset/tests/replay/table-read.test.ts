// S.table.read replayed on every call of the corpus: each group the run read (the ledgers' `tables`: its members in order with
// the facts the rule reads, whether the open gave the groups), against the cells and the split today recorded, and each
// translated member's `kept` against the tap's.
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { type GroupMember, tableRead } from '../../src/shared/table-read.ts'
import { firstDifference, hasTap, ledger, TAP } from './tap.ts'

type Group = {
  group: string
  byOpen: boolean
  ids: number[]
  per: (GroupMember & { kept: boolean | null })[]
  cells: number[] | null
  split: boolean
}

describe.skipIf(!hasTap)('S.table.read: replayed on every call of the corpus', () => {
  it('reads every group as today did', { timeout: 120_000 }, () => {
    const differ: string[] = []
    const count = { groups: 0, cells: 0, split: 0, kept: 0, byOpen: 0 }
    for (const f of readdirSync(join(TAP, 'ledgers'))) {
      const pair = f.replace(/\.ledger\.json\.gz$/, '')
      for (const g of (ledger(pair) as unknown as { tables: Group[] }).tables) {
        count.groups++
        if (g.byOpen) count.byOpen++
        const got = tableRead(g.per, g.byOpen)
        if (got.cells) count.cells++
        if (got.split) count.split++
        if (got.kept.some(Boolean)) count.kept++
        const d =
          firstDifference(
            g.per.map((m) => m.id),
            g.ids,
            'ids',
          ) ??
          firstDifference(got.cells, g.cells, 'cells') ??
          firstDifference(got.split, g.split, 'split') ??
          firstDifference(
            got.kept,
            g.per.map((m) => m.kept),
            'kept',
          )
        if (d) differ.push(`${pair} ${g.group}: ${d}`)
      }
    }
    expect(differ).toEqual([])
    // (every group was given by the open: a group read from its rows alone is synthetic, tests/unit/table-read.test.ts)
    expect(count).toEqual({ groups: 2059, cells: 1496, split: 17, kept: 1, byOpen: 2059 })
  })
})
