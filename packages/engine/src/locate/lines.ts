// A unit's lines, cut in its own glyph run in stream order by one rule (design §4.1, "geometry is A's"; spike S1 §2): the next
// glyph starts a line where it leaves the line's baseline band (half a size) and jumps back left of the glyph before it, or
// far on to its right (two sizes), or more than one and a half sizes up or down (a column's top: no script is that far); and
// wherever the page changes. A glyph off the band that goes on along it (a script, a fraction's parts) is the line's. A line's
// baseline is the one most of its body glyphs' characters share (to 0.01 pt; today's maker's rowOf); its extent their
// advances'; its top and bottom their own ink's; its size today's (lineSize).
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

/** a line's body glyphs: within this share of its size (MAKE:72) */
const BODY = 0.15
/**
 * A line's size as today's maker states it (layout/make.mjs rowOf and mainsOf, MAKE:382-401): the median of its main glyphs'
 * sizes (the upper one of an even count), its main glyphs those within PART_MAIN of its largest size where they set at least
 * MAINS_SHARE of its characters (a line of words with a large formula sign is the line of its words), else all of them; to a
 * hundredth, at most SIZE_MAX. The typesetter draws a line's band by it (texRects); its fonts' boxes are its top and bottom
 */
const PART_MAIN = 0.85
const MAINS_SHARE = 0.25
const SIZE_MAX = 200
export function lineSize(gs: readonly DocGlyph[]): number {
  if (!gs.length) return 0
  let big = 0
  let all = 0
  let inBig = 0
  for (const g of gs) if (g.size > big) big = g.size
  const mains = gs.filter((g) => g.size >= PART_MAIN * big)
  for (const g of gs) all += Math.max(1, g.u.length)
  for (const g of mains) inBig += Math.max(1, g.u.length)
  const sizes = (inBig >= MAINS_SHARE * all ? mains : gs).map((g) => g.size).sort((a, b) => a - b)
  return r2(Math.min(SIZE_MAX, sizes[sizes.length >> 1] as number))
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
    // (its baseline the one most of its body glyphs' characters share, to a hundredth: its glyphs within BODY of its size,
    // all where none is; today's rowOf and baselineOf, MAKE:283-291, 397-410)
    const glyphs = l.gs.map((i) => at(i).g)
    const lsize = lineSize(glyphs)
    const body = glyphs.filter((g) => Math.abs(g.size - lsize) <= BODY * lsize)
    const votes = new Map<number, number>()
    for (const g of body.length ? body : glyphs) {
      const y = r2(g.y)
      votes.set(y, (votes.get(y) ?? 0) + Math.max(1, g.u.length))
    }
    const sizes = new Map<number, number>()
    let x0 = Number.POSITIVE_INFINITY
    let x1 = Number.NEGATIVE_INFINITY
    let top = Number.NEGATIVE_INFINITY
    let bottom = Number.POSITIVE_INFINITY
    for (const i of l.gs) {
      const { g } = at(i)
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
