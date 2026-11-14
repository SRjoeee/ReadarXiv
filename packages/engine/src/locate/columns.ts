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
//   middle), the column's unit cells all of one class; at least two entries. A word wholly inside that hull (within ALIGNED of
//   it) meeting no other column's is part of an entry whose own ends the page does not state (a name set with a script, the
//   words of a number with its ± or unit): it neither moves the box nor speaks against the column, since entries that line up
//   by their class line up whatever their parts, where the rest of that entry is inside the hull too: no free word on its
//   baseline stands in the blank between the hull and the nearest hulls beside it (else the rest is set past the hull, or a
//   column no unit cell is stands there, and the entry's ends are unstated: the column has none; the coordinator's rulings (d)
//   and (d') of 2026-11-14: "5.3% / 0.27" under a narrower header, its "5.3%" in the blank). A word that meets the hull, passes
//   its edge and stands otherwise (a number with a space in it beside the column's edge, siunitx's S column's numbers set on
//   their decimal marker, a word over two columns) is an entry not read whole: the column has none;
// - a column that holds a cell whose text TeX set as a paragraph of its own (a p, m, b or X column, a \parbox: its box is that
//   paragraph's \hsize, which no glyph shows) or whose template is not LaTeX's (no class) has none;
// - a cell spanning columns (\multicolumn) is no entry of a single column's box; its box is the union of those it spans where
//   each has one, its class setting it there. One wider than that union widened its last column (TeX gives the excess to the
//   last column it spans): that column's entries no longer tell its width, and neither it nor the spanning cell has a box;
// - a table set over several pages (a longtable's) takes its columns from all of them where every column with a box on two of
//   them stands at its class's edge or middle on each, else each page's from its own.
// What is not read: a column of no unit cell, an entry of free ink spanning columns of which one has no unit cell (a dash over
// two), free ink not on the table's band, and the ink of a member that is no cell of the table (it never extends a hull nor
// speaks against a column). Each leaves a box narrower than TeX's, never wider; TeX's own statement of the box (the template's
// edges as points) is the TeX gate's.
// A cell's room in its column (Room.column, the owner's approval of 2026-11-14) is its column's box widened by the column's share
// of the blank TeX leaves beside it, never past the cell's own side: roomsOf below.

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
  /** what bounds it on its own lines (its Room.side: TeX's measure, the nearest ink not its own on its baseline, a painted box
   *  beside its line), which its room never passes; none where the facts pass states none */
  side?: readonly [number, number]
}
/** what stands on a table's band on one page besides its cells and its words of free ink, as the facts pass reads the page */
export interface BandInk {
  page: number
  /** each glyph of ink on the band whose member is no cell of the table (a paragraph's, a caption's, an ink unit's) */
  ink: readonly (readonly [number, number])[]
  /** the painted boxes on the band no member owns that are no horizontal rule: a vertical rule, a cell's fill */
  walls: readonly (readonly [number, number])[]
  /** where the horizontal rules on the band across the table's cells end: the table's own edges; none where no rule shows them */
  edge?: readonly [number, number]
}
/** a word of ink no member owns on its table's band, on its page */
export interface FreeWord {
  page: number
  x0: number
  x1: number
  /** its baseline, to the hundredth, as the facts pass cuts its words (one baseline each) */
  y?: number
}

/**
 * How far two entries' edges (or middles) may stand apart and still be one column's: 0.5, in PDF units (points). Its source: TeX
 * sets every entry of an l, c or r column on the column's one edge or middle exactly (the template's \hfil), and the part states
 * positions on its hundredth; what stands between is what TeX counts in an entry's box and no glyph's advance shows (a formula's
 * italic correction, an advance against its TFM width) and an element's ink past its advance, which an entry's extent takes in.
 * Measured over the columns of two unit cells or more of one class on the round's 90 bundles (lane cell-col): 572 of 608 equal to
 * the hundredth, 12 apart by 0.1 to 0.5 (an element's ink against an advance, a centred cell of several lines), 2 by 0.5 to 0.75,
 * 22 by over 2 (cells the source walk placed in another column than TeX's). Its reason: docs/PDF-READER.md §18.13, a column
 * whose entries do not line up is no column of TeX's
 */
const ALIGNED = 0.5
/**
 * The fewest entries a column's box is read from: 2, a count of entries. Its source: what lining up is: one entry stands on its
 * column's edge with nothing to show that the edge is TeX's, and its box would be its own extent, which no reading holds to TeX's
 * column (docs/PDF-READER.md §18.13: a column of one entry states none)
 */
const ENTRIES = 2
/**
 * The fewest pages a table's columns are compared over before its pages are pooled: 2, a count of pages. Its source: TeX sets a
 * longtable's columns at one width on every page it runs over (longtable.sty, its widths kept in the .aux), so where the pages'
 * frames stand alike a column stands at its class's edge or middle alike on each; one page has nothing to compare
 * (docs/PDF-READER.md §18.13)
 */
