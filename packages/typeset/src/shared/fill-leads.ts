// S.fill.leads (design-b §1.5, E30): a unit's fill leadings as its lay ends: the loosest leading from its fitted one up to
// its top at which its fitted state still sets it whole as the page fill lays it, else the loosest closer one. Today's code
// (run.mjs RUN:494-595: fillLeadsOf, closerLead, guessCloser), moved by lab/typeset/move-fit.mjs. The layout found,
// which the page's fill reuses (today's fillLaid, a module WeakMap), is a field of
// the unit, `fillLaid` (design-b §1.5: FillLeads.laid).
import { footFloorOf } from '../breaker/slots.ts'
import { layoutAt } from '../fit/at.ts'
import { keepsPages } from '../fit/runs.ts'
import type { CutToken } from '../breaker/cuts.ts'
import type { FitBlock, FitParams, FitState, Layout } from '../fit/types.ts'

/** a unit (or a run of one) as its fill leadings are read: its tokens, blocks, size, parameters and layout; its fill leadings
 *  set on it */
export type FillUnit = {
  tokens: readonly CutToken[]
  blocks: readonly FitBlock[]
  s: number
  P: FitParams
  layout: Layout
  parent?: unknown
  fillLead?: number | null
  fillTop?: number
  fitLines?: number
  /** a unit over a page or column break: the fill leading of each frame before its last, by block, and of its last */
  fillLeads?: (number | undefined)[]
  lastLead?: number
  /** the layout found at the unit's fill leading (FillLeads.laid), which the page's fill reuses */
  fillLaid?: { state: FitState; lead: number | null; l: Layout }
  /** its frames at a state that holds the frames' share, and the leading each frame before the last holds it at */
  fillShare?: FillShare
}
/** a unit's frames at a state that holds the frames' share (frameShareOf): their leadings as fillLeads and lastLead, the
 *  leading each frame a cut follows is filled to holding it (null: it does not hold it), and the unit's fill leading `lo` */
export type FillShare = { leads: (number | undefined)[]; last: number; needs: (number | null)[]; lo: number }
/** the target's rules the fill leadings read */
export type FillRules = { fillLead: number | null; fillLeadRel: number | null; leadFloor?: number }
/** frameLeadsOf's answer: the leadings of the frames before the last by block, and the last frame's */
type FrameLeads = { leads: (number | undefined)[]; last: number }

/**
 * A unit's fill leading (fillPage's) and its top, read from its fit alone: `fillTop`, the loosest leading P.fillLead allows
 * it at the size it is set at, × its original's pitch (1: the original's own pitch, P.fillLead null; the looser of that and
 * P.fillLeadRel × the original's pitch scaled by the fit's size, where the script has one); `fillLead`, the
 * loosest leading from its fitted one up to the top at which its fitted state still sets it whole as the page fill lays it
 * (its last line no lower than a leading over the next line of its column, layer2.mjs footFloorAt: its last baseline on its
 * frame's last but where that would leave the gap under it tighter than its lines); where its fitted one does not, the
 * loosest closer one, down to the original's pitch (null where that state does not set it again). Set on the unit as it is laid (afterLay), so that the fill leading a page's pass reads of a unit
 * running on to it from a page before no longer depends on whether that page's pass has run (the 1b design, §2.1 C1). Not
 * yet the rest of the pass's reads: its line count, read live (after its first page's fill), and the targets the page is
 * held to (`held`, through every page passed before) are S3's, 1b-C's
 */
