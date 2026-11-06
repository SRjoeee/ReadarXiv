// S.fill.leads (design-b §1.5, E30): a unit's fill leadings as its lay ends: the loosest leading from its fitted one up to
// its top at which its fitted state still sets it whole as the page fill lays it, else the loosest closer one. Today's code
// (run.mjs RUN:494-595: fillLeadsOf, closerLead, guessCloser), moved by lab/typeset/move-fit.mjs; typed by
// fill-leads.types.ts. The layout found, which the page's fill reuses (today's fillLaid, a module WeakMap), is a field of
// the unit, `fillLaid` (design-b §1.5: FillLeads.laid).
import { footFloorOf } from '../breaker/slots.mjs'
import { layoutAt } from '../fit/at.ts'
import { keepsPages } from '../fit/runs.mjs'

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
function fillLeadsOf(p, P) {
  const r3 = x => Math.round(x * 1000) / 1000
  const at = (q, st) => { const l = layoutAt(q.tokens, q.blocks, q.s, q.P, st); return l.clipped || (q.parent && !keepsPages(q.layout.lines, l.lines, q.tokens)) ? null : l }
  if (P.fillLead === null) p.fillTop = 1
  else {
    const pitches = p.blocks.map(b => b.pitch0).filter(v => v > 0).sort((a, b) => a - b)
    const p0 = pitches.length ? pitches[pitches.length >> 1] : 1.2 * p.s
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
  const lo = st.lead, bx = { ...st, box: true }
  delete p.fillLaid
  let laid = at(p, bx)
  if (laid) {
    const hi = p.fillTop, L = k => Math.min(hi, r3(lo + k * 0.01))
    // (the grid's last step is the top itself, which `short` (fillPage) reads. Rounding the step count down left it untried
    // where the fraction was under a half, and the unit then took neither tracking nor the page's size; fillLeadRel's scripts
    // count it up, the others' fill as it was until it is measured on theirs)
    const steps = (hi - lo) / 0.01
    let ok = 0, no = (P.fillLeadRel ? Math.ceil(steps - 1e-9) : Math.round(steps)) + 1
    while (no - ok > 1) { const k = (ok + no) >> 1, l = at(p, { ...bx, lead: L(k) }); if (l) { ok = k; laid = l } else no = k }
    p.fillLead = ok ? L(ok) : lo
    // (the layout found there kept for the page's fill, which lays the unit at that very state wherever the band leaves it its
    // fill leading: fillPage `at`)
    p.fillLaid = { state: st, lead: p.fillLead, l: laid }
    return
  }
  if (!at(p, st)) { p.fillLead = null; return }
  // (its fitted leading leaves the gap under it tighter than its lines, the fit having set its last line to its frame's foot:
  // the loosest closer one that does not, down to the original's pitch, which asks nothing. Where even that does not set it,
  // its fitted one. The floor moves with the leading here, its own)
  const floor = Math.max(1, P.leadFloor ?? 1), K = Math.ceil((lo - floor) / 0.01 - 1e-9), L = k => (k >= K ? floor : r3(lo - k * 0.01))
  const found = K > 0 ? closerLead(K, k => at(p, { ...bx, lead: L(k) }), guessCloser(p, K, L, lead => footFloorOf(p.blocks, { ...bx, lead }, p.P, p.s))) : null
  p.fillLead = found ? L(found.k) : lo
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
function closerLead(K, sets, guess) {
  if (guess !== null && guess >= 1 && guess <= K) {
    const l = sets(guess)
    if (l && (guess === 1 || !sets(guess - 1))) return { k: guess, l }
  }
  let best = sets(K)
  if (!best) return null
  let no = 0, ok = K
  while (ok - no > 1) { const k = (ok + no) >> 1, l = sets(k); if (l) { ok = k; best = l } else no = k }
  return { k: ok, l: best }
}
/**
 * Where on a closer search's grid (closerLead's L(k)) a unit of one frame first ends no lower than its floor (`floorAt(L)`,
 * footFloorAt's at that leading, null where none is asked): its n lines from the frame's first baseline B0, L p0 apart (no
 * first line moves), its last at B0 - (n - 1) L p0, which a slot holds 0.05 under its floor; arithmetic, no layout. Null for a
 * unit of more frames or of one line, where its lines' places are not that simple: the halving decides
 */
function guessCloser(p, K, L, floorAt) {
  if (p.blocks?.length !== 1 || !(p.layout?.lines.length >= 2)) return null
  const b = p.blocks[0], n = p.layout.lines.length, p0 = b.pitch0 ?? 1.2 * p.s
  for (let k = 1; k <= K; k++) {
    const f = floorAt(L(k))
    if (f === null || b.B[0] - (n - 1) * L(k) * p0 >= f - 0.05) return k
  }
  return null
}

export { fillLeadsOf, closerLead, guessCloser }
