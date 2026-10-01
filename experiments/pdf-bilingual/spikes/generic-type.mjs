// One set of type for a whole translation, found from predicted lines (plans/2026-09-30-generic-type.md, step 2). The
// design table gives each writing system its knobs and their natural ranges — data, to be refined per language by the
// owner's eye; the solver finds, within them, the type at which the translation's predicted height equals the
// original's. The same for every paper, every class, every language: no compile, no trial, no per-block rule.
import { cjkType } from './lock.mjs'
import { linesAt } from './density.mjs'

const CJK_DESIGN = (lead, range) => ({ cjk: true, base: { lead, track: 0, scale: 1 }, lead: range, track: [0, 0.05], scale: [0.92, 1] })
const ALPHABET = { cjk: false, size: [0.9, 1], lead: [0.95, 1.1] }
/**
 * Per writing system, as FIT had them (lock.mjs CJK_RANGES, visual-eval-lib.mjs FIT) so that the generic column
 * differs from FIT only in how it finds the type: CJK — leading × the paper's own (Chinese from its reader's 1.3,
 * Japanese and Korean from the paper's), tracking between CJK characters in em, the CJK face's scale; alphabets — the
 * size of the translated text, then its leading × the paper's. An alphabet's floor is the size a class sets as \\small
 * below a 10 pt body (9 pt): where a face has fixed sizes, the size below 10 pt is 9, and FIT's 0.93 came out at it.
 */
export const DESIGN = {
  Hans: CJK_DESIGN(1.3, [1.2, 1.45]),
  Hant: CJK_DESIGN(1.3, [1.2, 1.45]),
  Jpan: CJK_DESIGN(1, [1, 1.45]),
  Kore: CJK_DESIGN(1, [1, 1.45]),
  Latn: ALPHABET,
  Cyrl: ALPHABET,
}

/**
 * The translation's predicted height over the original's, at a type: each unit's predicted lines — its width at the
 * type over its ruler's capacity (an alphabet set smaller takes more to a line) — at its leading, over its original's
 * lines at the paper's. `units`: { lo, bs, cap, width(type) } — the original's lines and leading, the capacity of its
 * lines in em, the translation's width in em (density.mjs). An alphabet's type: its size, how wide the face sets there
 * against the body (`h`, the size probe's; the size itself for a face that only scales), its leading.
 */
export function heightRatio(units, script, type) {
  const design = DESIGN[script]
  let o = 0, t = 0
  for (const u of units) { o += u.lo * u.bs; t += heightAt(u, design, type) * type.lead }
  return o ? t / o : 1
}
// a unit's predicted lines at a type, its face `f` times the type's own: what it fills of a line is that much less
const linesOf = (u, design, type, f = 1) => (design.cjk ? linesAt(u.width(type) * f, u.cap) : linesAt(u.width(type) * (type.h ?? type.size) * f, u.cap))
// a unit's predicted height at a type, at leading one: its lines × its size (an alphabet's, and `f`) × the paper's leading
const heightAt = (u, design, type, f = 1) => linesOf(u, design, type, f) * (design.cjk ? 1 : type.size) * f * u.bs
/** a unit's predicted height at a type and leading one, its face `f` times the type's own (flowType's shrink) */
export const heightAtSize = (u, script, type, f = 1) => heightAt(u, DESIGN[script], type, f)
/** each unit's predicted height at a type and leading one, by its index: what flowLeads takes from a prediction */
export const unitHeights = (units, script, type) => new Map(units.map(u => [u.i, heightAt(u, DESIGN[script], type)]))
/** each unit's predicted lines at a type, by its index */
export const unitLines = (units, script, type) => new Map(units.map(u => [u.i, linesOf(u, DESIGN[script], type)]))

