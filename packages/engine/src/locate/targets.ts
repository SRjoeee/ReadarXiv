// Where each destination of A's links lands (link previews, docs/PDF-READER.md §20.2): the destination's point on its page (A's,
// resolved by dests.ts) matched to the thing that stands at it or first under it in its column, and that thing's kind is the
// link's (the design's L4: a link's kind is the unit its destination lands on, never the destination's name). A reference
// entry, a heading, a note, a display and a boxed float are covered; anything else at the point (a theorem, an item, a cell, a
// float with no box) lands nowhere, and the destination is absent: its links keep their jump alone. Phase 18 of locate, the
// last, read-only: it reads the members' lines, elements and labels, the page frames and the floats' boxes (floats.ts).
import type { TargetKind } from '@readarxiv/format'
import type { DestPoint } from './dests.ts'
import type { Box4, FloatBox } from './floats.ts'
import type { Member, Work } from './work.ts'

export interface Landing {
  dest: string
  kind: TargetKind
  page: number
  /** the member's ord (a float's: its caption's) */
  ord: number
  box: Box4
  next?: [page: number, box: Box4]
}

/** how far under a destination's point the top of what it lands on may stand, PDF units, and how far over it (hyperref raises an
 *  anchor by \baselineskip over the line it marks). Starting values, measured over the corpus (docs/PDF-READER.md §20.3) */
export const LAND_BELOW = 24
export const LAND_ABOVE = 2
/** a heading's window: from its top down this share of its page's height, across its column's measure (the approved
 *  prototype's three section targets, whose two segments sum to 0.183-0.192 of the page) */
export const SECTION_WINDOW = 0.19

/** a thing a point may land on, on one page: a member's line, a display element's ink, a boxed float */
type Item =
  | { what: 'line'; mem: Member; line: number; top: number; bottom: number; x0: number; x1: number }
  | { what: 'display'; mem: Member; box: Box4; top: number; bottom: number; x0: number; x1: number }
  | { what: 'float'; float: FloatBox; top: number; bottom: number; x0: number; x1: number }
/** the order a point inside several things lands on them: a float holds its texts, a display stands in its paragraph's lines */
const RANK = { float: 0, display: 1, line: 2 } as const

const grow = (u: Box4 | null, r: Box4): Box4 =>
  u ? [Math.min(u[0], r[0]), Math.min(u[1], r[1]), Math.max(u[2], r[2]), Math.max(u[3], r[3])] : [...r]
/** a box on the format's grid, outward: what it holds stays inside it as stated */
const gridOut = (b: Box4): Box4 => [
  Math.floor(b[0] * 100) / 100,
  Math.floor(b[1] * 100) / 100,
  Math.ceil(b[2] * 100) / 100,
  Math.ceil(b[3] * 100) / 100,
]

/** each destination matched to the thing of a covered kind it lands on, sorted by destination; a destination that lands on
 *  nothing covered is absent */
