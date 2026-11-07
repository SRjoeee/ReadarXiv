// S.fill.page (design-b §1.5, T33): a page's fill over the units begun on it, each spread over its frame at the page's target
// leading, tracked where it stays short, and the page's one size where every body unit is short. Today's code (run.mjs
// RUN:319-492: fillUnitsOf, fillPage), first moved as it was by lab/typeset/move-fit.mjs, then ported to TypeScript under
// its replay (replay-fill: 3,013 of 3,014 cases equal, the one short of its F2 chain). Its target is
// S.fill.target's port, its settling S.settle's, the layout S.fill.leads found the unit's field `fillLaid` (today's module
// WeakMap), the shared row's ink ends measured by the unit's own measure (`p.P.measure`); an optional `trace` is told what the
// tap read inside it, at its probes' places (baseline/tap/engine.diff): each unit's decision, the page's size, each unit filled.
import { footFloorOf } from '../breaker/slots.types.ts'
import { layoutAt } from '../fit/at.ts'
import { keepsPages } from '../fit/runs.ts'
import { closerLead, fillLeadsOf } from './fill-leads.types.ts'
import { BODY_KINDS, fillTarget } from './fill-target.ts'
import { keepsShare } from './share.ts'
import { settleLayout } from './settle.ts'
import type { Token } from '../breaker/tokens.ts'
import type { FitBlock, FitParams, FitState, Layout } from '../fit/types.ts'
import type { Band } from '../unit/params.ts'
import type { FillRules } from './fill-leads.types.ts'
import type { FillTarget, Voter } from './fill-target.ts'
import type { Share } from './share.ts'

/** a unit (or a run of one) as the page's fill reads and lays it anew: what its lay left, its fill leadings, its row */
export type FillLaid = {
  id: number
  unit: { kind: string }
  refused: boolean
  tokens: readonly Token[]
  blocks: readonly FitBlock[]
  s: number
  P: FitParams
  layout: Layout & { extents?: unknown }
  share: Share | null
  clear: { bands: ReadonlyMap<number, readonly Band[]> } | null
  /** a run of a unit laid in runs: the unit; its index */
  parent?: FillLaid
  run?: number
  /** a unit laid in runs: its runs */
  runs?: FillLaid[]
  fillLead?: number | null
  fillTop?: number
  fitLines?: number
  /** the layout S.fill.leads found at the unit's fill leading (FillLeads.laid) */
  fillLaid?: { state: FitState; lead: number | null; l: Layout }
  [more: string]: unknown
}
/** the run's rules the fill reads (P.adaptiveFill, the script, the size's step, the fill leadings') */
export type PageRules = FillRules & {
  adaptiveFill: { band: number; track: number; size: number }
  cjk?: boolean
  step: number
}
/** what a pass hands the fill: the units filled, the units its target reads, those running on to the page */
export type FillUnits = { units: FillLaid[]; voters: FillLaid[]; continuing: FillLaid[] }

/** a unit as S.fill.target reads it */
const voterOf = (p: FillLaid): Voter => ({
  kind: p.unit.kind,
  refused: p.refused,
  fillLead: p.fillLead,
  // Missing line counts never meet fillTarget's two-line threshold; zero preserves that behavior.
  fitLines: p.fitLines ?? 0,
})

/**
 * What a page's fill pass hands fillPage (fillPass): the units begun on the page, a unit laid in runs as its runs (`units`, each
 * filled as a unit of the page's); and the units its target reads (`voters`, `continuing`), each unit once, as one, at its fit
 * as one (`whole`): a unit's runs do not each vote, so that its neighbours keep the rhythm they had before it was laid in runs,
 * and a run drawn on a page before is no unit of the next page's anchor
 */
export function fillUnitsOf(begun: FillLaid[], continuing: FillLaid[]): FillUnits {
  return { units: begun.flatMap((p) => p.runs ?? [p]), voters: begun, continuing }
}

