// S.fill.page's pass (design-b §1.6 L10): page f's fill over the units laid on it, those begun on f filled (a unit laid in
// runs a run at a time, then joined as one again and settled), those running on to f from a page before voting only. Ported
// from engine 065c1d973 run.mjs fillPass RUN:2365-2394, without its records (the gate's) and its paint (the reader's): it
// returns what each unit filled took. The fill (fillPage) is today's code moved (fill-page.ts).
import { joinRuns } from '../fit/runs.ts'
import type { FitBlock, Layout } from '../fit/types.ts'
import type { Token } from '../breaker/tokens.ts'
import type { FillTarget } from './fill-target.ts'
import { type FillLaid, type FillTrace, fillPage, fillUnitsOf, type PageRules } from './fill-page.ts'
import { settleLayout } from './settle.ts'

/** a unit laid on the page: whether the fill may take it, whether it was refused, its pages */
export type PassUnit = FillLaid & { fillable?: boolean; pages: readonly number[] }
/** a unit the fill took: its page's target, its fill leading (the unit's as one where it was laid in runs) */
export type Filled = {
  p: PassUnit
  target: number
  fillLead: number | null | undefined
  runs?: (number | null | undefined)[]
}

/** S.fill.page on page `pg`: `laid`, every unit laid with a line on it, in the order they were laid (RUN:2365 fillPass) */
export function fillPass(
  pg: number,
  laid: readonly PassUnit[],
  P: PageRules,
  trace: FillTrace | null = null,
): { told: FillTarget | null; filled: Filled[] } {
  const ok = laid.filter((p) => p.fillable && !p.refused)
  const begun = ok.filter((p) => p.pages[0] === pg)
  const { units, ...told } = fillUnitsOf(
    begun,
    ok.filter((p) => p.pages[0] !== pg),
  )
  const filled: Filled[] = []
  const runs = new Map<PassUnit, number>()
  const target = fillPage(
    units,
    P,
    (q, t) => {
      if (q.parent) {
        runs.set(q.parent as PassUnit, t)
        return
      }
      filled.push({ p: q as PassUnit, target: t, fillLead: q.fillLead })
    },
    { ...told, trace },
  )
  for (const [p, t] of runs) {
    p.layout = joinRuns(
      (p.runs ?? []) as unknown as { bi0: number; blocks: FitBlock[]; tokens: Token[]; layout: Layout }[],
    )
    settleLayout(p, p.layout)
    filled.push({ p, target: t, fillLead: p.fillLead, runs: (p.runs ?? []).map((q) => q.fillLead) })
  }
  // (the layouts the fill leadings found are the pass's alone: dropped for every unit on the page, RUN:2394 dropFillLaid)
  for (const p of laid) {
    delete p.fillLaid
    for (const q of p.runs ?? []) delete q.fillLaid
  }
  return { told: target, filled }
}
