// One member's lay from its setting and tokens (design-b §1.6, layFlow's F2-F8, the round's `out`, L9): its fit's walk over
// its frame breaks (X.cut with X.walk inside), laid again on its lead's row where it fell lower (S.onLeadRetry), a numbered
// heading on its last lines (X.numbered), a run-in head over its follower's first row (S.overFollower), its further steps
// where clipped (X.further) else its runs (X.runs), a CJK cell settled into its bands (S.settle), the row it leaves its
// follower (S.share); then its fill leadings (S.fill.leads). Today's layOnce RUN:2255-2316 and unitFillLeads RUN:2617-2624, as
// tests/replay/round.ts proved them step by step against the tap on every round of the corpus; each step's answer is written
// to the trace in the tap's slot.
import { layoutCut } from '../fit/cut.ts'
import { fitFurther } from '../fit/further.ts'
import { type NumberCrop, numberedLayout } from '../fit/numbered.ts'
import { layoutRuns } from '../fit/runs.ts'
import type { FitBlock, FitParams, Layout, Tokens } from '../fit/types.ts'
import { layoutUnit2 } from '../fit/walk.ts'
import { fillLeadsOf } from '../shared/fill-leads.types.ts'
import type { FillLaid } from '../shared/fill-page.ts'
import { onLeadRetry } from '../shared/on-lead.ts'
import { type OverFollowerInput, overFollower } from '../shared/over-follower.ts'
import { settleLayout } from '../shared/settle.ts'
import { type Share, shareOf } from '../shared/share.ts'
import type { Json, RuleParams, Unlaid } from '../types.ts'
import { type Band, cellBands } from '../unit/params.ts'
import { fin, layoutOf, linesOf, stateOf, type Trace } from './trace.ts'

type Clear = { cap: number; bands: Map<number, Band[]> } | null

/** a member as its setting (L6) and tokens (L7) and its row's start (F1) leave it: what its lay reads */
export type Prepared = {
  ord: number
  kind: string
  /** its pages (U.admit's) */
  pages: readonly number[]
  /** its measured tokens, the label crops set before its first line among them (F1's row label, U.decor's carried label) */
  tokens: Tokens
  /** its blocks as U.decor and F1 left them */
  blocks: FitBlock[]
  s: number
  /** the target's rules with U.params' own, the call's measure and patterns */
  P: FitParams
  /** U.params' bands of a CJK cell, and the page's rules they are read over (Room.band) */
  clear: Clear
  rulesOf: (page: number) => readonly number[] | null | undefined
  /** a numbered heading (U.decor) and its number's crop (X.numbered) */
  numbered: boolean
  numberCrop: NumberCrop | null
  /** laid on from its lead's row (S.rowStart's onLeadOf) */
  onLeadOf: { start: number; startY?: number | undefined } | null
  /** something kept after it on its last row (U.decor's keptAfter) */
  kept: { page: number; baseline: number; size: number; x1?: number; byLabel?: boolean } | null
  /** the member after it on its last row, as S.overFollower reads it; null where none follows */
  follower: OverFollowerInput['follower']
  /** the row the member after it is laid from (its lead row), which S.share reads; null where none follows */
  shareRow: { page: number; baseline: number; size: number } | null
  /** its single-line blocks widened over the paper beside them (Room.side), X.further's; null where none grows */
  wide: FitBlock[] | null
  /** laid again in its row alone (S.relay) */
  noOver?: boolean
}
/** a member's lay: laid, with what the fill takes of it, or left the original's and why */
export type MemberLay = { state: 'laid'; lay: FillLaid; over: boolean } | { state: Unlaid }

