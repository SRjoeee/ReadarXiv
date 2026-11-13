// S.figures' fit (docs/PDF-READER.md §19.12): a figure text keeps the original's size wherever its translation is no wider than
// the original (the owner's rule of 2026-11-13: whether to shrink is whether the translation goes past the original's own room;
// where it does not, it is not shrunk). Width is the only test, and the text's own: each text is sized by its own width alone,
// whatever the other texts of its figure need (the owner's ruling of 2026-11-13 on a figure's sets, (B): each at its own size).
// Height is none: drawn at the original's size a translation stands in the band the original's line stands in, so no stroke
// under it, no ink over it and no container's edge is measured. A wider translation, on its original's baseline from its
// anchor's edge, takes the free line beside its box (its room, `before` and `after`, as the part states it); where that is not
// enough it steps by what its width needs and no more, to `floor` of the size at the most (one needing less is left the
// original's, `unfit`). A translation is fitted and anchored by its ink, as every line the breaker sets: a full-width mark's
// blank half at its edge (`blank1`, B.break leadOf and hangOf) is no part of the line it needs, and stands past its anchor's
// edge (today's set it by its advance: a centred label ending with a closing mark a quarter em off its original's middle, a
// right-aligned one half an em short of its end). Ported from engine 065c1d973 layer-proto/figure-fit.mjs (lineOf, fitFigure,
// sameAsSource; today's fitted a set by one factor, fitFigureSet).

/** a figure unit as the fit reads it: its box's length along its run, its size, its anchor, its room before and after its box */
export type FitFigure = {
  length: number
  size: number
  anchor: 'start' | 'centre' | 'end'
  before: number
  after: number
}
/** where a translation is drawn: its size, how far along its run's direction from its origin it begins, its width */
export type FigureFit = { size: number; offset: number; width: number }

/** a unit's line a translation may take along its direction: its box, and its room on the side (or sides) its anchor grows to */
const lineOf = (f: FitFigure) => {
  const before = f.before > 0 ? f.before : 0,
    after = f.after > 0 ? f.after : 0
  return f.length + (f.anchor === 'start' ? after : f.anchor === 'end' ? before : 2 * Math.min(before, after))
}

/**
 * Where a translation is drawn (figure-fit.mjs fitFigure): at the factor its width needs of its line, 1 where it is no wider;
 * null where that factor is under `floor` (or it has no width, size or box). Its `width1` is its advance at size 1, `blank1`
 * the blank halves at its edges, before its ink and after it (none where not given): its ink, its advance less them, is what
 * it needs of its line and what its anchor places
 */
export function fitFigure(
  item: { f: FitFigure; width1: number; blank1?: readonly [number, number] },
  floor: number,
): FigureFit | null {
  const { f, width1, blank1 } = item
  const ink1 = width1 - (blank1 ? blank1[0] + blank1[1] : 0)
  if (!(ink1 > 0) || !(f.length > 0) || !(f.size > 0)) return null
  // (its width against its line: its box and the free line its anchor grows into)
  const full = ink1 * f.size,
    line = lineOf(f)
  const k = full > line ? line / full : 1
  if (!(k >= floor - 1e-9)) return null
  const size = f.size * k,
    ink = ink1 * size
  // (its ink from its anchor's edge, its advance from the blank half before its ink)
  const at = f.anchor === 'start' ? 0 : f.anchor === 'end' ? f.length - ink : (f.length - ink) / 2
  return { size, offset: at - (blank1 ? blank1[0] * size : 0), width: width1 * size }
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