/**
 * The leading along the paper, unit by unit: the one that makes the translation as tall as the original over the
 * stretch of `window` of the original's lines around the unit (the unit's middle in the middle), within the design's
 * range. One type for the whole paper keeps its height, not its places: a translation's density changes along a
 * paper (a section of related work runs longer than one of proofs), each stretch keeps what the one before it lost,
 * and at the end of the main text 2608.09038 stood a third of a column late — its references pushed onto a page of
 * their own, two pages added. Over a window of about a column the translation keeps to the original's flow; over the
 * whole paper it is one leading again (window Infinity). Neighbours share most of their window, so their leading
 * differs little. Where the range stops it — Japanese and Korean set no tighter than the paper's own leading — a stretch
 * that runs long stays long, and the stretch after it, short, would be set looser all the same: 2608.18090's Korean
 * came out 0.12 column late where one leading for all had kept it within 0.01. So the drift the leading has left so far
 * is taken back over the next `horizon` lines (the window's own length unless given), and a stretch after one that
 * could not keep up is set no looser than that allows. A window of 0 is each unit on its own: its original's height
 * within the range, what the range stopped taken back by the units after it.
 * `ahead`, in lines: the drift aimed at is that far ahead of the original, not level with it. Text that runs even a
 * little long pushes what cannot break to the next column — a figure set here ([H]), the last page before a forced
 * break (2608.06233: ten points too many before an [H] figure moved it on, and every page after it half a column late);
 * text a little short leaves a little white space. The lead is kept, not grown: it costs no page.
 * `measured`, from a compile already made (the reader's preview): `drift`, Map(unit index → how far behind the original
 * the unit started there, in points, pages and floats and all), and `preview`, Map(unit index → its height there).
 * What the preview's heights do not account for — a float that jumped, a page break that moved, a title a line shorter —
 * is read at each unit as its measured drift less its heights' account there, and added to the final's own account:
 * the median of the next `measured.span` readings (five), so that one unit read far off and the next back is left out
 * (Korean 2608.06701: a paragraph moved from the foot of the left column to below a figure heading the right read 0.42
 * column late, the next paragraph level), and a jump that lasts is taken a little before it, where the text can still
 * make way. The first reading is taken as it is and stands for the rest: before the first unit stands only the front
 * matter, whose change moves everything after it (Korean 2608.21180: a title a line shorter left page 1 51 pt ahead,
 * room it took by shrinking its glue until the paper's own \\vspace{-2.8em} set the abstract on the e-mail line). A
 * later median within `measured.snap` (points) of it is noise and reads as it (2212.06817: a final that followed every
 * reading ran 0.12 page ahead); one past it holds while it lasts, and the offset comes back to the front matter's after
 * it. With `measured.keep`, a median within the threshold of the offset standing leaves it standing instead. With `measured.local` (lines), the lead ahead is kept only in the stretch of that
 * length before each jump the preview measured — a rise in its drift the heights do not account for, something that
 * could not break moved on — each unit there set to put the text on a ramp to `ahead` lines ahead by the jump;
 * elsewhere the text keeps level. A lead ahead everywhere cost every unit two lines of drift, and 2608.21180 (Chinese)
 * ran a quarter column ahead.
 * `measured.breaks`: the units that follow a forced break (a \\clearpage, a \\newpage; readForced), where the preview
 * and the final both start at the top of a page or column whatever came before: the final's own drift is taken up
 * again from the preview's account there, and the offset from the first reading after it, as at the paper's start.
 * Read across it, what the final's heights had parted from the preview's before the break — the final's type a little
 * tighter, 113 pt over Korean 2608.05876's main text — was read as the appendix running that far early, and the whole
 * appendix was set looser.
 * `rate`: what is taken back — the drift, the measured offset, the lead ahead — moves a unit's leading at most that
 * fraction from the window's, however far behind the text is, so that no paragraph stands out from its neighbours: a
 * jump the preview measured, taken back within the horizon, set Korean 2608.05876's paragraphs after it a quarter
 * looser than the text around them, and the owner preferred the version without it to one nearer the original's places.
 * `shrink` ({ steps, lines, heightAt(i, f) }): where a segment — up to a forced break, or the paper's end — runs late
 * itself by more than `lines` of its lines (from level for the paper's first segment, from where the preview started
 * it for one after a break: a segment that began a page late because the one before ran over the break leaves that
 * to the one before), its leading stopped by the floor of the range
 * (Japanese and Korean set no tighter than the paper's own), the stretch that ran late before that end is set at one
 * face `f` times the type's (heightAt: a unit's height at leading one at that face): the first of `steps` that takes
 * the lateness back over as few of the stretch's last units as it needs, the strongest over all of them where none
 * does; then the flow again over those heights. The owner, 2026-10-01: Korean 2608.18090's last sections ran 0.16
 * page long at the floor, its references started a page later and its checklist took a page more. Set unit by unit
 * where each wanted it, a third of the CJK units came out a little smaller, most by under 3 %, and a face that much
 * smaller saves a whole line more often than the line model allows, twice as often under 1 %: five papers ran early.
 * The face's factor by unit is flowType's `sizes`; its `trace`, unit by unit, where the final pass put the text at the
 * unit's start (`at`) and its end (`end`), in points behind the original, and the leading it set (`x`).
 * `heights`: Map(unit index → the translation's height at leading one), from unitHeights or a compile's lines. The
 * leading is × the paper's for CJK, × the size's for an alphabet, as the type's is
 */