/** Where a unit first meets its floor on the closer-leading grid without laying each candidate. */
function guessCloser(
  p: FillLaid,
  K: number,
  L: (k: number) => number,
  floorAt: (lead: number) => number | null,
): number | null {
  if (p.blocks.length !== 1 || p.layout.lines.length < 2) return null
  const b = p.blocks[0]
  // A one-block unit has a first block whenever its block count is one.
  if (!b) return null
  const n = p.layout.lines.length
  const p0 = b.pitch0 ?? 1.2 * p.s
  for (let k = 1; k <= K; k++) {
    const floor = floorAt(L(k))
    const firstBaseline = b.B[0]
    if (floor === null || (firstBaseline !== undefined && firstBaseline - (n - 1) * L(k) * p0 >= floor - 0.05)) return k
  }
  return null
}
/**
 * adaptiveFill (P.adaptiveFill: { band, track, size }; D since 2026-10-07, generalised by D6's F6b on 2026-10-08, page-local
 * since 1b-C; null for B): the units that begin on a page (`units`, each laid already: tokens, blocks, s, P, layout), each
 * spread over its original's frame, the page's lines kept to one rhythm. A unit is filled at the state its fit set it at, its
 * leading apart: its fill leading is the loosest, from its fitted leading up to P.fillLead em of the size it is drawn
 * at (null: the original's own pitch), at which that state still sets it whole, so that its text reaches its frame's
 * foot. The page's target is pageTarget's: the median of its body units' fill leadings held within `band` of the median of
 * every body unit drawn on it (`continuing`: the units begun on a page before and running on to it), however the paper is
 * opened. Each unit takes its fill leading, but never more than `band` over the
 * target, so that neighbouring paragraphs keep one line spacing. A CJK unit the band or its fill leading's top stops
 * short of its fill then takes tracking, up to `track` em; and where every body unit of the page is still short with
 * all of it, the page's body units take one size, the largest up to `size` x the original's at which every one of them
 * is still set whole: one size a page where it grows, never a unit's own (D grew each unit apart, and a page mixed 1.0
 * and 1.1); a unit the fit had to shrink keeps its own largest fitting size. A unit its fitted state does not set again
 * (the text run past a display) keeps its own fit. Each unit filled is laid anew in place (p.P, p.layout, its extents
 * kept), then `onFilled(p, target)`. Returns pageTarget's answer: the page's target, its own (before it is held), the anchor
 * and whether its body units told it; `target` null where only a continuation tells, and null where nothing tells.
 */
