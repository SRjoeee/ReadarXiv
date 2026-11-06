// U.rename replayed on the tap: the unit's resolutions as prepareUnit left them (U.elements:out), the target, babel's names
// in it and the paper's own name units' translations as today's run handed them (U.rename:in; for a reading another rule's
// sample captured, the same pair's: they are the run's, given whole at the open), the packages' names from today's
// tex-names.json; against the replacements today's renameRefs wrote (U.rename:out, and the ledger's U.rename slot).
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { type Rename, refNamesOf, rename, type TexNamesData } from '../../src/unit/rename.ts'
import { firstDifference, hasTap, hasToday, ledgerRound, readings, roundsOf, sample, slotOf, todayFile } from './tap.ts'

type In = { labels: unknown; to: string; names: Record<string, string> | null; ownNames: Map<string, string> | null }
type Prep = Map<number, { mode: string; sup?: boolean; src?: string; text?: string }>

describe.skipIf(!hasTap || !hasToday)('U.rename: replayed on the tap', () => {
  // read when a test runs, never while the file is collected: a skipped suite's body still runs, and CI holds no copy
  let names: TexNamesData | undefined
  const NAMES = () => (names ??= JSON.parse(readFileSync(todayFile('rules/tex-names.json'), 'utf8')) as TexNamesData)
  const run = (prep: Prep, a: In) =>
    [...rename(prep, refNamesOf(NAMES(), a.to), a.labels ? a.names : null, a.ownNames)].map(
      ([k, x]) => [k, x] as [number, Rename[]],
    )

  it('renames as today did on every sampled round', () => {
    const differ: string[] = []
    const count = { rounds: 0, renamed: 0 }
    for (const e of sample('U.rename').entries)
      for (const [round, c] of roundsOf(e)) {
        const a = c['U.rename:in'] as In | undefined,
          want = c['U.rename:out'] as [number, Rename[]][] | undefined,
          prep = c['U.elements:out'] as Prep | undefined
        if (!a || !want || !prep) continue
        count.rounds++
        const got = run(prep, a)
        if (got.length) count.renamed++
        const d = firstDifference(got, want, 'renames')
        if (d) differ.push(`${e.pair} ord ${e.ord} round ${round}: ${d}`)
      }
    expect(differ).toEqual([])
    expect(count).toEqual({ rounds: 6, renamed: 3 })
  })

  it('equals the ledger’s U.rename slot on every sampled reading of a pair whose run’s names the tap captured', () => {
    // (the run's inputs, by pair: U.rename:in and U.label:in hold the same run's target, babel names and own names)
    const runOf = new Map<string, In>()
    for (const rule of ['U.rename', 'U.label'])
      for (const e of sample(rule).entries)
        for (const c of roundsOf(e).values()) {
          const a = (c['U.rename:in'] ?? c['U.label:in']) as In | undefined
          if (a && !runOf.has(e.pair)) runOf.set(e.pair, a)
        }
    const differ: string[] = []
    const count = { readings: 0, givenUp: 0, candidates: 0, renamed: 0 }
    for (const r of readings()) {
      const a = runOf.get(r.e.pair)
      if (!a) continue
      const prep = r.c['U.elements:out'] as Prep
      const round = ledgerRound(r.e, r.round)
      if (round === null) {
        count.givenUp++
        continue
      }
      const want =
        round === undefined
          ? undefined
          : (slotOf(r.e.pair, r.e.ord, round, 'U.rename') as { renames: [number, Rename[]][] } | undefined)
      if (!want) {
        differ.push(`${r.key}: no U.rename slot`)
        continue
      }
      count.readings++
      if ([...prep.values()].some((x) => x?.mode === 'orig-text' && /^\\(?:[a-zA-Z]*ref|cite)/.test(x.src ?? '')))
        count.candidates++
      const got = run(prep, a)
      if (got.length) count.renamed++
      const d = firstDifference(got, want.renames, 'renames')
      if (d) differ.push(`${r.key}: ${d}`)
    }
    expect(differ).toEqual([])
    // (22 of them hold a reference or a citation drawn as the page's text; 3 renamed)
    expect(count).toEqual({ readings: 38, givenUp: 2, candidates: 22, renamed: 3 })
  })
})
