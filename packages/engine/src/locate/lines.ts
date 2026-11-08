// A unit's lines, cut in its own glyph run in stream order by one rule (design §4.1, "geometry is A's"; spike S1 §2): the next
// glyph starts a line where it leaves the line's baseline band (half a size about the baseline its body glyphs so far share)
// and jumps back left of the glyph before it, or far on to its right (two sizes), or more than one and a half sizes up or down
// (a column's top: no script is that far); and wherever the page changes. A glyph off the band that goes on along it (a
// script, a fraction's parts), or whose ink reaches across the line's (a big delimiter, its origin at its top), is the line's. A line's
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
  type Open = {
    page: number
    y0: number
    size: number
    gs: number[]
    votes: Map<number, number>
    best: number
    top: number
    bottom: number
    /** its first glyph's start */
    x0: number
    /** each baseline's glyphs' ink, over and under (a hundredth's grid): the band of the line's own text is its baseline's */
    bands: Map<number, [top: number, bottom: number]>
  }
  const out: Open[] = []
  let L: Open | null = null
  let prev: DocGlyph | null = null
  // (the band a line's next glyph is read against: the baseline its body glyphs so far share (those within BODY of its largest
  // size, by characters), not its first glyph's, which may be a script or a fraction's part: 2610.21765v1 p9, a line opening
  // with 1/√2π's numerator, whose band then cut the formula's last fraction off as a line of its own)
  const vote = (l: Open, g: DocGlyph) => {
    if (Math.abs(g.size - l.size) > BODY * l.size) return
    const y = r2(g.y)
    const n = (l.votes.get(y) ?? 0) + Math.max(1, g.u.length)
    l.votes.set(y, n)
    if (n > l.best) {
      l.best = n
      l.y0 = y
    }
  }
  for (const i of list) {
    const { page, g } = at(i)
    if (!/\S/.test(g.u)) continue
    // (a glyph whose ink reaches across the line's ink so far, not back to the line's start, stands on the line wherever its
    // origin is: a big delimiter or operator, whose origin TeX's math extension sets at its top (17 pt over a 10 pt line in
    // 2610.21026v1 p20, which cut the rest of its formula off as a line of its own on the same baseline), a fraction's
    // denominator back under its numerator, and what follows a delimiter that opens a line; the next line begins back at the
    // line's start)
    const back = prev !== null && g.x0 < prev.x0 - 0.5 * g.size
    // (back to the line's start or before it: where a line begins; back within the line, a fraction's denominator)
    const toStart = back && L !== null && g.x0 <= L.x0 + 0.5 * g.size
    // (the ink it crosses is the line's own text's, on the baseline its body glyphs share: a tall formula's ink beside it is
    // no line of it, so an indented continuation under a formula reaching down to it starts a line (cloud Codex on
    // fa6e1c089: an item's second line, x 85, baseline 688, beside an inline formula down to 680, read with the first))
    const band = L ? (L.bands.get(r2(L.y0)) ?? [L.top, L.bottom]) : null
    const crosses = L !== null && band !== null && !toStart && g.bottom < band[0] && g.top > band[1]
    // (back at the line's start, a glyph whose ink stands wholly over or under the line's own text is off it wherever its
    // origin is: a big operator TeX's math extension sets with its origin at its top, opening the next row of a formula broken
    // after its "=" (2610.21504v1 p4: the summation sign's origin 4.5 pt under the row above, within its band, its ink all under
    // that row's text), as `crosses` keeps one whose ink reaches across the line wherever its origin is)
    const apart = toStart && band !== null && (g.top < band[1] || g.bottom > band[0])
    const off = L !== null && !crosses && (apart || Math.abs(g.y - L.y0) >= 0.5 * Math.max(L.size, g.size))
    const jump =
      L !== null &&
      prev !== null &&
      (back ||
        g.x0 > prev.x1 + 2 * Math.max(prev.size, g.size) ||
        (!crosses && Math.abs(g.y - L.y0) > 1.5 * Math.max(L.size, g.size)))
    if (L === null || page !== L.page || (off && jump)) {
      L = {
        page,
        y0: g.y,
        size: g.size,
        gs: [],
        votes: new Map(),
        best: 0,
        top: g.top,
        bottom: g.bottom,
        x0: g.x0,
        bands: new Map(),
      }
      out.push(L)
    }
    L.gs.push(i)
    const yb = r2(g.y)
    const bd = L.bands.get(yb)
    if (!bd) L.bands.set(yb, [g.top, g.bottom])
    else {
      if (g.top > bd[0]) bd[0] = g.top
      if (g.bottom < bd[1]) bd[1] = g.bottom
    }
    if (g.top > L.top) L.top = g.top
    if (g.bottom < L.bottom) L.bottom = g.bottom
    if (g.size > L.size * (1 + BODY)) {
      // (a larger body than the glyphs before: the band is its, the votes counted again over the line's glyphs of that size)
      L.size = g.size
      L.votes = new Map()
      L.best = 0
      for (const j of L.gs) vote(L, at(j).g)
    } else {
      if (g.size > L.size) L.size = g.size
      vote(L, g)
    }
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