function fillLeadsOf(p: FillUnit, P: FillRules): void {
  const r3 = (x: number) => Math.round(x * 1000) / 1000
  const at = (q: FillUnit, st: FitState) => {
    const l = layoutAt(q.tokens, q.blocks, q.s, q.P, st)
    return l.clipped || (q.parent && !keepsPages(q.layout.lines, l.lines, q.tokens)) ? null : l
  }
  if (P.fillLead === null) p.fillTop = 1
  else {
    const pitches = p.blocks
      .map((b) => b.pitch0 as number)
      .filter((v) => v > 0)
      .sort((a, b) => a - b)
    const p0 = pitches.length ? pitches[pitches.length >> 1]! : 1.2 * p.s
    const emTop = r3((P.fillLead * p.s * p.layout.state.scale) / p0)
    // (fillLeadRel: a loose original's pitch can be as wide as the em top or wider, which would pin its translation to the
    // original's own pitch and end its paragraph early; the top is then fillLeadRel × the original's pitch scaled by the fit's
    // size, where that is the looser. Never tighter than the em top, so a single-spaced original is unchanged)
    p.fillTop = P.fillLeadRel ? Math.max(emTop, r3(P.fillLeadRel * p.layout.state.scale)) : emTop
  }
  // (a looser leading holds no more lines than a closer one: the loosest that sets the unit is found by halving, a few
  // layouts a unit where trying each hundredth from the top took up to forty. Monotone in practice, not by construction:
  // the greedy breaking's kinsoku and hanging marks could make a looser value set a unit a closer one does not; the linear
  // search from the top is the reference, and the halving drew the same on every fixture. So for the tracking and size)
  p.fitLines = p.layout.lines.length
  const st = p.layout.state
  // (as the page fill lays it, its last line no lower than a leading over the next line of its column: layer2.mjs footFloorAt.
  // A state that sets it so sets it without the floor too, which only takes slots off its last frame's foot: the fitted state
  // is laid again only where that one does not set it)
  const lo = st.lead,
    bx = { ...st, box: true }
  delete p.fillLaid
  delete p.fillShare
  let laid = at(p, bx)
  if (laid) {
    const hi = p.fillTop,
      L = (k: number) => Math.min(hi, r3(lo + k * 0.01))
    // (the grid's last step is the top itself, which `short` (fillPage) reads. Rounding the step count down left it untried
    // where the fraction was under a half, and the unit then took neither tracking nor the page's size; fillLeadRel's scripts
    // count it up, the others' fill as it was until it is measured on theirs)
    const steps = (hi - lo) / 0.01
    let ok = 0,
      no = (P.fillLeadRel ? Math.ceil(steps - 1e-9) : Math.round(steps)) + 1
    while (no - ok > 1) {
      const k = (ok + no) >> 1,
        l = at(p, { ...bx, lead: L(k) })
      if (l) {
        ok = k
        laid = l
      } else no = k
    }
    p.fillLead = ok ? L(ok) : lo
    // (the layout found there kept for the page's fill, which lays the unit at that very state wherever the band leaves it its
    // fill leading: fillPage `at`)
    p.fillLaid = { state: st, lead: p.fillLead, l: laid }
    // (and each frame of a unit over a page or column break its own: framesLeadsOf)
    const own = frameLeadsOf(p, bx, p.fillLead, hi, laid)
    if (own) {
      p.fillLeads = own.leads
      p.lastLead = own.last
    }
    const sh = shareOver(p, own, frameShareOf(p, bx, p.fillLead, hi, laid))
    if (sh) p.fillShare = sh
    return
  }
  if (!at(p, st)) {
    p.fillLead = null
    return
  }
  // (its fitted leading leaves the gap under it tighter than its lines, the fit having set its last line to its frame's foot:
  // the loosest closer one that does not, down to the original's pitch, which asks nothing. Where even that does not set it,
  // its fitted one. The floor moves with the leading here, its own)
  const floor = Math.max(1, P.leadFloor ?? 1),
    K = Math.ceil((lo - floor) / 0.01 - 1e-9),
    L = (k: number) => (k >= K ? floor : r3(lo - k * 0.01))
  const found =
    K > 0
      ? closerLead(
          K,
          (k) => at(p, { ...bx, lead: L(k) }),
          guessCloser(p, K, L, (lead) => footFloorOf(p.blocks, { ...bx, lead }, p.P, p.s)),
        )
      : null
  p.fillLead = found ? L(found.k) : lo
  // (and each frame of a unit over a page or column break its own there too (frameLeadsOf): the gap under its last frame taking
  // the unit's leading closer is no reason to hold its other frames to it. 1810.04805v2 p6/p7 t119, its fit four lines over p6's
  // five and two on p7, the second in p7's room: the gap under it at the fit's leading kept the original's skip, the closer
  // leading the original's pitch held five lines on p6 and left one of two characters on p7)
  const own = found ? frameLeadsOf(p, bx, p.fillLead, p.fillTop, found.l) : null
  if (own) {
    p.fillLeads = own.leads
    p.lastLead = own.last
  }
  const sh = found ? shareOver(p, own, frameShareOf(p, bx, p.fillLead, p.fillTop, found.l)) : null
  if (sh) p.fillShare = sh
}
/** the frames' share (frameShareOf's) where it lays anything frameLeadsOf's frames (`own`, null: each at the unit's fill
 *  leading) do not: a frame it holds at another leading, or, its frames' leadings (i)'s, a line its cuts marked `share` set
 *  elsewhere than the layout found at the fill leading (`fillLaid`); else null, the page fill then laying the unit as (i) does */