export function fillPage(
  units: FillLaid[],
  P: PageRules,
  onFilled: (p: FillLaid, target: number) => void = () => {},
  {
    continuing = [],
    voters = null,
    trace = null,
  }: {
    continuing?: FillLaid[]
    voters?: FillLaid[] | null
    trace?: FillTrace | null
  } = {},
): FillTarget | null {
  const { band, track, size } = P.adaptiveFill
  const r3 = (x: number) => Math.round(x * 1000) / 1000
  // (a unit whose last row the next unit's first continues on a shared line, laid from where its fit ended there (`share`,
  // layer2.mjs shareOf), is filled only where that stays so: no leading, tracking or size that sets its text there further
  // right, sets text there where its fit left the row free, or moves its line there off the baseline the next unit's first
  // line was set on (the fit's, `at`). Its fill leading is still its fit's, which the page's target
  // reads (fillLeadsOf); the page's one size is chosen as before, and a unit it would move there keeps its own. Each try is
  // settled (settleLayout: a cell's lines in their bands) before anything is read of it, as the fit's share was: the row is
  // kept as it is drawn)
  const free = (p: FillLaid, st: FitState) => {
    const l = layoutAt(p.tokens, p.blocks, p.s, p.P, st)
    if (l.clipped || (p.parent && !keepsPages(p.layout.lines, l.lines, p.tokens))) return null
    settleLayout(p, l)
    return l
  }
  const at = (p: FillLaid, st: FitState) => {
    const l = free(p, st)
    return l && keepsShare(p.share, l, p.P.measure) ? l : null
  }
  // (a layout laid already at a state, by fillLeadsOf's `at`, which held it whole and to its pages: settled and held to its row)
  const settledAt = (p: FillLaid, l: Layout) => {
    settleLayout(p, l)
    return keepsShare(p.share, l, p.P.measure) ? l : null
  }
  // (a unit's fill leading is its fit's (fillLeadsOf), set as it is laid: computed here only for a unit given without it)
  for (const p of units) if (p.fillLead === undefined) fillLeadsOf(p, P)
  // (`voters`: the units the page's target reads, where they are not the units filled: a unit laid in runs is filled a run at
  // a time and read once, as one (fillPass))
  const told = fillTarget((voters ?? units).map(voterOf), continuing.map(voterOf), band)
  if (!told || told.target === null) return told
  const { target } = told
  // (each unit's leading as the pass lays it, its fill leading under the band over the target; and the next paragraph's: the
  // unit begun on the page whose first line is the next line of its column, P.halfLead's `below` under its last baseline. The
  // gap between two paragraphs is held to the leading of both and the original's skip there, the lower one's first line kept
  // on its baseline, so the upper one ends that much over it (layer2.mjs footFloorAt, `next`). Read from the units begun on the page alone,
  // whose leadings are fixed before any is laid: no laying order is read)
  const leadOf = (p: FillLaid) => Math.min(p.fillLead === undefined ? Number.NaN : (p.fillLead ?? 0), r3(target + band))
  const spanOf = (b: FitBlock): [number, number] => [
    Math.min(...b.rects.map((r) => r[1])),
    Math.max(...b.rects.map((r) => r[3])),
  ]
  const nextOf = (p: FillLaid): number | null => {
    const e = p.P?.halfLead,
      bl = p.blocks?.at(-1)
    if (!e?.foot || !Number.isFinite(e.below) || !bl) return null
    const lastBaseline = bl.B.at(-1)
    const y = (lastBaseline ?? Number.NaN) - e.below,
      [x0, x1] = spanOf(bl)
    let best: FillLaid | null = null,
      most = 0
    for (const q of units) {
      const b0 = q.blocks?.[0]
      // (a unit of one line has no leading to show: a heading's or a one-line paragraph's fill leading is its fill's top)
      if (
        q === p ||
        typeof q.fillLead !== 'number' ||
        !((q.fitLines ?? 0) >= 2) ||
        !b0 ||
        b0.page !== bl.page ||
        Math.abs((b0.B[0] ?? Number.NaN) - y) > 0.3 * (b0.sizes[0] ?? p.s)
      )
        continue
      const [a0, a1] = spanOf(b0),
        over = Math.min(x1, a1) - Math.max(x0, a0)
      if (over > most && over > 0.5 * Math.min(x1 - x0, a1 - a0)) {
        most = over
        best = q
      }
    }
    return best ? leadOf(best) : null
  }
  const filled: {
    p: FillLaid
    st: FitState
    l: Layout
    full: boolean
    tracked: number
    untracked: { st: FitState; l: Layout }
  }[] = []
  for (const p of units) {
    if (p.fillLead === null) {
      trace?.unit(p, { skip: 'no fill leading' })
      continue
    }
    // (laid with its last line no lower than a leading over the next line of its column, its own or the next paragraph's,
    // the larger, layer2.mjs footFloorAt; its tracking and the page's size with it, so that neither takes back the room its
    // leading gave)
    const lead = leadOf(p),
      next = nextOf(p)
    // footFloorOf reads box by truthiness; 1 keeps the original true state within FitState's numeric type.
    let st: FitState = { ...p.layout.state, box: 1, lead, ...(next !== null && next > lead + 1e-9 ? { next } : {}) }
    // (at its fill leading, its state the one fillLeadsOf laid it at: that layout, settled and held to its row as any try is)
    const kept = p.fillLaid
    delete p.fillLaid
    const same = kept && !st.next && kept.state === p.layout.state && kept.lead === lead
    let l = same ? settledAt(p, kept.l) : at(p, st),
      closer = false
    if (!l && st.next) {
      // (its leading leaves the gap under it tighter than the next paragraph's lines: the loosest closer one that sets it,
      // down to the original's pitch; the floor is the next one's leading's, the same at every closer leading)
      const K = Math.ceil((lead - 1) / 0.01 - 1e-9),
        L = (k: number) => (k >= K ? 1 : r3(lead - k * 0.01))
      const floor = footFloorOf(p.blocks, st, p.P, p.s)
      const found =
        K > 0
          ? closerLead(
              K,
              (k) => at(p, { ...st, lead: L(k) }),
              floor === null ? null : guessCloser(p, K, L, () => floor),
            )
          : null
      if (found) {
        st = { ...st, lead: L(found.k) }
        l = found.l
        closer = true
      }
    }
    if (!l) {
      trace?.unit(p, { skip: 'not set', lead, next })
      continue
    }
    // short of its fill at the band's edge or at its fill leading's top: tracking, the most that still sets it, then the
    // page's size (not one the next paragraph's gap set closer: it is spread to its floor)
    const short =
      !closer &&
      p.fillLead !== undefined &&
      (p.fillLead > target + band + 1e-9 || p.fillLead >= (p.fillTop ?? Number.NaN) - 1e-9)
    let full = !short,
      tracked = 0
    const untracked = { st, l }
    if (short && P.cjk) {
      // (the most tracking that still sets it: halving, as a wider tracking holds no more on a line)
      const K = Math.round(track / 0.01),
        st2 = (k: number): FitState => ({ ...st, track: r3(st.track + k * 0.01) })
      let ok = 0,
        no = K + 1,
        lk: Layout | null = null
      while (no - ok > 1) {
        const k = (ok + no) >> 1,
          l2 = at(p, st2(k))
        if (l2) {
          ok = k
          lk = l2
        } else no = k
      }
      if (ok && lk) {
        st = st2(ok)
        l = lk
      }
      full = ok < K
      tracked = ok
    }
    filled.push({ p, st, l, full, tracked, untracked })
    trace?.unit(p, { lead, next, same: !!same, closer, short, full, tracked })
  }
  // (the runs of a unit split by its displays (`parent`, run.mjs layoutRuns) keep one tracking, as their fit does
  // (layer2.mjs layoutRuns): each the least any of its unit's runs on the page takes, a run the pass does not track taking
  // none; its leading still its own)
  const least = new Map<FillLaid, number>()
  for (const q of units)
    if (q.parent)
      least.set(q.parent, Math.min(least.get(q.parent) ?? Infinity, filled.find((f) => f.p === q)?.tracked ?? 0))
  for (const f of filled) {
    const k = (f.p.parent ? least.get(f.p.parent) : f.tracked) ?? 0
    if (k >= f.tracked) continue
    const l = k ? at(f.p, { ...f.untracked.st, track: r3(f.untracked.st.track + k * 0.01) }) : null
    f.st = l ? { ...f.untracked.st, track: r3(f.untracked.st.track + k * 0.01) } : f.untracked.st
    f.l = l ?? f.untracked.l
  }
  // the page's one size where it grows: every body unit's, where none is full yet; the largest at which every one is still
  // set whole, by halving (a larger size sets no more), a unit that fails ending the try. A unit the fit had to shrink
  // keeps its own largest fitting size: setting the page's other body units at it (PR #335's reviews) left the alphabets'
  // and Japanese's units short of their frames, the alphabets unable to spread past the original's pitch (paraGap 1.255
  // -> 1.708, as before D6; full size 0.25 -> 0; Japanese 1.011 -> 1.289), the coordinator's ruling of 2026-10-09
  const grown = filled.filter((f) => BODY_KINDS.includes(f.p.unit.kind))
  if (size > 1 && grown.length && grown.every((f) => !f.full)) {
    const scaleOf = (k: number) => r3(1 + k * P.step)
    // (a unit of one line keeps its own size in the scripts that spread to fillLeadRel: it has no frame to spread over, so a
    // larger size only carries its ink past the original's line, over a rule or a neighbour's text that the size step cannot
    // see, which the grid's last step above exposes (it makes more pages grow): 2610.21924's note of one line under a table's
    // rule, whose formulas touched it at x1.1. The other scripts' page fill is as it was until it is measured on theirs)
    // (a run reads its unit's line count: a unit's runs grow together, or none of them)
    const steps = (f: (typeof grown)[number]) => !(P.fillLeadRel && ((f.p.parent ?? f.p).fitLines ?? 0) < 2)
    const all = (k: number): (Layout | null)[] | null => {
      const ls: (Layout | null)[] = []
      for (const f of grown) {
        if (!steps(f)) {
          ls.push(null)
          continue
        }
        const l = free(f.p, { ...f.st, scale: scaleOf(k), knob: 'grow' })
        if (!l) return null
        ls.push(l)
      }
      return ls
    }
    let ok = 0,
      no = Math.round((size - 1) / P.step) + 1,
      best: (Layout | null)[] | null = null
    while (no - ok > 1) {
      const k = (ok + no) >> 1,
        ls = all(k)
      if (ls) {
        ok = k
        best = ls
      } else no = k
    }
    if (ok && best)
      grown.forEach((f, i) => {
        const layout = best[i]
        if (!layout || !keepsShare(f.p.share, layout, f.p.P.measure)) return
        f.st = { ...f.st, scale: scaleOf(ok), knob: 'grow' }
        f.l = layout
      })
    trace?.size(
      ok,
      scaleOf(ok),
      grown.map((f) => [f.p.id, f.p.run ?? null, f.st.knob === 'grow']),
    )
  }
  for (const { p, st, l } of filled) {
    const keep = p.layout.extents
    p.P = { ...p.P, leadBase: st.lead }
    // (its fit's knob kept, a step past its states among them (widen, below-floor), but the page's size grown)
    if (st.knob !== 'grow') l.knob = p.layout.knob
    p.layout = l
    p.layout.extents = keep
    // (laid anew, and settled as it was tried (`free`): its clearance at its new size, before it is recorded or painted; the
    // pass put a cleared CJK cell's first line back on the original's baseline, over its rule, 2026-10-07)
    trace?.filled(p, st, l, target)
    onFilled(p, target)
  }
  return told
}

/** a unit's decision in the fill (the tap's passes[].units): skipped, or its leading, the next paragraph's, and what it took */
export type FillDecision =
  | { skip: 'no fill leading' }
  | { skip: 'not set'; lead: number; next: number | null }
  | {
      lead: number
      next: number | null
      same: boolean
      closer: boolean
      short: boolean
      full: boolean
      tracked: number
    }
/** what the fill tells a trace, where the tap's probes read it: each unit's decision, the page's size, each unit filled */
export type FillTrace = {
  unit(p: FillLaid, v: FillDecision): void
  size(ok: number, scale: number, grown: [id: number, run: number | null, grew: boolean][]): void
  filled(p: FillLaid, st: FitState, l: Layout, target: number): void
}
