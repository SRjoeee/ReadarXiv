// One set of type for a whole translation, found from predicted lines (records/typesetting.md in
// experiments/pdf-bilingual). The design table gives each writing system its knobs and their natural ranges; the solver
// finds, within them, the type at which the translation's predicted height equals the original's. The same for every
// paper, every class, every language: no compile, no trial, no per-block rule.
import { linesAt } from './density.mjs'

const CJK_DESIGN = (lead, range) => ({ cjk: true, base: { lead, track: 0, scale: 1 }, lead: range, track: [0, 0.05], scale: [0.92, 1] })
const ALPHABET = { cjk: false, size: [0.9, 1], lead: [0.95, 1.1] }
/**
 * Per writing system. CJK: leading × the paper's own (Chinese from its reader's 1.3, Japanese and Korean from the
 * paper's), tracking between CJK characters in em, the CJK face's scale. Alphabets: the size of the translated text,
 * then its leading × the paper's; the floor is the size a class sets as \small below a 10 pt body (9 pt) — where a face
 * has fixed sizes, the size below 10 pt is 9.
 */
export const DESIGN = {
  Hans: CJK_DESIGN(1.3, [1.2, 1.45]),
  Hant: CJK_DESIGN(1.3, [1.2, 1.45]),
  Jpan: CJK_DESIGN(1, [1, 1.45]),
  Kore: CJK_DESIGN(1, [1, 1.45]),
  Latn: ALPHABET,
  Cyrl: ALPHABET,
}

// a translation that runs long pushes floats and forced page breaks to later pages (2608.09038 gained two pages when
// its main text ran a third of a column long); one that runs short leaves white space at a column's end. Of two types
// that miss, the one that runs short
const LONG = 2
// a face without a size probe: every size in the range, as wide as its size
const scalable = ([lo, hi]) => Array.from({ length: Math.round((hi - lo) / 0.005) + 1 }, (_, k) => { const size = Number((lo + k * 0.005).toFixed(4)); return { size, h: size } })
const clamp = (x, [lo, hi]) => Math.min(hi, Math.max(lo, x))

// a unit's predicted lines at a type, its face `f` times the type's own: what it fills of a line is that much less
const linesOf = (u, design, type, f = 1) => (design.cjk ? linesAt(u.width(type) * f, u.cap) : linesAt(u.width(type) * (type.h ?? type.size) * f, u.cap))
// a unit's predicted height at a type, at leading one: its lines × its size (an alphabet's, and `f`) × the paper's leading
const heightAt = (u, design, type, f = 1) => linesOf(u, design, type, f) * (design.cjk ? 1 : type.size) * f * u.bs

/**
 * The translation's predicted height over the original's, at a type: each unit's predicted lines — its width at the
 * type over its ruler's capacity (an alphabet set smaller takes more to a line) — at its leading, over its original's
 * lines at the paper's. `units`: { lo, bs, cap, width(type) } — the original's lines and leading, the capacity of its
 * lines in em, the translation's width in em (density.mjs measureUnits). An alphabet's type: its size, how wide the
 * face sets there against the body (`h`, the size probe's; the size itself for a face that only scales), its leading.
 */
export function heightRatio(units, script, type) {
  const design = DESIGN[script]
  let o = 0, t = 0
  for (const u of units) { o += u.lo * u.bs; t += heightAt(u, design, type) * type.lead }
  return o ? t / o : 1
}
/** a unit's predicted height at a type and leading one, its face `f` times the type's own (flow.mjs's shrink) */
export const heightAtSize = (u, script, type, f = 1) => heightAt(u, DESIGN[script], type, f)
/** each unit's predicted height at a type and leading one, by its index: what flowType takes from a prediction */
export const unitHeights = (units, script, type) => new Map(units.map(u => [u.i, heightAt(u, DESIGN[script], type)]))
/** each unit's predicted lines at a type, by its index */
export const unitLines = (units, script, type) => new Map(units.map(u => [u.i, linesOf(u, DESIGN[script], type)]))

/**
 * CJK's three knobs at a change of height `a` (the original's height over the translation's at `base`): each moves, in
 * log terms, an equal share of what is needed, a knob at the end of its range handing the rest to the others, and what
 * no knob can give is left (the page ends a little early or late: better than type out of its range). Leading × the
 * paper's spacing; tracking in em; scale × the size
 */
export function cjkType(a, base, ranges) {
  const knobs = [
    { key: 'lead', at: base.lead, lo: ranges.lead[0], hi: ranges.lead[1], factor: v => v / base.lead },
    { key: 'track', at: base.track, lo: ranges.track[0], hi: ranges.track[1], factor: v => (1 + v) / (1 + base.track) },
    { key: 'scale', at: base.scale, lo: ranges.scale[0], hi: ranges.scale[1], factor: v => v / base.scale },
  ]
  // each knob's room in the direction needed, as a log factor it can still give
  const room = k => Math.log(k.factor(a > 1 ? k.hi : k.lo))
  const want = Math.log(a)
  const share = new Map(knobs.map(k => [k.key, 0]))
  let left = want, open = knobs.filter(k => (a > 1 ? room(k) > 1e-9 : room(k) < -1e-9))
  while (open.length && Math.abs(left) > 1e-9) {
    const each = left / open.length
    const next = []
    for (const k of open) {
      const can = room(k) - share.get(k.key)
      const take = a > 1 ? Math.min(each, can) : Math.max(each, can)
      share.set(k.key, share.get(k.key) + take); left -= take
      if (Math.abs(take - each) < 1e-12) next.push(k)
    }
    if (next.length === open.length) break
    open = next
  }
  const value = k => (k.key === 'track' ? (1 + base.track) * Math.exp(share.get(k.key)) - 1 : k.at * Math.exp(share.get(k.key)))
  return { lead: value(knobs[0]), track: value(knobs[1]), scale: value(knobs[2]), reached: Math.exp(want - left) }
}

/**
 * The type for a translation. CJK: the knobs share the change as cjkType shares it, and the share is found by bisection
 * so that the predicted ratio is one — the line breaks each type moves are in the prediction. Alphabets: a size the
 * face has (`sizes`, density.mjs readSizeProbe; without it, any), each with the leading that brings the ratio to one
 * within its range; the size whose ratio comes nearest, a long one counting LONG times a short one, and of those that
 * reach it the one that keeps the paper's leading. Out of reach, the knobs stay at their ends; `ratio` says where it lands.
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
 * The prediction set right by a measurement: a compile at `type` came out `measured` times the original's height (the
 * preview's line probes say it). Every unit's width is scaled by the one factor that makes the prediction at that type
 * agree — the paper's density as measured, where the text alone could only estimate it — and solveType on the result
 * gives the final compile's type.
 */
export function correctUnits(units, script, type, measured) {
  const scaled = k => units.map(u => ({ ...u, width: t => k * u.width(t) }))
  let lo = Math.log(0.5), hi = Math.log(2)
  for (let n = 0; n < 50 && hi - lo > 1e-9; n++) { const mid = (lo + hi) / 2; if (heightRatio(scaled(Math.exp(mid)), script, type) < measured) lo = mid; else hi = mid }
  return scaled(Math.exp((lo + hi) / 2))
}