function shareOver(p: FillUnit, own: FrameLeads | null, sh: FillShare | null): FillShare | null {
  if (!sh) return null
  const lo = sh.lo,
    of = own ?? { leads: p.blocks.map(() => undefined), last: lo },
    eq = (a: number | undefined, b: number | undefined) => Math.abs((a ?? lo) - (b ?? lo)) <= 1e-9
  if (!(eq(sh.last, of.last) && sh.leads.every((v, bi) => eq(v, of.leads[bi])))) return sh
  if (!p.tokens.some((t) => t.share)) return null
  const was = p.fillLaid?.l
  if (own || !was) return sh
  const l = layoutAt(p.tokens, p.blocks, p.s, p.P, {
    ...p.layout.state,
    box: true,
    share: 1,
    lead: sh.last,
    leads: sh.leads,
  })
  const same =
    l.lines.length === was.lines.length &&
    l.lines.every((x, i) => {
      const y = was.lines[i]!
      return x.from === y.from && x.page === y.page && x.block === y.block && Math.abs(x.baseline - y.baseline) < 1e-6
    })
  return same ? null : sh
}
/** each block's frame, a page's or a column's: consecutive blocks on one page that overlap across (pageCutsOf's frames); and
 *  each paragraph TeX states inside the unit (a block that opens one, `opens`: SpanAt.opens, El.opens), whose leading is its
 *  own (the owner's ruling of 2026-11-08, (a)) */
function framesOf(blocks: readonly FitBlock[]): number[] {
  const of: number[] = []
  blocks.forEach((b, bi) => {
    const a = blocks[bi - 1]
    of.push(
      !a
        ? 0
        : !b.opens && a.page === b.page && Math.min(a.x1, b.x1) > Math.max(a.x0, b.x0)
          ? of[bi - 1]!
          : of[bi - 1]! + 1,
    )
  })
  return of
}
/**
 * Each frame of a unit over a page or column break filled over its own block (the owner on staging, 2026-11-08: 1810.04805v2
 * p6's last paragraph of a column, going on to the next page, held to the original's pitch with its frame's last line empty:
 * its two lines on the next page filled their two, and one leading a unit held the four here, in five, to theirs), and each
 * paragraph TeX states inside it (framesOf; the owner's comment #9 on 2608.25210v2 p3: a prompt held to the pitch its item's
 * run-in line needed), whichever way the unit's fill leading was found (fillLeadsOf, its closer search's too). From the
 * unit's fill leading `lo` (its every frame's), each frame in turn, the earlier ones first, the loosest leading up to `hi` at
 * which the unit is still set whole and keeps its pages (no line on a later page than its fit set it: keepsPages), the others
 * at theirs. A frame of one block first tried where its lines at `lo` (`laid`) would end on its last baseline, arithmetic, and
 * one step looser (no layout more where a frame has no room: most are full), any other first one step looser; then by
 * halving, as the unit's own. The leadings
 * of the frames before the last by block (`leads`, the state's), the last frame's (`last`, the state's `lead`); null where the
 * unit lies in one frame or no frame of it is set looser
 */
