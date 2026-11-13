// A table column's box on arXiv's page (Room.column; the owner's decision, docs/PDF-READER.md §18.13): the left
// and right edge of what TeX set in one column of one tabular, every entry's. Its unit cells are the members the source walk
// placed in that grid column (InstrumentUnit.cell: its table, row, first column and span), their glyphs the ownership's; an
// entry no unit is (a number, a formula alone, a cell of fewer than two letters) has no mark, no owner and no grid place, and
// only where it stands ties it to a column. TeX sets every entry of a column in the template its class built (LaTeX's \@chnum,
// the marked compile's AXT-CELL): an l column's from the column's left edge, an r column's to its right edge, a c column's on its
// middle, the template's \hfil taking the rest; and the column is as wide as its widest entry. So a column is TeX's where its
// entries line up so, and its box is then the hull of its entries:
// - its unit cells (span 1) each by its own class (a \multicolumn{1}{c} in an l column is centred in it), the cells of one class
//   ALIGNED of one another; a word of free ink on the table's band joins the column where it meets that column's unit cells'
//   hull and no other's, and its class sets it there (its start on the hull's left, its end on its right, its middle on its
//   middle), the column's unit cells all of one class; at least two entries. A word that meets the hull and stands otherwise (a
//   word of a number with a space in it beside the column's edge, siunitx's S column's numbers set on their decimal marker, a
//   word over two columns, a word in a column of two classes) is an entry not read whole: the column has none;
// - a column that holds a cell whose text TeX set as a paragraph of its own (a p, m, b or X column, a \parbox: its box is that
//   paragraph's \hsize, which no glyph shows) or whose template is not LaTeX's (no class) has none;
// - a cell spanning columns (\multicolumn) is no entry of a single column's box; its box is the union of those it spans where
//   each has one, its class setting it there. One wider than that union widened its last column (TeX gives the excess to the
//   last column it spans): that column's entries no longer tell its width, and neither it nor the spanning cell has a box;
// - a table set over several pages (a longtable's) takes its columns from all of them where every column with a box on two of
//   them stands at its class's edge or middle on each, else each page's from its own.
// What is not read: a column of no unit cell, an entry of free ink spanning columns of which one has no unit cell (a dash over
// two), free ink not on the table's band. Each leaves a box narrower than TeX's, never wider; TeX's own statement of the box (the
// template's edges as points) is the TeX gate's.

/** a column's class: TeX's \hfil on the side or sides the slack goes */
export type ColumnClass = 'l' | 'c' | 'r'

/** a unit cell as its column's box reads it */
export interface ColumnCell {
  /** its member's ord */
  ord: number
  page: number
  /** its first column and the columns it spans in its table's grid */
  col: number
  span: number
  /** the class its column's template set its text by in the template's own box (InstrumentUnit.cell.boxed); none where its text
   *  is a paragraph of its own or no template of LaTeX's set it */
  cls: ColumnClass | undefined
  /** what TeX set of it on its page: its lines' advances and its elements' ink on their baselines */
  x0: number
  x1: number
}
/** a word of ink no member owns on its table's band, on its page */
export interface FreeWord {
  page: number
  x0: number
  x1: number
}

/**
 * How far two entries' edges (or middles) may stand apart and still be one column's, PDF units: what a part's hundredth, a
 * glyph's advance against its TFM width and a formula's italic correction TeX counts in an entry's box and no advance shows leave
 * of TeX's equal positions (the lane cell-room's reading of 767 columns of the corpus with two single-line unit cells: 723 within
 * it, the rest 0.5 to 43.7 pt apart, cells of another column the source walk placed there: lanes/cell-col.md for the spread)
 */
const ALIGNED = 0.5

type Box = [number, number]
type Entry = [x0: number, x1: number, cls: ColumnClass]

const anchorOf = (cls: ColumnClass, [x0, x1]: readonly [number, number, ...unknown[]]) =>
  cls === 'l' ? x0 : cls === 'r' ? x1 : (x0 + x1) / 2
/** whether an extent stands where its class sets it in a box */
const setIn = (cls: ColumnClass, e: readonly [number, number, ...unknown[]], box: Box) =>
  Math.abs(anchorOf(cls, e) - anchorOf(cls, box)) <= ALIGNED
const hullOf = (es: readonly (readonly [number, number, ...unknown[]])[]): Box => [
  Math.min(...es.map((e) => e[0])),
  Math.max(...es.map((e) => e[1])),
]
/** a column's box from its entries: their hull, where there are two at least and each stands where its class sets it there */
function boxOf(es: readonly Entry[]): Box | null {
  if (es.length < 2) return null
  const box = hullOf(es)
  return es.every((e) => setIn(e[2], e, box)) ? box : null
}
const push = <K, V>(m: Map<K, V[]>, k: K, v: V) => {
  const l = m.get(k)
  if (l) l.push(v)
  else m.set(k, [v])
}

/**
 * Each cell's column box, by its member's ord, of the cells of one table (every page of it) and the free words on its band
 * (those of each page it stands on): absent for a cell whose column's box is not established
 */
