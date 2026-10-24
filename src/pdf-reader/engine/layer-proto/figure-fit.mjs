// A figure's text drawn in its run's box (docs/route/orphan-text.md stage 5, the content class `figures`): the fit rule the layer
// draws each figure unit by (run.mjs paintFigures). The translation sits on the original's baseline, in the original run's box
// (its length along its direction, layout/figure-text.mjs), at the original's size, shrunk to fit that length where it is longer,
// to `floor` of the size at the most (the layout rules' last floor, P.floorMin, as a babel name's): past it the unit is left the
// original's (`unfit`). Its anchor keeps its place: the start where the original was set from its start (a legend's entry after
// its line), the end where it was set to its end (a label against its axis), else the middle (a node's text, an axis title).
// The box's band was found clear of other ink by the maker (figure-text.mjs `crowded`), so nothing drawn in it covers other ink.
// Pure; an original module (no port statement), importing nothing.

/**
 * Where a translation `width1` wide at size 1 (PDF units per unit of size: layer2.mjs runsWidth) is drawn in figure unit `f`
 * ({ length, size, anchor }): { size, offset } — its size, and how far along the run's direction from the run's origin it begins —,
 * or null where it does not fit at `floor` of the size
 */
export function fitFigure(f, width1, floor) {
  if (!(width1 > 0) || !(f.length > 0) || !(f.size > 0)) return null
  const full = width1 * f.size
  const k = full > f.length ? f.length / full : 1
  if (k < floor - 1e-9) return null
  const size = f.size * k, w = full * k
  const offset = f.anchor === 'start' ? 0 : f.anchor === 'end' ? f.length - w : (f.length - w) / 2
  return { size, offset, width: w }
}

/** whether a translation says nothing other than its source: the same letters and digits, case and spacing aside (it is then not
 *  drawn: the original's ink stays) */
export const sameAsSource = (tr, src) => {
  const key = s => s.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')
  return key(tr) === key(src)
}