export function targetsOf(
  w: Work,
  dests: ReadonlyMap<string, DestPoint | null>,
  floats: readonly FloatBox[],
): Landing[] {
  const { members, units } = w
  // (the boxed floats, and the float each of their members stands in)
  const boxed = floats.filter((f) => f.box && f.caption !== null)
  const floatOf = new Map<number, FloatBox>()
  for (const f of floats) for (const o of [...f.members, ...f.captions]) floatOf.set(o, f)
  const itemsByPage = new Map<number, Item[]>()
  const itemsOf = (page: number): Item[] => {
    const had = itemsByPage.get(page)
    if (had) return had
    const items: Item[] = []
    for (const mem of members) {
      if (!mem.located) continue
      mem.lines.forEach((l, i) => {
        if (l[0] === page)
          items.push({
            what: 'line',
            mem,
            line: i,
            top: l[5],
            bottom: l[6],
            x0: Math.min(l[2], l[7]),
            x1: Math.max(l[3], l[8]),
          })
      })
      for (const [, el] of mem.elements) {
        if (el.kind !== 'display') continue
        let box: Box4 | null = null
        for (const k of el.ink) if (k[0] === page) box = grow(box, [k[1], k[2], k[3], k[4]])
        if (!box) continue
        // (across, its paragraph's measure on the page: a display is centred in it, its anchor at the measure's left)
        const ls = mem.lines.filter((l) => l[0] === page)
        const x0 = Math.min(box[0], ...ls.map((l) => l[7]))
        const x1 = Math.max(box[2], ...ls.map((l) => l[8]))
        items.push({ what: 'display', mem, box, top: box[3], bottom: box[1], x0, x1 })
      }
    }
    for (const f of boxed)
      if (f.page === page)
        items.push({ what: 'float', float: f, top: f.box![3], bottom: f.box![1], x0: f.box![0], x1: f.box![2] })
    itemsByPage.set(page, items)
    return items
  }

  const out: Landing[] = []
  for (const [dest, pt] of [...dests].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))) {
    if (!pt || pt.y === null) continue
    const item = itemAt(pt.page, pt.x, pt.y)
    const landing = item ? landingOf(dest, pt.page, item) : null
    if (landing) out.push(landing)
  }
  return out

  /** the column a point's x stands in on a page: TeX's column frame that holds it (the nearest where it stands in none: a
   *  label hung in the margin); none where the page states no frame or the point no x */
  function columnOf(page: number, x: number | null): [number, number] | null {
    const frame = w.ix.framesA.get(page)
    if (x === null || !frame?.columns.length) return null
    const dist = (c: [number, number]) => (x < c[0] ? c[0] - x : x > c[1] ? x - c[1] : 0)
    return [...frame.columns].sort((a, b) => dist(a) - dist(b))[0]!
  }

  /** the thing a point lands on: in its column, one that holds the point's height (a float before a display before a line),
   *  else the first whose top stands under it within LAND_BELOW (or over it within LAND_ABOVE) */
  function itemAt(page: number, x: number | null, y: number): Item | null {
    const col = columnOf(page, x)
    const inColumn = (it: Item) =>
      col ? it.x0 < col[1] && it.x1 > col[0] : x === null || it.what === 'float' || (it.x0 <= x && x <= it.x1)
    let best: Item | null = null
    let bestHolds = false
    for (const it of itemsOf(page)) {
      if (!inColumn(it)) continue
      const holds = it.bottom <= y && y <= it.top
      const near = it.top <= y + LAND_ABOVE && it.top >= y - LAND_BELOW
      if (!holds && !near) continue
      if (!best) {
        best = it
        bestHolds = holds
        continue
      }
      if (holds !== bestHolds) {
        if (holds) {
          best = it
          bestHolds = true
        }
        continue
      }
      const better = holds
        ? RANK[it.what] < RANK[best.what] ||
          (RANK[it.what] === RANK[best.what] && it.top - it.bottom < best.top - best.bottom)
        : it.top > best.top || (it.top === best.top && RANK[it.what] < RANK[best.what])
      if (better) best = it
    }
    return best
  }

  function landingOf(dest: string, page: number, it: Item): Landing | null {
    if (it.what === 'float') return { dest, kind: 'float', page, ord: it.float.caption!, box: it.float.box! }
    const mem = it.mem
    // (a member inside a float: the float, where it is boxed; nothing where it is not)
    const f = floatOf.get(mem.ord)
    if (f) return f.box && f.caption !== null ? { dest, kind: 'float', page: f.page, ord: f.caption, box: f.box } : null
    if (it.what === 'display') return { dest, kind: 'display', page, ord: mem.ord, box: gridOut(it.box) }
    if (mem.name !== undefined || mem.unit < 0) return null
    const unit = units[mem.unit]!
    const line = mem.lines[it.line]!
    if (mem.kind === 'heading') return headingOf(dest, page, mem, line)
    const kind: TargetKind | null =
      mem.kind === 'reference' && unit.entry ? 'reference' : mem.kind === 'footnote' ? 'footnote' : null
    if (!kind) return null
    // (its lines on the page in the line's column, and its label there)
    let box: Box4 | null = null
    for (const l of mem.lines) if (l[0] === page && l[1] === line[1]) box = grow(box, [l[2], l[6], l[3], l[5]])
    const lab = mem.labelAt?.ink
    if (lab && lab[0] === page) box = grow(box, [lab[1], lab[2], lab[3], lab[4]])
    return { dest, kind, page, ord: mem.ord, box: gridOut(box!) }
  }

  /** a heading's window: from its top on the page, across its column's measure, down SECTION_WINDOW of the page's height; where
   *  that passes TeX's text block bottom (the frame's foot), it stops there and runs on, the rest of its height, from the top of
   *  the next column's text (the frame's next column on the page, else the next page's first) */
  function headingOf(dest: string, page: number, mem: Member, line: Member['lines'][number]): Landing {
    const ls = mem.lines.filter((l) => l[0] === page && l[1] === line[1])
    const top = Math.max(...ls.map((l) => l[5]))
    const m0 = Math.min(...ls.map((l) => l[7]))
    const m1 = Math.max(...ls.map((l) => l[8]))
    const view = w.ix.inkA.pages[page - 1]!.view
    const height = SECTION_WINDOW * (view[3] - view[1])
    const frame = w.ix.framesA.get(page)
    const foot = frame?.foot ?? view[1]
    const bottom = top - height
    if (bottom >= foot || !frame)
      return { dest, kind: 'heading', page, ord: mem.ord, box: gridOut([m0, Math.max(bottom, foot), m1, top]) }
    const rest = foot - bottom
    const box = gridOut([m0, foot, m1, top])
    // (the next column: the frame's column right of the heading's on its page, else the next page's first)
    const cols = [...frame.columns].sort((a, b) => a[0] - b[0])
    const here = cols.findIndex((c) => c[0] <= (m0 + m1) / 2 && (m0 + m1) / 2 <= c[1])
    const [np, col] =
      here >= 0 && here < cols.length - 1
        ? [page, cols[here + 1]!]
        : [page + 1, [...(w.ix.framesA.get(page + 1)?.columns ?? [])].sort((a, b) => a[0] - b[0])[0]]
    if (!col || np > w.ix.inkA.pages.length) return { dest, kind: 'heading', page, ord: mem.ord, box }
    // (that column's first line of text: the highest of the members' lines there)
    let first: Member['lines'][number] | null = null
    for (const m of members)
      for (const l of m.lines)
        if (l[0] === np && l[7] < col[1] && l[8] > col[0] && (!first || l[5] > first[5])) first = l
    if (!first) return { dest, kind: 'heading', page, ord: mem.ord, box }
    return {
      dest,
      kind: 'heading',
      page,
      ord: mem.ord,
      box,
      next: [np, gridOut([first[7], first[5] - rest, first[8], first[5]])],
    }
  }
}