const PAGES = 2

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
  if (es.length < ENTRIES) return null
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
 * (those of each page it stands on): absent for a cell whose column's box is not established. With what else stands on the
 * band of each page (`bands`), each cell's room in its column instead (roomsOf): the box widened by the column's share of the
 * blank beside it, never past the cell's own side
 */
export function columnBoxes(
  cells: readonly ColumnCell[],
  words: readonly FreeWord[],
  bands?: readonly BandInk[],
): Map<number, Box> {
  const pages = [...new Set(cells.map((c) => c.page))].sort((a, b) => a - b)
  // (each page's columns, by first column: their entries, null where a cell of it has no class)
  const entries = new Map<number, Map<number, Entry[] | null>>()
  // (a column's class where its unit cells hold one, by page)
  const classOf = new Map<number, Map<number, ColumnClass | null>>()
  for (const p of pages) {
    const cols = new Map<number, ColumnCell[]>()
    for (const c of cells) if (c.page === p && c.span === 1) push(cols, c.col, c)
    const hulls = [...cols].map(([k, cs]) => [k, hullOf(cs.map((c) => [c.x0, c.x1] as const))] as const)
    // (the page's free words by their baseline: the rest of an entry set in several words stands on its word's)
    const onLine = new Map<number | undefined, FreeWord[]>()
    for (const w of words) if (w.page === p) (onLine.get(w.y) ?? onLine.set(w.y, []).get(w.y)!).push(w)
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
      // (the nearest hulls beside it, of the page's other columns with unit cells; none, the band's measure, which bounds the
      // words read)
      let left = Number.NEGATIVE_INFINITY
      let right = Number.POSITIVE_INFINITY
      for (const [q, g] of hulls) {
        if (q === k) continue
        if (g[1] <= h[0]) left = Math.max(left, g[1])
        if (g[0] >= h[1]) right = Math.min(right, g[0])
      }
      let whole = true
      for (const w of words) {
        if (w.page !== p) continue
        const meets = hulls.filter(([, g]) => Math.min(w.x1, g[1]) - Math.max(w.x0, g[0]) > 0)
        if (!meets.some(([q]) => q === k)) continue
        if (one && meets.length === 1 && setIn(one, [w.x0, w.x1], h)) es.push([w.x0, w.x1, one])
        // (one wholly inside the hull, within ALIGNED, meeting no other column's: part of an entry set in several words, neither an
        // entry nor a word against the column, where the rest of that entry is inside the hull too: no free word on its baseline
        // stands in the blank between the hull and the nearest hulls beside it (the band's measure where none). One there is the
        // rest of the entry set past the hull, or a column no unit cell is: the entry's ends unstated, the column has none)
        else if (meets.length === 1 && w.x0 >= h[0] - ALIGNED && w.x1 <= h[1] + ALIGNED) {
          if ((onLine.get(w.y) ?? []).some((v) => (v.x0 >= left && v.x1 <= h[0]) || (v.x0 >= h[1] && v.x1 <= right)))
            whole = false
        } else whole = false
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
      if (on.length < PAGES) continue
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
  return bands ? roomsOf(cells, words, out, bands) : out
}

/**
 * Each cell's room in its column (Room.column; the owner's approval of 2026-11-14, docs/PDF-READER.md §18.13): its column's box
 * widened, on each side its own class lets its text grow, by the column's share of the blank on that side. The share is half the
 * blank between the box's edge and what stands next to the column on the table's band on that side: TeX makes the blank between
 * two columns of each one's own \tabcolsep, so half of it is this column's, and the other half stays between the cell and what
 * stands there. What stands next is the nearest of another column's box, the unit cells of a column with no box, a word of free
 * ink, a glyph of a member that is no cell of the table, and a painted edge (a vertical rule, a neighbour's fill); where nothing
 * stands, the table's own edge, where its horizontal rules end; where the page shows none, no share. A cell spanning columns
 * stands next to none (its ink crosses them); a painted box across the whole box is its ground; what stands past the table's
 * edge is not the table's; one that meets the box's edge leaves no blank. An l cell grows right, an r cell left, a c cell both
 * ways by the smaller share (its middle the box's); a spanning cell's union by its first column's left share and its last one's
 * right. The widening never passes the cell's own side (ColumnCell.side: what bounds it on its own line, TeX's measure or a
 * rule's end beside it), a c cell's cut alike on both sides; where its side stops short of the box, the box stands on that side
 */
/** in a list sorted by its entries' `key`th field, the index of the first past `v` (at or past it with `at`) */
function firstAfter(list: readonly (readonly number[])[], key: number, v: number, at = false): number {
  let a = 0
  let b = list.length
  while (a < b) {
    const mid = (a + b) >> 1
    const x = list[mid]![key]!
    if (x < v || (!at && x === v)) a = mid + 1
    else b = mid
  }
  return a
}
function roomsOf(
  cells: readonly ColumnCell[],
  words: readonly FreeWord[],
  boxes: ReadonlyMap<number, Box>,
  bands: readonly BandInk[],
): Map<number, Box> {
  // (everything read at the part's hundredth, as the part states a line and the room: a row's fill TeX painted from a column's
  // edge is that column's ground, whatever its last digits; 2610.40394v1 p3's \rowcolor at 62.3621 beside a box at 62.36)
  const h = (v: number) => Math.round(v * 100) / 100
  const at = (b: Box): Box => [h(b[0]), h(b[1])]
  // (each page's columns' blanks, by first column: [left, right], 0 where no share)
  const blanks = new Map<number, Map<number, [number, number]>>()
  for (const p of new Set(cells.map((c) => c.page))) {
    const single = cells.filter((c) => c.page === p && c.span === 1)
    const colBox = new Map<number, Box>()
    for (const c of single) {
      const b = boxes.get(c.ord)
      if (b) colBox.set(c.col, at(b))
    }
    // (what may stand next on the page's band, each [x0, x1, the column it is an entry of or -1], once sorted by its start and
    // once by its end: each column's sides are found in them by a search, never by reading the band again)
    const things: (readonly [number, number, number])[] = []
    for (const k of new Set(single.map((c) => c.col))) {
      const b = colBox.get(k)
      if (b) things.push([b[0], b[1], k])
      else for (const c of single) if (c.col === k) things.push([h(c.x0), h(c.x1), k])
    }
    for (const w of words) if (w.page === p) things.push([h(w.x0), h(w.x1), -1])
    const band = bands.find((b) => b.page === p)
    for (const [x0, x1] of band?.ink ?? []) things.push([h(x0), h(x1), -1])
    for (const [x0, x1] of band?.walls ?? []) things.push([h(x0), h(x1), -1])
    const byStart = [...things].sort((a, b) => a[0] - b[0])
    const byEnd = [...things].sort((a, b) => a[1] - b[1])
    const edge = band?.edge && at(band.edge as Box)
    const on = new Map<number, [number, number]>()
    for (const [k, [b0, b1]] of colBox) {
      // (to the right, what starts past the box's start in order: inside the box, none; across its right edge, no blank; else
      // the first past its edge is the nearest, unless it stands past the table's edge. What crosses the whole box, a ground
      // under it or ink across it, starts at or before it and is never read)
      let right = Number.POSITIVE_INFINITY
      for (let i = firstAfter(byStart, 0, b0); i < byStart.length; i++) {
        const [x0, x1, j] = byStart[i]!
        if (j === k || x1 <= b1) continue
        if (x0 < b1) right = 0
        else if (!(edge && edge[1] >= b1 && x0 >= edge[1])) right = x0 - b1
        break
      }
      // (to the left, the same over what ends before the box's end, from the nearest)
      let left = Number.POSITIVE_INFINITY
      for (let i = firstAfter(byEnd, 1, b1, true) - 1; i >= 0; i--) {
        const [x0, x1, j] = byEnd[i]!
        if (j === k || x0 >= b0) continue
        if (x1 > b0) left = 0
        else if (!(edge && edge[0] <= b0 && x1 <= edge[0])) left = b0 - x1
        break
      }
      if (left === Number.POSITIVE_INFINITY) left = edge && edge[0] <= b0 ? b0 - edge[0] : 0
      if (right === Number.POSITIVE_INFINITY) right = edge && edge[1] >= b1 ? edge[1] - b1 : 0
      on.set(k, [left, right])
    }
    blanks.set(p, on)
  }
  const out = new Map<number, Box>()
  for (const c of cells) {
    const b = boxes.get(c.ord) && at(boxes.get(c.ord)!)
    const on = blanks.get(c.page)
    const first = on?.get(c.col)
    const last = on?.get(c.col + c.span - 1)
    if (!b || !first || !last || !c.cls) continue
    // (each side's share where its class grows that way, cut at its own side; none where the side stops short of the box)
    const [s0, s1] = c.side ?? [Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY]
    let L = c.cls === 'l' || s0 > b[0] ? 0 : Math.min(first[0] / 2, b[0] - s0)
    let R = c.cls === 'r' || s1 < b[1] ? 0 : Math.min(last[1] / 2, s1 - b[1])
    if (c.cls === 'c') L = R = Math.min(L, R)
    out.set(c.ord, [b[0] - L, b[1] + R])
  }
  return out
}
