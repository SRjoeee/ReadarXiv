// An element's ink as crops, one a line of TeX's: box arithmetic over its segments (stride 6: page, x0, baseline, x1, top,
// bottom), ported from engine 065c1d973 layer2.mjs cropOfBox L2:1805-1807, cropPartsOfSegments L2:1819-1852, cropFields
// L2:1868. Its segments are the layout file's today; A's El.ink (one box per TeX line, its baseline) once lane L1 states it.

/** a segment's box: its extent, top, bottom and the baseline of the line TeX set it on; `lines` its segments' count */
export type SegBox = { x0: number; x1: number; top: number; bottom: number; baseline: number; lines?: number }
/** one crop of an element: its page, its rectangle [x0, y0, x1, y1] and baseline, the segment it is cut from */
export type CropPart = { page: number; crop: [number, number, number, number]; baseline: number; seg: SegBox }

/** a crop from a segment's box: the box, its antialiased edge a fraction of a point around, on its line's baseline */
export function cropOfBox(box: SegBox): { crop: [number, number, number, number]; baseline: number } {
  return { crop: [box.x0 - 0.4, box.bottom - 0.3, box.x1 + 0.4, box.top + 0.3], baseline: box.baseline }
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
