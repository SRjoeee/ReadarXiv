// A unit's lay replayed from F2 to the round's last word (TAP.md §3, F1-F8 and `out`), each step's port given what the step
// before it made, as today's layOnce chains them (RUN:2255-2316): S.onLeadRetry (F3), X.numbered (F4), S.overFollower's
// verdict (F5), X.further or X.runs (F6), S.settle's (F7), S.share (F8); each step's answer against its slot, the round's
// layout against `out`; then the unit's fill leadings (L9, unitFillLeads RUN:2617). A step whose input the tap does not hold ends the chain there, and says which: S.overFollower taken
// (the follower's first line in the file), S.settle moving a line (a CJK cell's bands: the page's rules), X.further widening
// a CJK cell (its bands over the widened lines).
import { cellBands } from '../../src/unit/params.ts'
import { layoutCut } from '../../src/fit/cut.types.ts'
import { fitFurther } from '../../src/fit/further.ts'
import { numberedLayout, type NumberCrop } from '../../src/fit/numbered.ts'
import { layoutRuns } from '../../src/fit/runs.types.ts'
import type { FitBlock, FitParams, Layout, Tokens } from '../../src/fit/types.ts'
import { layoutUnit2 } from '../../src/fit/walk.types.ts'
import { type FillRules, type FillUnit, fillLeadsOf } from '../../src/shared/fill-leads.types.ts'
import { onLeadRetry } from '../../src/shared/on-lead.ts'
import { shareOf } from '../../src/shared/share.types.ts'
import { blockOfTap, layoutOf, linesOf, num, type WalkCase } from './fit-input.ts'
import { firstDifference, ledger } from './tap.ts'

type Raw = Record<string, unknown>
export type Chain = { at: string; d: string | null; stopped?: string; steps: string[] }

/** the shared row the follower is laid from, as its F1 slot holds it (the follower's last round that has one) */
const rowOf = (pair: string, follower: number) => {
  const u = ledger(pair).units.find((x) => x.ord === follower)
  const s = u?.slots.filter((x) => x.by === 'S.rowStart' && (x.value as Raw)?.row).at(-1)
  return (s?.value as { row: Raw } | undefined)?.row ?? null
}