export function flowType(units, script, heights, { window = 50, horizon = window, ahead = 0, measured = null, rate = Infinity, shrink = null } = {}) {
  const design = DESIGN[script]
  const list = units.filter(u => heights.get(u.i) > 0).sort((a, b) => a.i - b.i)
  const bs = [...list.map(u => u.bs)].sort((a, b) => a - b)[list.length >> 1] ?? 12, half = (window * bs) / 2, back = horizon * bs, lead = ahead * bs
  let at = 0
  const mid = list.map(u => { const m = at + (u.lo * u.bs) / 2; at += u.lo * u.bs; return m })
  // the stretches before the preview's jumps (measured.local): each unit's distance from its end to the jump after it
  const local = measured?.local && ahead > 0 ? measured.local * bs : 0, toJump = new Map()
  if (local) {
    let prev = null, jump = null
    const jumps = new Set()
    for (const u of list) {
      const m = measured.drift.get(u.i)
      if (m != null && prev && m - prev.m - (prev.p - prev.h) > (measured.snap ?? 0)) jumps.add(u.i)
      prev = m != null ? { m, p: measured.preview.get(u.i) ?? heights.get(u.i), h: u.lo * u.bs } : null
    }
    for (let k = list.length - 1; k >= 0; k--) {
      const start = mid[k] - (list[k].lo * list[k].bs) / 2, end = mid[k] + (list[k].lo * list[k].bs) / 2
      if (jump != null && jump - end <= local) toJump.set(list[k].i, jump - end)
      if (jumps.has(list[k].i)) jump = start
    }
  }
  // what the preview measured beyond its heights' account, smoothed, by unit index (see above)
  const offsetAt = new Map(), accountAt = new Map(), breaks = measured?.breaks ?? new Set()
  if (measured) {
    const readings = []
    let account = 0, broke = false
    for (const u of list) {
      const m = measured.drift.get(u.i)
      broke ||= breaks.has(u.i)
      if (m != null) { readings.push({ i: u.i, beyond: m - account, anew: broke }); broke = false }
      accountAt.set(u.i, account)
      account += (measured.preview.get(u.i) ?? u.lo * u.bs) - u.lo * u.bs
    }
    // the first reading as it is, and the first after each forced break; after it, the offset moves only where the
    // median — of readings up to the next break, not past it — parts from it by more than the threshold
    const span = measured.span ?? 5
    let current = 0, first = 0
    readings.forEach((r, j) => {
      let end = Math.min(readings.length, j + span)
      for (let k = j + 1; k < end; k++) if (readings[k].anew) end = k
      const next = readings.slice(j, end).map(x => x.beyond).sort((a, b) => a - b), med = next[next.length >> 1]
      if (j === 0 || r.anew) first = current = r.beyond
      else if (measured.keep) { if (!(Math.abs(med - current) <= measured.snap)) current = med }
      else current = !(Math.abs(med - first) <= measured.snap) ? med : first
      offsetAt.set(r.i, current)
    })
  }
  const take = d => clamp(back > 0 && back < Infinity ? 1 - d / back : 1, [1 - rate, 1 + rate])
  // the flow over the units' heights `hs`: each unit's leading, and where the text stands at its start and its end
  const pass = hs => {
    const leads = new Map(), trace = []
    let lo = 0, hi = 0, o = 0, t = 0, drift = 0, offset = 0
    for (let k = 0; k < list.length; k++) {
      for (; hi < list.length && mid[hi] <= mid[k] + half; hi++) { o += list[hi].lo * list[hi].bs; t += hs.get(list[hi].i) }
      for (; mid[lo] < mid[k] - half; lo++) { o -= list[lo].lo * list[lo].bs; t -= hs.get(list[lo].i) }
      const i = list[k].i
      // past a forced break the final starts where the preview did: what its heights parted from the preview's before
      // it the break took
      if (breaks.has(i) && accountAt.has(i)) drift = accountAt.get(i)
      if (offsetAt.has(i)) offset = offsetAt.get(i)
      const at = drift + offset, near = toJump.get(i)
      const x = near != null
        ? clamp((list[k].lo * list[k].bs - lead * (1 - near / local) - at) / hs.get(i), design.lead)
        : clamp((o / t) * take(at + (local ? 0 : lead)), design.lead)
      leads.set(i, x)
      drift += hs.get(i) * x - list[k].lo * list[k].bs
      trace.push({ i, at, end: drift + offset, x })
    }
    return { leads, trace }
  }
  const first = pass(heights), sizes = new Map()
  if (!shrink) return { leads: first.leads, sizes, trace: first.trace }
  // each segment's last unit — before a forced break, at the paper's end — and, where the text is left late there by
  // more than shrink.lines, its late stretch at one face: the first step that takes the lateness back over as few of
  // its last units as it needs, the strongest over all of them where none does
  let from = 0
  for (let e = 0; e < list.length; e++) {
    if (e < list.length - 1 && !breaks.has(list[e + 1].i)) continue
    // what the segment ran late itself: from level for the paper's first, from where the preview started it for one
    // after a forced break — a page late where the segment before ran over the break, which that one answers for
    const base = from === 0 ? 0 : first.trace[from].at, late = first.trace[e].end - base
    if (late > shrink.lines * bs) {
      let chosen = null
      for (const f of shrink.steps) {
        const run = []
        let saved = 0
        for (let k = e; k >= from; k--) {
          const { i, at, x } = first.trace[k]
          run.push(i)
          saved += (heights.get(i) - shrink.heightAt(i, f)) * x
          if (saved >= late || at <= base) break
        }
        chosen = { f, run }
        if (saved >= late) break
      }
      for (const i of chosen.run) sizes.set(i, chosen.f)
    }
    from = e + 1
  }
  if (!sizes.size) return { leads: first.leads, sizes, trace: first.trace }
  const second = pass(new Map([...heights].map(([i, h]) => [i, sizes.has(i) ? shrink.heightAt(i, sizes.get(i)) : h])))
  return { leads: second.leads, sizes, trace: second.trace }
}
/** flowType's leading alone: each unit's leading by its index */
export const flowLeads = (units, script, heights, options) => flowType(units, script, heights, options).leads

