// A unit's lines, cut in its own glyph run in stream order by one rule (design §4.1, "geometry is A's"; spike S1 §2): the next
// glyph starts a line where it leaves the line's baseline band (half a size) and jumps back left of the glyph before it, or
// far on to its right (two sizes), or more than one and a half sizes up or down (a column's top: no script is that far); and
// wherever the page changes. A glyph off the band that goes on along it (a script, a fraction's parts) is the line's. A line's
// baseline is its glyphs' most common one (to 0.01 pt); its extent their advances'; its top and bottom their own ink's.
import type { DocGlyph } from '../doc.ts'

export interface CutLine {
  page: number
  /** the glyphs, as given (global indices or whatever the caller indexes by), in stream order */
  gs: number[]
  x0: number
  x1: number
  base: number
  top: number
  bottom: number
  /** the largest size on it, and the most common */
  size: number
  most: number
}

export const r2 = (v: number): number => {
  const r = Math.round(v * 100) / 100
  return Object.is(r, -0) ? 0 : r
}

/** the lines of `list` (each an index `at` resolves to its page and glyph), blank glyphs aside */
export function cutLines(list: readonly number[], at: (i: number) => { page: number; g: DocGlyph }): CutLine[] {
  const out: { page: number; y0: number; size: number; gs: number[] }[] = []
  let L: (typeof out)[number] | null = null
  let prev: DocGlyph | null = null
  for (const i of list) {
    const { page, g } = at(i)
    if (!/\S/.test(g.u)) continue
    const off = L !== null && Math.abs(g.y - L.y0) >= 0.5 * Math.max(L.size, g.size)
    const jump =
      L !== null &&
      prev !== null &&
      (g.x0 < prev.x0 - 0.5 * g.size ||
        g.x0 > prev.x1 + 2 * Math.max(prev.size, g.size) ||
        Math.abs(g.y - L.y0) > 1.5 * Math.max(L.size, g.size))
    if (L === null || page !== L.page || (off && jump)) {
      L = { page, y0: g.y, size: g.size, gs: [] }
      out.push(L)
    }
    L.gs.push(i)
    if (g.size > L.size) L.size = g.size
    prev = g
  }
  return out.map((l) => {
    const votes = new Map<number, number>()
    const sizes = new Map<number, number>()
    let x0 = Number.POSITIVE_INFINITY
    let x1 = Number.NEGATIVE_INFINITY
    let top = Number.NEGATIVE_INFINITY
    let bottom = Number.POSITIVE_INFINITY
    for (const i of l.gs) {
      const { g } = at(i)
      const y = r2(g.y)
      votes.set(y, (votes.get(y) ?? 0) + 1)
      const s = r2(g.size)
      sizes.set(s, (sizes.get(s) ?? 0) + 1)
      if (g.x0 < x0) x0 = g.x0
      if (g.x1 > x1) x1 = g.x1
      if (g.top > top) top = g.top
      if (g.bottom < bottom) bottom = g.bottom
    }
    const base = [...votes].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0]![0]
    const most = [...sizes].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0]![0]
    return { page: l.page, gs: l.gs, x0, x1, base, top, bottom, size: l.size, most }
  })
}
