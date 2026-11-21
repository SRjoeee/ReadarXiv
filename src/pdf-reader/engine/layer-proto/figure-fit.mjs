// A figure's text drawn in its run's place (docs/route/orphan-text.md stage 5, the content class `figures`): the fit rule the layer
// draws each figure unit by (run.mjs paintFigures), by its set (the owner's rule of 2026-10-29, docs/PDF-READER.md §19.12). The
// labels of one set (one column or one baseline of a figure: layout/figure-text.mjs setsOf) are drawn at one size, the original's
// where each translation fits; a translation sits on its original's baseline, from its original's edge (its anchor: the start
// where the original was set from its start, a legend's entry, its column's; the end where it was set to its end, a label
// against its axis; else the middle, a node's text, an axis title), and may take the free line beside its box that the maker
// found (its room, `before` and `after`: figure-text.mjs roomsOf, clear of other ink and inside its figure; a middle one the same
// either side). Where one translation does not fit, its whole set shrinks by one factor, the least its translations need, never
// a label alone, to `floor` of the size at the most (the layout rules' last floor, P.floorMin, as a babel name's): a label that
// would need less is left the original's (`unfit`), and the rest of its set keeps the one factor the others need. A unit over a
// stroke under its text (figure-text.mjs roomOf's `under`: a gridline its original's descenders were set over) is drawn where
// its translation, at the size its set gives it, stays above that stroke: its depth (its runs' ink in their faces, a CJK run's
// held to its em box: layer2.mjs figureRunsDepth) is the target's, so a CJK translation clears a gridline a Latin one's
// descenders reach; one
// that reaches it is left the original's (`crowded`), as the maker leaves a unit other ink crosses, and the rest of its set is
// fitted again without it.
// Pure; an original module (no port statement), importing nothing.

/** a unit's line a translation may take along its direction: its box, and its room on the side (or sides) its anchor grows to */
const lineOf = f => {
  const before = f.before > 0 ? f.before : 0, after = f.after > 0 ? f.after : 0
  return f.length + (f.anchor === 'start' ? after : f.anchor === 'end' ? before : 2 * Math.min(before, after))
}

/** a CJK face's em box under its baseline, of its size: the ideographic em box its characters are designed in (0.88 over the
 *  baseline, 0.12 under, as layer2.mjs cellBands holds a CJK cell's lines clear of its rules), the depth a CJK run of a
 *  translation is held to at the most (layer2.mjs figureRunsDepth: its ink, a mark's tail past the box the box's), its face's
 *  size correction applied */
export const CJK_FOOT = 0.12

/**
 * Where the translations of one set are drawn: `items` each { f: its unit ({ length, size, anchor, before, after, under }),
 * width1: its translation's width at size 1 (PDF units per unit of size: layer2.mjs runsWidth), depth1: how far under its
 * baseline the translation reaches at size 1 (layer2.mjs figureRunsDepth; none, no stroke read) }. Returns, item by item,
 * { size, offset, width } — its size, how far along the run's direction from the run's origin it begins (below 0 where it grows
 * back past it), and its width —, null where it does not fit at `floor` of its size (no width, no size, no box: null too), or
 * false where, at the size it is given, its translation reaches the stroke under its unit's text (`f.under`, the stroke's depth
 * under the baseline, PDF units: depth1 times its size at that depth or more). One factor for every item drawn: the least any of
 * them needs, at least `floor`, those that reach their stroke aside (the set fitted again without them, until none does: each
 * round's factor no less than the one before, as an item fewer needs no less)
 */
export function fitFigureSet(items, floor) {
  const need = items.map(({ f, width1 }) => {
    if (!(width1 > 0) || !(f.length > 0) || !(f.size > 0)) return 0
    const full = width1 * f.size, line = lineOf(f)
    return full > line ? line / full : 1
  })
  const met = items.map(() => false)
  let k = 1
  for (let more = true; more;) {
    const drawn = need.filter((n, i) => n >= floor - 1e-9 && !met[i])
    k = drawn.length ? Math.min(...drawn) : 1
    more = false
    items.forEach(({ f, depth1 }, i) => {
      if (met[i] || !(need[i] >= floor - 1e-9) || !Number.isFinite(f.under) || !Number.isFinite(depth1)) return
      if (depth1 * f.size * k >= f.under) { met[i] = true; more = true }
    })
  }
  return items.map(({ f, width1 }, i) => {
    if (!(need[i] >= floor - 1e-9)) return null
    if (met[i]) return false
    const size = f.size * k, w = width1 * size
    const offset = f.anchor === 'start' ? 0 : f.anchor === 'end' ? f.length - w : (f.length - w) / 2
    return { size, offset, width: w }
  })
}

/** one unit fitted alone (a set of one) */
export const fitFigure = (f, width1, floor, depth1) => fitFigureSet([{ f, width1, depth1 }], floor)[0]

/** whether a translation says nothing other than its source: the same letters and digits, case and spacing aside (it is then not
 *  drawn: the original's ink stays) */
export const sameAsSource = (tr, src) => {
  const key = s => s.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')
  return key(tr) === key(src)
}