// a translation that runs long pushes floats and forced page breaks to later pages (2608.09038 gained two pages when
// its main text ran a third of a column long); one that runs short leaves white space at a column's end. Of two types
// that miss, the one that runs short
const LONG = 2
// a face without a size probe: every size in the range, as wide as its size
const scalable = ([lo, hi]) => Array.from({ length: Math.round((hi - lo) / 0.005) + 1 }, (_, k) => { const size = Number((lo + k * 0.005).toFixed(4)); return { size, h: size } })
const clamp = (x, [lo, hi]) => Math.min(hi, Math.max(lo, x))

/**
 * The type for a translation. CJK: the knobs share the change as lock.mjs cjkType shares it, and the share is found by
 * bisection so that the predicted ratio is one — the line breaks each type moves are in the prediction, as FIT's second
 * trial took them up. Alphabets: a size the face has (`sizes`, density.mjs readSizeProbe; without it, any), each with
 * the leading that brings the ratio to one within its range; the size whose ratio comes nearest, a long one counting
 * LONG times a short one, and of those that reach it the one that keeps the paper's leading — FIT's order, the size
 * first, where the face allows it. No per-unit nudge. Out of reach, the knobs stay at their ends; `ratio` says where it
 * lands.
 */
export function solveType(units, script, sizes = null) {
  const design = DESIGN[script]
  if (!design.cjk) {
    let best = null
    for (const { size, h } of (sizes ?? scalable(design.size)).filter(p => p.size >= design.size[0] - 1e-9 && p.size <= design.size[1] + 1e-9)) {
      // the height is proportional to the leading: the one that reaches one, held to its range
      const lead = clamp(1 / heightRatio(units, script, { size, h, lead: 1 }), design.lead)
      const ratio = heightRatio(units, script, { size, h, lead })
      const cost = 10 * (ratio > 1 ? LONG : 1) * Math.abs(Math.log(ratio)) + Math.abs(Math.log(lead))
      if (!best || cost < best.cost) best = { size, h, lead, ratio, cost }
    }
    const { cost, ...type } = best
    return type
  }
  const ranges = { lead: design.lead, track: design.track, scale: design.scale }
  const at = x => { const t = cjkType(Math.exp(x), design.base, ranges); return { lead: t.lead, track: t.track, scale: t.scale } }
  const f = x => heightRatio(units, script, at(x))
  const r0 = f(0)
  // the ratio grows with x; one either side of the base type brackets what the ranges allow
  let lo = r0 < 1 ? 0 : -1, hi = r0 < 1 ? 1 : 0
  if (f(hi) < 1) lo = hi
  else if (f(lo) > 1) hi = lo
  for (let k = 0; k < 40 && hi - lo > 1e-6; k++) { const mid = (lo + hi) / 2; if (f(mid) < 1) lo = mid; else hi = mid }
  const type = at((lo + hi) / 2)
  return { ...type, ratio: heightRatio(units, script, type) }
}

/**
 * The prediction set right by a measurement (plans/2026-09-30-generic-type.md, step 4): a compile at `type` came out
 * `measured` times the original's height (the reader's previews compile anyway, and their line probes say it). Every
 * unit's width is scaled by the one factor that makes the prediction at that type agree — the paper's density as
 * measured, where the text alone could only estimate it — and solveType on the result gives the final compile's type.
 */
export function correctUnits(units, script, type, measured) {
  const scaled = k => units.map(u => ({ ...u, width: t => k * u.width(t) }))
  let lo = Math.log(0.5), hi = Math.log(2)
  for (let n = 0; n < 50 && hi - lo > 1e-9; n++) { const mid = (lo + hi) / 2; if (heightRatio(scaled(Math.exp(mid)), script, type) < measured) lo = mid; else hi = mid }
  return scaled(Math.exp((lo + hi) / 2))
}
