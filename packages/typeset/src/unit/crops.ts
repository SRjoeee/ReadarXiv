// An element's ink as crops, one a line of TeX's: box arithmetic over its segments (stride 6: page, x0, baseline, x1, top,
// bottom), ported from engine 065c1d973 layer2.mjs cropOfBox L2:1805-1807, cropPartsOfSegments L2:1819-1852, cropFields
// L2:1868. Its segments are the layout file's today; A's El.ink (one box per TeX line, its baseline) once lane L1 states it.

/** a segment's box: its extent, top, bottom and the baseline of the line TeX set it on; `lines` its segments' count */
export type SegBox = { x0: number; x1: number; top: number; bottom: number; baseline: number; lines?: number }
/** one crop of an element: its page, its rectangle [x0, y0, x1, y1] and baseline, the segment it is cut from */
export type CropPart = { page: number; crop: [number, number, number, number]; baseline: number; seg: SegBox }

/** a glyph's antialiased edge past its ink's box, PDF units: across, and up and down */
const EDGE_X = 0.4,
  EDGE_Y = 0.3
/** a crop from a segment's box: the box, its antialiased edge a fraction of a point around, on its line's baseline */
export function cropOfBox(box: SegBox): { crop: [number, number, number, number]; baseline: number } {
  return {
    crop: [box.x0 - EDGE_X, box.bottom - EDGE_Y, box.x1 + EDGE_X, box.top + EDGE_Y],
    baseline: box.baseline,
  }
}

/** two segments' baselines this near (PDF units) are one line's */
const LINE_OF = 0.5
type Seg = { page: number; x0: number; base: number; x1: number; top: number; bottom: number }
/** whether two segments are of one line: on one page, meeting across, on one baseline or stacked */
const oneLine = (a: Seg, b: Seg) => {
  if (a.page !== b.page) return false
  const over = Math.min(a.top, b.top) - Math.max(a.bottom, b.bottom)
  return over > 0 && (Math.abs(a.base - b.base) <= LINE_OF || over > 0.5 * Math.min(a.top - a.bottom, b.top - b.bottom))
}

/** an element's ink as crops, one a line of TeX's, in TeX's order; null where it has none */
export function cropPartsOfSegments(segs: readonly number[] | null | undefined): CropPart[] | null {
  const S: Seg[] = []
  for (let s = 0; s + 5 < (segs?.length ?? 0); s += 6)
    S.push({
      page: segs![s]!,
      x0: segs![s + 1]!,
      base: segs![s + 2]!,
      x1: segs![s + 3]!,
      top: segs![s + 4]!,
      bottom: segs![s + 5]!,
    })
  if (!S.length) return null
  const left = new Set(S),
    out: CropPart[] = []
  for (const s0 of S) {
    if (!left.has(s0)) continue
    left.delete(s0)
    const box = { x0: s0.x0, x1: s0.x1, top: s0.top, bottom: s0.bottom },
      inside = [s0]
    for (let grew = true; grew; ) {
      grew = false
      for (const s of left)
        if (inside.some((g) => oneLine(g, s))) {
          left.delete(s)
          inside.push(s)
          Object.assign(box, {
            x0: Math.min(box.x0, s.x0),
            x1: Math.max(box.x1, s.x1),
            top: Math.max(box.top, s.top),
            bottom: Math.min(box.bottom, s.bottom),
          })
          grew = true
        }
    }
    const mid = (box.top + box.bottom) / 2
    const on = inside.filter((s) => s.base >= box.bottom - 0.05 && s.base <= box.top + 0.05)
    const baseline = (on.length ? on : inside).reduce((a, s) =>
      Math.abs(s.base - mid) < Math.abs(a.base - mid) ? s : a,
    ).base
    const seg = { ...box, baseline, lines: 1 }
    out.push({ page: s0.page, ...cropOfBox(seg), seg })
  }
  return out
}

/** a crop resolution's own fields from its parts: the first one's page, rectangle and baseline, and the parts themselves
 *  where there are more than one (a formula TeX broke over lines) */
export const cropFields = (parts: CropPart[]) => ({
  mode: 'crop' as const,
  page: parts[0]!.page,
  crop: parts[0]!.crop,
  baseline: parts[0]!.baseline,
  ...(parts.length > 1 ? { parts } : {}),
})

type Rect = [x0: number, y0: number, x1: number, y1: number]
const r2 = (v: number) => Math.round(v * 100) / 100
const meet = (a: Rect, b: Rect): Rect | null => {
  const x0 = Math.max(a[0], b[0]),
    y0 = Math.max(a[1], b[1]),
    x1 = Math.min(a[2], b[2]),
    y1 = Math.min(a[3], b[3])
  return x1 > x0 && y1 > y0 ? [x0, y0, x1, y1] : null
}
const inside = (a: Rect, b: Rect) => a[0] >= b[0] && a[1] >= b[1] && a[2] <= b[2] && a[3] <= b[3]
/** rectangle `r` less rectangle `n`: what of `r` stands left, right, under and over `n`, each a rectangle of its own */
function less(r: Rect, n: Rect): Rect[] {
  const m = meet(r, n)
  if (!m) return [r]
  const out: Rect[] = []
  if (m[0] > r[0]) out.push([r[0], r[1], m[0], r[3]])
  if (m[2] < r[2]) out.push([m[2], r[1], r[2], r[3]])
  if (m[1] > r[1]) out.push([m[0], r[1], m[2], m[1]])
  if (m[3] < r[3]) out.push([m[0], m[3], m[2], r[3]])
  return out
}

/**
 * The rectangles a crop is drawn through, where another piece's ink stands in its rectangle; none where none does. A crop is
 * cut from the page's crop render, which shows every element and label of the page (format's groups: `e` and `l` on, `t`
 * off), so a rectangle cut whole carries whatever of another piece's ink its margin reaches: 2610.21312v1 p5's line-1
 * formula, its rectangle a third of a point under its ink, carried the glyph tops of line 2's "det M = 1", whose ink the
 * translation drew 5.8 pt lower, and they stayed behind as a row of dots. Drawn through its own ink's boxes whole (`own`, the
 * part's boxes of its piece on its line: where another's box overlaps them TeX set ink of both there, which no box tells
 * apart) and the rest of its rectangle clear of the other pieces' boxes with their antialiased edge (`others`, grown as a
 * crop's own rectangle is: cropOfBox), it carries its own ink and its margin and nothing of theirs outside its own box. `src`
 * its source (page, x0, y0, x1, y1, base); none where it knows no ink of its own in its rectangle (it is then cut whole, as
 * before)
 */
export function cropClip(src: readonly number[], own: readonly Rect[], others: readonly Rect[]): Rect[] | undefined {
  const s: Rect = [src[1]!, src[2]!, src[3]!, src[4]!]
  const mine = own.flatMap((b) => {
    const m = meet(b, s)
    return m ? [m] : []
  })
  if (!mine.length) return undefined
  // (another's ink with its antialiased edge, where it meets the rectangle outside its own ink)
  const hits = others
    .map((n): Rect => [n[0] - EDGE_X, n[1] - EDGE_Y, n[2] + EDGE_X, n[3] + EDGE_Y])
    .filter((n) => {
      const m = meet(n, s)
      return !!m && !mine.some((o) => inside(m, o))
    })
  if (!hits.length) return undefined
  let clear: Rect[] = [s]
  for (const n of hits) clear = clear.flatMap((r) => less(r, n))
  const out = [...mine, ...clear.filter((r) => !mine.some((o) => inside(r, o)))]
  return out.map((r) => r.map(r2) as Rect)
}