export function columnBoxes(cells: readonly ColumnCell[], words: readonly FreeWord[]): Map<number, Box> {
  const pages = [...new Set(cells.map((c) => c.page))].sort((a, b) => a - b)
  // (each page's columns, by first column: their entries, null where a cell of it has no class)
  const entries = new Map<number, Map<number, Entry[] | null>>()
  // (a column's class where its unit cells hold one, by page)
  const classOf = new Map<number, Map<number, ColumnClass | null>>()
  for (const p of pages) {
    const cols = new Map<number, ColumnCell[]>()
    for (const c of cells) if (c.page === p && c.span === 1) push(cols, c.col, c)
    const hulls = [...cols].map(([k, cs]) => [k, hullOf(cs.map((c) => [c.x0, c.x1] as const))] as const)
    const on = new Map<number, Entry[] | null>()
    const cls = new Map<number, ColumnClass | null>()
    for (const [k, cs] of cols) {
      if (cs.some((c) => !c.cls)) {
        on.set(k, null)
        continue
      }
      const es: Entry[] = cs.map((c) => [c.x0, c.x1, c.cls as ColumnClass])
      const one = new Set(cs.map((c) => c.cls)).size === 1 ? (cs[0]!.cls as ColumnClass) : null
      cls.set(k, one)
      // (each word of free ink meeting its cells: an entry where it meets them alone and its class sets it there; else an entry
      // not read whole, and the column none)
      const h = hulls.find(([q]) => q === k)![1]
      let whole = true
      for (const w of words) {
        if (w.page !== p) continue
        const meets = hulls.filter(([, g]) => Math.min(w.x1, g[1]) - Math.max(w.x0, g[0]) > 0)
        if (!meets.some(([q]) => q === k)) continue
        if (one && meets.length === 1 && setIn(one, [w.x0, w.x1], h)) es.push([w.x0, w.x1, one])
        else whole = false
      }
      on.set(k, whole ? es : null)
    }
    entries.set(p, on)
    classOf.set(p, cls)
  }
  // (each page's boxes; then the pages tied where every column with a box on two of them stands at its class's edge or middle on
  // each (both its edges, a column of two classes), at least one such column: their entries pooled)
  const boxesOn = (on: Map<number, Entry[] | null>) => {
    const out = new Map<number, Box>()
    for (const [k, es] of on) {
      const b = es ? boxOf(es) : null
      if (b) out.set(k, b)
    }
    return out
  }
  const perPage = new Map(pages.map((p) => [p, boxesOn(entries.get(p)!)] as const))
  let tied = pages.length > 1
  if (tied) {
    let common = 0
    const cols = new Set(pages.flatMap((p) => [...perPage.get(p)!.keys()]))
    for (const k of cols) {
      const on = pages.filter((p) => perPage.get(p)!.has(k))
      if (on.length < 2) continue
      common++
      const ks = new Set(on.map((p) => classOf.get(p)!.get(k) ?? null))
      const K = ks.size === 1 ? [...ks][0]! : null
      const first = perPage.get(on[0]!)!.get(k)!
      for (const p of on.slice(1)) {
        const b = perPage.get(p)!.get(k)!
        const agree = K
          ? setIn(K, b, first)
          : Math.abs(b[0] - first[0]) <= ALIGNED && Math.abs(b[1] - first[1]) <= ALIGNED
        if (!agree) tied = false
      }
    }
    if (!common) tied = false
  }
  // (the groups of pages that share their boxes: all, tied; else each its own)
  const groups: number[][] = tied ? [pages] : pages.map((p) => [p])
  const out = new Map<number, Box>()
  for (const group of groups) {
    let boxes: Map<number, Box>
    if (group.length > 1) {
      const pooled = new Map<number, Entry[] | null>()
      for (const p of group)
        for (const [k, es] of entries.get(p)!) {
          const q = pooled.get(k)
          pooled.set(k, es === null || q === null ? null : [...(q ?? []), ...es])
        }
      boxes = boxesOn(pooled)
    } else boxes = new Map(perPage.get(group[0]!)!)
    // (a spanning cell: the union of the columns it spans, each with a box, its class setting it there; one wider than the union
    // widened its last column, which then has none, and the spanning cells are read again)
    const spans = cells.filter((c) => c.span > 1 && group.includes(c.page))
    const spanned = new Map<number, Box>()
    for (let again = true; again; ) {
      again = false
      spanned.clear()
      for (const s of spans) {
        const last = s.col + s.span - 1
        let all = true
        for (let q = s.col; q <= last; q++) if (!boxes.has(q)) all = false
        if (!all) continue
        const u: Box = [boxes.get(s.col)![0], boxes.get(last)![1]]
        if (s.x1 > u[1] + ALIGNED) {
          boxes.delete(last)
          again = true
          break
        }
        if (s.cls && s.x0 >= u[0] - ALIGNED && setIn(s.cls, [s.x0, s.x1], u)) spanned.set(s.ord, u)
      }
    }
    for (const c of cells) {
      if (!group.includes(c.page)) continue
      const b = c.span === 1 ? boxes.get(c.col) : spanned.get(c.ord)
      if (b) out.set(c.ord, b)
    }
  }
  return out
}
