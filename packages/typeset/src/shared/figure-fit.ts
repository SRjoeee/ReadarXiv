// S.figures' fit (the owner's rule of 2026-10-29, docs/PDF-READER.md §19.12): the labels of one set (one column or one baseline
// of a figure) drawn at one size, the original's where each translation fits; a translation on its original's baseline, from
// its anchor's edge, into the free line beside its box (its room, `before` and `after`); where one does not fit, its whole set
// shrinks by one factor, the least its translations need, to `floor` of the size at the most (a label needing less is left
// the original's, `unfit`); a translation that reaches the stroke under its original's text at the size its set gives it is
// left the original's (`crowded`), and the rest of its set fitted again without it. Ported from engine 065c1d973
// layer-proto/figure-fit.mjs (lineOf, CJK_FOOT, fitFigureSet, sameAsSource).

/** a figure unit as the fit reads it: its box's length along its run, its size, its anchor, its room before and after its
 *  box, the depth under its baseline of a stroke under its text (null where none is) */
export type FitFigure = {
  length: number
  size: number
  anchor: 'start' | 'centre' | 'end'
  before: number
  after: number
  under: number | null
}
/** where a translation is drawn: its size, how far along its run's direction from its origin it begins, its width */
export type FigureFit = { size: number; offset: number; width: number }

/** a unit's line a translation may take along its direction: its box, and its room on the side (or sides) its anchor grows to */
const lineOf = (f: FitFigure) => {
  const before = f.before > 0 ? f.before : 0,
    after = f.after > 0 ? f.after : 0
  return f.length + (f.anchor === 'start' ? after : f.anchor === 'end' ? before : 2 * Math.min(before, after))
}

/** a CJK face's em box under its baseline, of its size: the depth a CJK run of a translation is held to at the most */
export const CJK_FOOT = 0.12

/**
 * Where the translations of one set are drawn (figure-fit.mjs fitFigureSet): item by item its fit, null where it does not fit
 * at `floor` of its size (or has no width, size or box), false where at the size it is given it reaches the stroke under its
 * text. One factor for every item drawn: the least any of them needs, at least `floor`, those that reach their stroke aside
 */
export function fitFigureSet(
  items: readonly { f: FitFigure; width1: number; depth1: number }[],
  floor: number,
): (FigureFit | null | false)[] {
  const need = items.map(({ f, width1 }) => {
    if (!(width1 > 0) || !(f.length > 0) || !(f.size > 0)) return 0
    const full = width1 * f.size,
      line = lineOf(f)
    return full > line ? line / full : 1
  })
  const met = items.map(() => false)
  let k = 1
  for (let more = true; more; ) {
    const drawn = need.filter((n, i) => n >= floor - 1e-9 && !met[i])
    k = drawn.length ? Math.min(...drawn) : 1
    more = false
    items.forEach(({ f, depth1 }, i) => {
      // (today's `Number.isFinite(f.under)`: a row of no stroke under its text holds null)
      if (met[i] || !(need[i]! >= floor - 1e-9) || !Number.isFinite(f.under) || !Number.isFinite(depth1)) return
      if (depth1 * f.size * k >= (f.under as number)) {
        met[i] = true
        more = true
      }
    })
  }
  return items.map(({ f, width1 }, i) => {
    if (!(need[i]! >= floor - 1e-9)) return null
    if (met[i]) return false
    const size = f.size * k,
      w = width1 * size
    const offset = f.anchor === 'start' ? 0 : f.anchor === 'end' ? f.length - w : (f.length - w) / 2
    return { size, offset, width: w }
  })
}

/** whether a translation says nothing other than its source: the same letters and digits, case and spacing aside */
export const sameAsSource = (tr: string, src: string): boolean => {
  const key = (s: string) =>
    s
      .normalize('NFKC')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]/gu, '')
  return key(tr) === key(src)
}