function frameLeadsOf(p: FillUnit, bx: FitState, lo: number, hi: number, laid: Layout): FrameLeads | null {
  const of = framesOf(p.blocks),
    n = (of.at(-1) ?? 0) + 1,
    steps = Math.ceil((hi - lo) / 0.01 - 1e-9)
  if (n < 2 || !(steps > 0)) return null
  const r3 = (x: number) => Math.round(x * 1000) / 1000,
    L = (k: number) => Math.min(hi, r3(lo + k * 0.01))
  const sets = (st: FitState) => {
    const l = layoutAt(p.tokens, p.blocks, p.s, p.P, st)
    return !l.clipped && keepsPages(p.layout.lines, l.lines, p.tokens)
  }
  const leads: (number | undefined)[] = p.blocks.map(() => undefined)
  let last = lo
  const stateAt = () => ({ ...bx, lead: last, leads: leads.slice() })
  for (let f = 0; f < n; f++) {
    const put = (v: number) => {
      if (f === n - 1) last = v
      else
        of.forEach((g, bi) => {
          if (g === f) leads[bi] = v
        })
    }
    // (the guess: a frame of one block before the last, its m lines from its first baseline to its last, (m - 1) pitches)
    const bis = of.flatMap((g, bi) => (g === f ? [bi] : [])),
      b = p.blocks[bis[0] as number]!
    const m = laid.lines.filter((l) => of[l.block] === f).length,
      p0 = b.pitch0 ?? 1.2 * p.s
    const guess =
      bis.length !== 1 || f === n - 1
        ? null
        : m < 2
          ? steps
          : Math.max(
              0,
              Math.min(
                steps,
                Math.floor((((b.B[0] as number) - (b.B.at(-1) as number)) / ((m - 1) * p0) - lo) / 0.01 + 1e-6),
              ),
            )
    let ok = 0,
      no = steps + 1
    if (guess !== null) {
      put(L(guess))
      if (guess === 0 || sets(stateAt())) {
        ok = guess
        if (guess === steps) no = ok + 1
        else {
          put(L(guess + 1))
          if (!sets(stateAt())) no = guess + 1
          else ok = guess + 1
        }
      } else no = guess
    } else {
      // (a frame of more blocks, or the last, whose gap under it the floor reads: first one step looser, which a full frame,
      // or the one that held the unit's leading, does not take)
      put(L(1))
      if (sets(stateAt())) ok = 1
      else no = 1
    }
    while (no - ok > 1) {
      const k = (ok + no) >> 1
      put(L(k))
      if (sets(stateAt())) ok = k
      else no = k
    }
    put(L(ok))
  }
  if (!(last > lo + 1e-9) && !leads.some((v) => v !== undefined && v > lo + 1e-9)) return null
  return { leads, last }
}
/**
 * The frames' share (pageCutsOf's cuts, those marked `share` too: where the fit set the line a frame's share begins with in that
 * frame or later, its frame before not full at its state): each frame as frameLeadsOf fills it, at a state that holds the share,
 * a frame before the last holding the text before the cut of the frame after it; where it does not at `lo`, the loosest leading
 * closer, down to the original's pitch, at which it does, and no looser; where none does, `lo`. Returns its leadings as
 * frameLeadsOf's, `needs` (by frame before the last that a cut follows: the leading it is filled to holding its share, null
 * where it does not hold it) and `lo`; null where the unit's tokens hold no frame's cut. The page fill keeps it where every such
 * frame holds its share at or above its page's band floor (fillPage); every other lay is (i)'s, frameLeadsOf's, the cuts marked
 * `share` read by none (lab option (i)'s frame share, bounded by the band, 2026-11-09)
 */