/** the round replayed from F2 on: the first step whose answer differs (`at`, `d`), or where the chain stopped and why */
export function chain(c: WalkCase): Chain {
  const steps: string[] = []
  const P = c.P as FitParams
  const tokens0 = c.tokens as Tokens
  let blocks = c.blocks as FitBlock[]
  let { layout, tokens } = layoutCut(tokens0, blocks, c.s, P)
  let d =
    firstDifference(layoutOf(layout as Raw), c.want.layout, 'layout') ??
    firstDifference(linesOf(layout as Raw), c.want.layoutLines, 'lines')
  if (d) return { at: 'F2', d, steps }
  steps.push('F2')
  let unitP = P
  const walked = { layout, blocks, P: unitP }
  // F3 S.onLeadRetry
  const f1 = c.slot('S.rowStart', 'onLeadOf')
  const onLeadOf = f1?.onLeadOf as { start: number; startY: number | null } | null | undefined
  const f3 = c.slot('S.onLeadRetry')
  const lead = onLeadRetry(
    {
      layout,
      tokens: tokens0,
      blocks,
      s: c.s,
      P: unitP,
      onLeadOf: onLeadOf ? { start: onLeadOf.start, startY: onLeadOf.startY ?? undefined } : null,
    },
    layoutCut,
  )
  if (!!lead !== !!f3)
    return {
      at: 'F3',
      d: `S.onLeadRetry ${lead ? 'ran' : 'did not run'}, today's slot ${f3 ? 'is' : 'is not'} there`,
      steps,
    }
  if (lead && f3) {
    d =
      firstDifference(lead.taken, f3.taken, 'taken') ??
      firstDifference(layoutOf(lead.layout as Raw), f3.layout, 'layout') ??
      firstDifference(linesOf(lead.layout as Raw), f3.layoutLines, 'lines') ??
      firstDifference(layoutOf(lead.was as Raw), f3.wasLayout, 'wasLayout')
    if (d) return { at: 'F3', d, steps }
    steps.push('F3')
    if (lead.taken === 'as before') {
      blocks = lead.blocks
      layout = lead.layout
      tokens = lead.tokens!
    }
  }
  // F4 X.numbered
  const decor = c.slot('U.decor', 'numbered')
  const f4 = c.slot('X.numbered')
  const num4 = numberedLayout(
    {
      numbered: !!decor?.numbered,
      layout,
      tokens: tokens0,
      blocks,
      s: c.s,
      P: unitP,
      crop: (f4?.crop as NumberCrop | undefined) ?? null,
    },
    layoutUnit2,
  )
  if (!!num4 !== !!f4)
    return { at: 'F4', d: `X.numbered ${num4 ? 'ran' : 'did not run'}, today's slot ${f4 ? 'is' : 'is not'}`, steps }
  if (num4 && f4) {
    d =
      firstDifference(num4.taken, f4.taken, 'taken') ??
      firstDifference(layoutOf(num4.layout as Raw), f4.numberedLayout, 'layout') ??
      firstDifference(linesOf(num4.layout as Raw), f4.numberedLayoutLines, 'lines')
    if (d) return { at: 'F4', d, steps }
    steps.push('F4')
    if (num4.taken) {
      blocks = num4.blocks
      tokens = num4.tokens as Tokens
      unitP = num4.P
      layout = num4.layout
    }
  }
  // F5 S.overFollower (its verdict; taken, the run-in head is laid over the follower's first row, which the tap does not hold)
  const f5 = c.slot('S.overFollower')
  if (f5?.taken) return { at: 'F5', d: null, stopped: 'S.overFollower taken', steps }
  // F6 X.further or X.runs
  const further = c.slot('X.further'),
    runs6 = c.slot('X.runs')
  const kind = (ledger(c.pair).units.find((u) => u.ord === c.ord)?.kind ?? '') as string
  let runs: ReturnType<typeof layoutRuns> = null
  let whole: Layout | null = null
  if (layout.clipped) {
    if (!further) return { at: 'F6', d: 'clipped, and no X.further slot', steps }
    const wb = further.widenedBlocks as Raw[] | null
    const fl = further.furtherLayout as Raw | null
    if (wb && kind === 'cell' && unitP.cjk) return { at: 'F6', d: null, stopped: 'X.further widened a CJK cell', steps }
    const got = fitFurther(
      {
        rules: c.rules as FurtherInput['rules'],
        tokens: tokens0,
        blocks,
        s: c.s,
        P: unitP,
        walked: layout === walked.layout && blocks === walked.blocks && unitP === walked.P,
        wide: fl?.knob === 'widen' && wb ? (wb.map(blockOfTap) as FitBlock[]) : null,
        clearOf: (bs) => (unitP.cjk && kind === 'cell' ? cellBands(bs, () => null, c.s, unitP as never) : null),
      },
      layoutUnit2,
    )
    d =
      firstDifference(!!got, further.found, 'found') ??
      firstDifference(layoutOf((got?.layout ?? null) as Raw), fl, 'layout') ??
      firstDifference(linesOf((got?.layout ?? null) as Raw), further.furtherLayoutLines, 'lines')
    if (d) return { at: 'F6', d, steps }
    steps.push('F6 further')
    if (!got) return { at: 'out', d: null, stopped: 'left the original’s (X.further found none)', steps }
    layout = got.layout
    blocks = got.blocks
    if (got.P) unitP = got.P
  } else if (kind !== 'cell') {
    runs = layoutRuns(tokens, blocks, c.s, unitP, layout.lines)
    const want = runs6?.laidRuns as Raw | null | undefined
    const mine = runs
      ? {
          layout: layoutOf(runs.layout as Raw),
          lines: linesOf(runs.layout as Raw),
          runs: runs.runs.map((r) => ({
            bi0: r.bi0 ?? null,
            tokens: (r.tokens as unknown[] | undefined)?.length ?? 0,
            blocks: (r.blocks as unknown[] | undefined)?.length ?? 0,
            layout: layoutOf(r.layout as Raw),
          })),
        }
      : null
    d = firstDifference(mine, want ?? null, 'laidRuns')
    if (d) return { at: 'F6', d, steps }
    steps.push('F6 runs')
    if (runs) {
      whole = layout
      layout = runs.layout
    }
  }
  // F7 S.settle (a CJK cell's lines into their bands, which need the page's rules)
  const f7 = c.slot('S.settle')
  if (f7 && (f7.moved as number) > 0) return { at: 'F7', d: null, stopped: 'S.settle moved a line', steps }
  // F8 S.share
  const f8 = c.slot('S.share')
  if (f8) {
    // (the follower's lead row: its F1 slot's, or, where the follower is never laid, the row kept after this unit, which is
    // that row itself, keptAfter: shareOf reads its page, baseline and size alone)
    const kept = decor?.kept as { page: number; baseline: number; size: number; byLabel?: boolean } | null | undefined
    const row = rowOf(c.pair, f8.follower as number) ?? kept ?? null
    const share = row ? shareOf(layout, blocks, row as never, P.measure) : null
    if (share && kept && !kept.byLabel) share.kept = true
    const want = f8.share as Raw | null
    const mine = share
      ? Object.fromEntries(Object.entries(share).filter(([, v]) => v !== undefined && v !== false))
      : null
    d = firstDifference(
      mine,
      want ? Object.fromEntries(Object.entries(want).map(([k, v]) => [k, num(v)])) : null,
      'share',
    )
    if (d) return { at: 'F8', d, steps }
    steps.push('F8')
  }
  // out
  const out = c.slot('X.walk')
  if (!out) return { at: 'out', d: null, stopped: 'no X.walk slot (refused)', steps }
  d =
    firstDifference(layoutOf(layout as Raw), out.layout, 'out.layout') ??
    firstDifference(linesOf(layout as Raw), out.lines, 'out.lines')
  if (d) return { at: 'out', d, steps }
  steps.push('out')
  // L9 S.fill.leads: each run's, then the unit's (as one: its fit before its runs, `whole`), as unitFillLeads reads them
  const l9 = c.slot('S.fill.leads')
  if (!l9) return { at: 'L9', d: 'no S.fill.leads slot', steps }
  const R = c.rules as unknown as FillRules
  const unit: FillUnit = { tokens, blocks, s: c.s, P: unitP, layout: runs ? whole! : layout }
  const runUnits: FillUnit[] = (runs?.runs ?? []).map((r) => ({
    tokens: r.tokens,
    blocks: r.blocks,
    s: c.s,
    P: r.P!,
    layout: r.layout,
    parent: unit,
  }))
  for (const q of runUnits) fillLeadsOf(q, R)
  fillLeadsOf(unit, R)
  const fin = (v: unknown) => (typeof v === 'number' && !Number.isFinite(v) ? String(v) : (v ?? null))
  d = firstDifference(
    {
      fillLead: fin(unit.fillLead),
      fillTop: fin(unit.fillTop),
      fitLines: fin(unit.fitLines),
      state: (layoutOf(layout as Raw) as { state: unknown }).state,
      runs: runUnits.map((q) => [fin(q.fillLead), fin(q.fillTop), fin(q.fitLines)]),
    },
    l9,
    'fillLeads',
  )
  if (d) return { at: 'L9', d, steps }
  steps.push('L9')
  return { at: 'L9', d: null, steps }
}
type FurtherInput = Parameters<typeof fitFurther>[0]