/** layFlow's F2-F8 and L9 for one member: its lay, each step written to `trace` */
export function layMember(p: Prepared, R: RuleParams, trace: Trace | null = null): MemberLay {
  const put = (step: Parameters<Trace['put']>[0], by: Parameters<Trace['put']>[1], v: Json) => trace?.put(step, by, v)
  const P = p.P
  const tokens0 = p.tokens
  let blocks = p.blocks
  let unitP = P
  let clear = p.clear
  // F2 X.cut (X.walk inside)
  let { layout, tokens } = layoutCut(tokens0, blocks, p.s, P)
  put('F2', 'X.cut', { layout: layoutOf(layout), layoutLines: linesOf(layout) })
  const walked = { layout, blocks, P: unitP }
  // F3 S.onLeadRetry
  const lead = onLeadRetry(
    {
      layout,
      tokens: tokens0,
      blocks,
      s: p.s,
      P: unitP,
      onLeadOf: p.onLeadOf ? { start: p.onLeadOf.start, startY: p.onLeadOf.startY ?? undefined } : null,
    },
    layoutCut,
  )
  if (lead) {
    put('F3', 'S.onLeadRetry', {
      taken: lead.taken,
      layout: layoutOf(lead.layout),
      layoutLines: linesOf(lead.layout),
      wasLayout: layoutOf(lead.was),
    })
    if (lead.taken === 'as before') {
      blocks = lead.blocks
      layout = lead.layout
      tokens = lead.tokens!
    }
  }
  // F4 X.numbered
  const num = numberedLayout(
    { numbered: p.numbered, layout, tokens: tokens0, blocks, s: p.s, P: unitP, crop: p.numberCrop },
    layoutUnit2,
  )
  if (num) {
    put('F4', 'X.numbered', {
      taken: num.taken,
      numberedLayout: layoutOf(num.layout),
      numberedLayoutLines: linesOf(num.layout),
    })
    if (num.taken) {
      blocks = num.blocks
      tokens = num.tokens as Tokens
      unitP = num.P
      layout = num.layout
    }
  }
  // F5 S.overFollower
  let overTaken = false
  if (p.follower && !p.noOver) {
    const over = overFollower(
      { kind: p.kind, follower: p.follower, kept: !!p.kept, pages: p.pages, layout, tokens, blocks, s: p.s, P: unitP },
      layoutCut,
    )
    put('F5', 'S.overFollower', {
      taken: !!over,
      follower: p.follower.id,
      ...(over ? { overLayout: layoutOf(over.layout), overLayoutLines: linesOf(over.layout) } : {}),
    })
    if (over) {
      overTaken = true
      blocks = over.blocks
      layout = over.layout
      tokens = over.tokens
    }
  }
  // F6 X.further where clipped, else X.runs
  let runs: ReturnType<typeof layoutRuns> = null
  let whole: Layout | null = null
  if (layout.clipped) {
    const got = fitFurther(
      {
        // (the unit's own: the target's, but a floor U.params sets, a line of the page's head or foot)
        rules: unitP as unknown as { further: readonly string[]; floor: number; floorMin: number },
        tokens: tokens0,
        blocks,
        s: p.s,
        P: unitP,
        walked: layout === walked.layout && blocks === walked.blocks && unitP === walked.P,
        wide: p.wide,
        clearOf: (bs) => (unitP.cjk && p.kind === 'cell' ? cellBands(bs, p.rulesOf, p.s, unitP as never) : null),
      },
      layoutUnit2,
    )
    put('F6', 'X.further', {
      found: !!got,
      furtherLayout: layoutOf(got?.layout ?? null),
      furtherLayoutLines: linesOf(got?.layout ?? null),
    })
    if (!got) return { state: 'unfit' }
    layout = got.layout
    blocks = got.blocks
    if (got.P) {
      unitP = got.P
      clear = (got.clear as Clear | undefined) ?? null
    }
  } else if (p.kind !== 'cell') {
    runs = layoutRuns(tokens, blocks, p.s, unitP, layout.lines)
    put('F6', 'X.runs', {
      laidRuns: runs
        ? {
            layout: layoutOf(runs.layout),
            lines: linesOf(runs.layout),
            runs: runs.runs.map((r) => ({
              bi0: r.bi0 ?? null,
              tokens: r.tokens?.length ?? 0,
              blocks: r.blocks?.length ?? 0,
              layout: layoutOf(r.layout),
            })),
          }
        : null,
    })
    if (runs) {
      whole = layout
      layout = runs.layout
    }
  }
  // F7 S.settle
  if (clear) {
    const before = layout.lines.map((l) => l.baseline)
    settleLayout({ clear, s: p.s }, layout)
    const after = layout.lines.map((l) => l.baseline)
    put('F7', 'S.settle', { moved: after.filter((y, i) => y !== before[i]).length, before, after })
  }
  // F8 S.share
  let share: Share | null = null
  if (p.shareRow || p.follower) {
    share = p.shareRow ? shareOf(layout, blocks, p.shareRow, P.measure) : null
    if (share && p.kept && !p.kept.byLabel) share.kept = true
    put('F8', 'S.share', {
      follower: p.follower?.id ?? null,
      share: share
        ? (Object.fromEntries(
            Object.entries(share)
              .filter(([, v]) => v !== undefined && v !== false)
              .map(([k, v]) => [k, fin(v)]),
          ) as Json)
        : null,
    })
  }
  put('out', 'X.walk', { layout: layoutOf(layout), lines: linesOf(layout) })
  // L9 S.fill.leads: each run's, then the unit's as one (its fit before its runs)
  const unit: FillLaid = {
    id: p.ord,
    unit: { kind: p.kind },
    refused: false,
    tokens,
    blocks,
    s: p.s,
    P: unitP,
    layout: runs ? whole! : layout,
    share,
    clear,
  }
  const runUnits: FillLaid[] = (runs?.runs ?? []).map((r, i, all) => ({
    id: p.ord,
    unit: { kind: p.kind },
    refused: false,
    run: i,
    bi0: r.bi0,
    tokens: r.tokens,
    blocks: r.blocks,
    s: p.s,
    P: r.P!,
    layout: r.layout!,
    parent: unit,
    share: i === all.length - 1 ? share : null,
    clear: null,
  }))
  const FR = R as unknown as Parameters<typeof fillLeadsOf>[1]
  for (const q of runUnits) fillLeadsOf(q as never, FR)
  fillLeadsOf(unit as never, FR)
  put('L9', 'S.fill.leads', {
    fillLead: fin(unit.fillLead),
    fillTop: fin(unit.fillTop),
    fitLines: fin(unit.fitLines),
    state: stateOf(layout.state),
    runs: runUnits.map((q) => [fin(q.fillLead), fin(q.fillTop), fin(q.fitLines)]),
  })
  unit.layout = layout
  if (runs) {
    unit.whole = whole
    unit.runs = runUnits
  }
  return { state: 'laid', lay: unit, over: overTaken }
}