function frameShareOf(p: FillUnit, bx: FitState, lo: number, hi: number, laid: Layout): FillShare | null {
  const of = framesOf(p.blocks),
    n = (of.at(-1) ?? 0) + 1,
    steps = Math.max(0, Math.ceil((hi - lo) / 0.01 - 1e-9))
  if (n < 2 || !p.tokens.some((t) => t.pageBreak !== undefined && t.frame !== undefined && t.frame !== null))
    return null
  const r3 = (x: number) => Math.round(x * 1000) / 1000,
    L = (k: number) => (k === 0 ? lo : Math.min(hi, r3(lo + k * 0.01)))
  // (the cuts the tokens hold (pageCutsOf, the frames' share): before the first block of each frame but the first, the text
  // before it set in the frames before it)
  const base = (p.P.blockBase as number | undefined) ?? 0,
    cuts: [number, number][] = []
  p.tokens.forEach((t, i) => {
    if (t.pageBreak !== undefined && t.frame !== undefined && t.frame !== null) cuts.push([i, t.frame])
  })
  const holds = (l: Layout, fr: number) =>
    cuts.every(([i, c]) => c !== fr || l.lines.every((x) => !(x.from < i) || x.block + base < fr))
  let at: number | null = null
  const sets = (st: FitState) => {
    const l = layoutAt(p.tokens, p.blocks, p.s, p.P, st)
    return !l.clipped && keepsPages(p.layout.lines, l.lines, p.tokens, true) && (at === null || holds(l, at))
  }
  const leads: (number | undefined)[] = p.blocks.map(() => undefined),
    shared: number[] = [],
    missed = new Set<number>()
  let last = lo
  const stateAt = () => ({ ...bx, share: 1, lead: last, leads: leads.slice() })
  for (let f = 0; f < n; f++) {
    const put = (v: number) => {
      if (f === n - 1) last = v
      else
        of.forEach((g, bi) => {
          if (g === f) leads[bi] = v
        })
    }
    // (a frame before the last holds the text before the cut of the frame after it, the share: where it does not at `lo`, the
    // loosest leading closer, down to the original's pitch, at which it does, and no looser; where none does (the text before
    // the cut does not fit even at the original's pitch), `lo`, the text running on past the cut as the fit set it)
    const next = of.indexOf(f + 1)
    at = f < n - 1 && cuts.some(([, c]) => c === next + base) ? next + base : null
    if (at !== null) {
      shared.push(f)
      put(lo)
      if (!sets(stateAt())) {
        const K = Math.ceil((lo - 1) / 0.01 - 1e-9),
          C = (k: number) => (k >= K ? 1 : r3(lo - k * 0.01))
        const found =
          K > 0
            ? closerLead(
                K,
                (k) => {
                  put(C(k))
                  return sets(stateAt()) ? true : null
                },
                null,
              )
            : null
        put(found ? C(found.k) : lo)
        if (!found) missed.add(f)
        continue
      }
    }
    // (the guess: a frame of one block before the last, its m lines from its first baseline to its last, (m - 1) pitches)
    const bis = of.flatMap((g, bi) => (g === f ? [bi] : [])),
      b = p.blocks[bis[0] as number]!
    const m = laid.lines.filter((l) => of[l.block] === f).length,
      p0 = b.pitch0 ?? 1.2 * p.s
    const guess =
      bis.length !== 1 || f === n - 1
        ? null
        : m < 2
          ? steps
          : Math.max(
              0,
              Math.min(
                steps,
                Math.floor((((b.B[0] as number) - (b.B.at(-1) as number)) / ((m - 1) * p0) - lo) / 0.01 + 1e-6),
              ),
            )
    let ok = 0,
      no = steps + 1
    if (guess !== null) {
      put(L(guess))
      if (guess === 0 || sets(stateAt())) {
        ok = guess
        if (guess === steps) no = ok + 1
        else {
          put(L(guess + 1))
          if (!sets(stateAt())) no = guess + 1
          else ok = guess + 1
        }
      } else no = guess
    } else {
      // (a frame of more blocks, or the last, whose gap under it the floor reads: first one step looser, which a full frame,
      // or the one that held the unit's leading, does not take)
      put(L(1))
      if (sets(stateAt())) ok = 1
      else no = 1
    }
    while (no - ok > 1) {
      const k = (ok + no) >> 1
      put(L(k))
      if (sets(stateAt())) ok = k
      else no = k
    }
    put(L(ok))
  }
  // (each frame a cut follows: the leading it holds its share at, as filled; null where it does not hold it)
  const needs = shared.map((f) => (missed.has(f) ? null : (leads[of.indexOf(f)] as number)))
  return { leads, last, needs, lo }
}
/**
 * The loosest leading of a closer search's grid at which a unit sets (fillLeadsOf, fillPage): L(k) for k from 1 to K, closer
 * as k grows, L(K) the original's pitch, the leading before them (k 0) known not to. `sets(k)`, the layout at L(k) or null.
 * By halving from the grid's ends, as a looser leading holds no more lines than a closer one (monotone in practice, as the
 * fill's other searches take it); first, where a guess is given (guessCloser), the guess confirmed by two layouts, it set
 * and the step looser not, which the halving would have found by the same order: each search of the kind took six layouts
 * or seven a unit, which the speed check of 2026-10-17 found (the page fill under the gap rule 0.7 % more fit states).
 * Returns { k, l } (the layout at L(k), the one the search laid there) or null where L(K) does not set it either
 */
function closerLead<L>(K: number, sets: (k: number) => L | null, guess: number | null): { k: number; l: L } | null {
  if (guess !== null && guess >= 1 && guess <= K) {
    const l = sets(guess)
    if (l && (guess === 1 || !sets(guess - 1))) return { k: guess, l }
  }
  let best = sets(K)
  if (!best) return null
  let no = 0,
    ok = K
  while (ok - no > 1) {
    const k = (ok + no) >> 1,
      l = sets(k)
    if (l) {
      ok = k
      best = l
    } else no = k
  }
  return { k: ok, l: best }
}
/**
 * Where on a closer search's grid (closerLead's L(k)) a unit of one frame first ends no lower than its floor (`floorAt(L)`,
 * footFloorAt's at that leading, null where none is asked): its n lines from the frame's first baseline B0, L p0 apart (no
 * first line moves), its last at B0 - (n - 1) L p0, which a slot holds 0.05 under its floor; arithmetic, no layout. Null for a
 * unit of more frames or of one line, where its lines' places are not that simple: the halving decides
 */
function guessCloser(
  p: FillUnit,
  K: number,
  L: (k: number) => number,
  floorAt: (lead: number) => number | null,
): number | null {
  if (p.blocks?.length !== 1 || !(p.layout?.lines.length >= 2)) return null
  const b = p.blocks[0]!,
    n = p.layout.lines.length,
    p0 = b.pitch0 ?? 1.2 * p.s
  for (let k = 1; k <= K; k++) {
    const f = floorAt(L(k))
    if (f === null || (b.B[0] as number) - (n - 1) * L(k) * p0 >= f - 0.05) return k
  }
  return null
}

export { fillLeadsOf, closerLead, guessCloser, framesOf }
