// One set of type for a whole translation, found from predicted lines (plans/2026-09-30-generic-type.md, step 2). The
// design table gives each writing system its knobs and their natural ranges — data, to be refined per language by the
// owner's eye; the solver finds, within them, the type at which the translation's predicted height equals the
// original's. The same for every paper, every class, every language: no compile, no trial, no per-block rule.
import { cjkType } from './lock.mjs'
import { linesAt } from './density.mjs'

const CJK_DESIGN = (lead, range) => ({ cjk: true, base: { lead, track: 0, scale: 1 }, lead: range, track: [0, 0.05], scale: [0.92, 1] })
const ALPHABET = { cjk: false, size: [0.93, 1], lead: [0.95, 1.1] }
/**
 * Per writing system, as FIT had them (lock.mjs CJK_RANGES, visual-eval-lib.mjs FIT) so that the generic column
 * differs from FIT only in how it finds the type: CJK — leading × the paper's own (Chinese from its reader's 1.3,
 * Japanese and Korean from the paper's), tracking between CJK characters in em, the CJK face's scale; alphabets — the
 * size of the translated text, then its leading × the paper's.
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
 * lines in em, the translation's width in em (density.mjs).
 */
export function heightRatio(units, script, type) {
  const design = DESIGN[script]
  let o = 0, t = 0
  for (const u of units) {
    o += u.lo * u.bs
    t += design.cjk
      ? linesAt(u.width(type), u.cap) * type.lead * u.bs
      : linesAt(u.width(type), u.cap / type.size) * type.lead * type.size * u.bs
  }
  return o ? t / o : 1
}

/**
 * The type for a translation. CJK: the knobs share the change as lock.mjs cjkType shares it, and the share is found by
 * bisection so that the predicted ratio is one — the line breaks each type moves are in the prediction, as FIT's second
 * trial took them up. Alphabets: FIT's order — the size from the ratio at the paper's type, the leading from the ratio
 * at that size — with no per-unit nudge. Out of reach, the knobs stay at their ends; `ratio` says where it lands.
 */
export function solveType(units, script) {
  const design = DESIGN[script]
  if (!design.cjk) {
    const r0 = heightRatio(units, script, { size: 1, lead: 1 })
    const size = Math.min(design.size[1], Math.max(design.size[0], Math.sqrt(1 / r0)))
    const r1 = heightRatio(units, script, { size, lead: 1 })
    const lead = Math.min(design.lead[1], Math.max(design.lead[0], 1 / r1))
    return { size, lead, ratio: heightRatio(units, script, { size, lead }) }
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
