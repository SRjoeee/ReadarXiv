// A display's rows (its El.ink, one box a row; its KEPT lines). TeX ships a display row by row, each row one box, and keeps two
// rows' boxes \lineskip apart at least (TeX's rule for consecutive boxes in a vertical list), so a row's ink is one band across
// the page that the next row's ink does not reach. What a row stacks (a fraction's numerator and denominator, a sum's limits,
// a matrix inside its delimiters, a subscript set deep) lies inside its box and is shipped among its own glyphs. So a display's
// rows are its glyphs and rules on a page joined where their ink overlaps top to bottom, and two such bands joined where
// their glyphs' places in the content stream interleave (a row's parts are shipped between its glyphs; two rows never are).
// No threshold: the text line rule (lines.ts) cuts a stacked part off as a line of its own, which no TeX row is.
import type { DocGlyph } from '../doc.ts'
import { type CutLine, isInk } from './lines.ts'

/** a rule or image of the display's own on a page: its box */
export interface RowBox {
  page: number
  x0: number
  y0: number
  x1: number
  y1: number
}

/** the rows of a display from its glyphs `list` (each an index `at` resolves to its page and glyph, stream order; those that are
 *  ink, isInk) and its own boxes: each row its glyphs (as given, in stream order), their advances' extent, their baseline, their ink's top
 *  and bottom (its boxes' too), in the stream order of their first glyph; a row of boxes alone is none (its boxes stay the
 *  element's ink) */
export function rowsOf(
  list: readonly number[],
  at: (i: number) => { page: number; g: DocGlyph },
  boxes: readonly RowBox[] = [],
): CutLine[] {
  type Item = { lo: number; hi: number; i: number | null }
  const byPage = new Map<number, Item[]>()
  const push = (p: number, it: Item) => {
    const l = byPage.get(p)
    if (l) l.push(it)
    else byPage.set(p, [it])
  }
  for (const i of list) {
    const { page, g } = at(i)
    // (its ink, whatever its Unicode: a big delimiter PDF.js reads as a blank is the row's, isInk)
    if (!isInk(g)) continue
    push(page, { lo: Math.min(g.bottom, g.top), hi: Math.max(g.bottom, g.top), i })
  }
  for (const b of boxes) push(b.page, { lo: Math.min(b.y0, b.y1), hi: Math.max(b.y0, b.y1), i: null })
  const rows: { page: number; gs: number[]; lo: number; hi: number }[] = []
  for (const [page, items] of byPage) {
    // (bands: the items in order of their bottoms, each joining the band before where it reaches into it)
    items.sort((a, b) => a.lo - b.lo || a.hi - b.hi)
    const bands: { gs: number[]; lo: number; hi: number }[] = []
    for (const it of items) {
      const last = bands.at(-1)
      if (last && it.lo < last.hi) {
        last.hi = Math.max(last.hi, it.hi)
        if (it.i !== null) last.gs.push(it.i)
      } else bands.push({ gs: it.i === null ? [] : [it.i], lo: it.lo, hi: it.hi })
    }
    // (rows: bands whose glyphs' stream places interleave joined, in the order of their first glyph)
    const glyphed = bands
      .filter((b) => b.gs.length)
      .map((b) => ({ ...b, first: Math.min(...b.gs), last: Math.max(...b.gs) }))
      .sort((a, b) => a.first - b.first)
    let cur: (typeof glyphed)[number] | null = null
    for (const b of glyphed) {
      if (cur && b.first < cur.last) {
        cur.gs.push(...b.gs)
        cur.last = Math.max(cur.last, b.last)
        cur.lo = Math.min(cur.lo, b.lo)
        cur.hi = Math.max(cur.hi, b.hi)
      } else {
        if (cur) rows.push({ page, gs: cur.gs, lo: cur.lo, hi: cur.hi })
        cur = b
      }
    }
    if (cur) rows.push({ page, gs: cur.gs, lo: cur.lo, hi: cur.hi })
  }
  return rows
    .map((r) => {
      const gs = [...r.gs].sort((a, b) => a - b)
      const votes = new Map<number, number>()
      const sizes = new Map<number, number>()
      let x0 = Number.POSITIVE_INFINITY
      let x1 = Number.NEGATIVE_INFINITY
      let size = 0
      for (const i of gs) {
        const { g } = at(i)
        const y = Math.round(g.y * 100) / 100
        votes.set(y, (votes.get(y) ?? 0) + 1)
        const s = Math.round(g.size * 100) / 100
        sizes.set(s, (sizes.get(s) ?? 0) + 1)
        if (g.x0 < x0) x0 = g.x0
        if (g.x1 > x1) x1 = g.x1
        if (g.size > size) size = g.size
      }
      // (its baseline the one most of its glyphs stand on; between as many, the one its first glyph in the stream stands on:
      // TeX ships a row from its start, a stacked part inside it)
      const firstOn = new Map<number, number>()
      gs.forEach((i, q) => {
        const y = Math.round(at(i).g.y * 100) / 100
        if (!firstOn.has(y)) firstOn.set(y, q)
      })
      const base = [...votes].sort(
        (a, b) => b[1] - a[1] || (firstOn.get(a[0]) as number) - (firstOn.get(b[0]) as number),
      )[0]![0]
      const most = [...sizes].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0]![0]
      return { page: r.page, gs, x0, x1, base, top: r.hi, bottom: r.lo, size, most }
    })
    .sort((a, b) => (a.gs[0] as number) - (b.gs[0] as number))
}
