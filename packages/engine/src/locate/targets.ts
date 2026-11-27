// Where each destination of A's links lands (link previews, docs/PDF-READER.md §20.2): the destination's point on its page (A's,
// resolved by dests.ts) matched to the thing that stands at it or first under it in its column, and that thing's kind is the
// link's (the design's L4: a link's kind is the unit its destination lands on, never the destination's name). A reference
// entry, a heading, a note, a display and a boxed float are covered; anything else at the point (a theorem, an item, a cell, a
// float with no box) lands nowhere, and the destination is absent: its links keep their jump alone. Phase 18 of locate, the
// last, read-only: it reads the members' lines, elements and labels, the page frames and the floats' boxes (floats.ts). A
// reference is a member of a bibliography's entry: a source unit that is one (`\bibitem`'s, Unit.entry) or a unit made on A of
// one biblatex entry (ink-units.ts rule 1, kind `inkreferences`: one entry a unit, cut at the compile's point before it).
import type { TargetKind } from '@readarxiv/format'
import type { DestPoint } from './dests.ts'
import { grow } from './floats.ts'
import { bracketsOf } from './gaps.ts'
import type { Box4, FloatBox, Landing, Member, Work } from './work.ts'

export type { Landing }

/** how far under a destination's point the baseline of what it lands on may stand, PDF units: hyperref raises an anchor by the
 *  \baselineskip in force over the first baseline of what it marks (over the corpus's 245 papers: references 8 to 14 under the
 *  point, displays 11 to 17, notes 9 to 19, headings 10 to 39, docs/PDF-READER.md §20.3). A starting value, measured there */
export const LAND_BELOW = 24
/** a heading's window: from its top down this share of its page's height, across its column's measure (the approved
 *  prototype's three section targets, whose two segments sum to 0.183-0.192 of the page) */
export const SECTION_WINDOW = 0.19

/** why a landing is not stated (targetsOf's `refused`, the lab's measure) */
export type Refusal = 'page' | 'edge' | 'name' | 'unproven'

/** the kind a destination's name claims, by the scheme of the package that makes the destination (hyperref's `cite.<key>` a
 *  reference, `Hfootnote.<n>` a note, `page.<n>` a page; `<counter>.<value>` for a counter LaTeX's kernel defines, its
 *  sectioning a heading, `figure` and `table` a float, `equation` a display): read from a name of that simple shape alone, a
 *  name read as a format, never as words. A compound name (`equation.3-footnote.1`), a counter a package or the paper defines
 *  (a theorem's, a list item's `Item.<n>`) and an explicit destination claim nothing */
const CLAIMS: Readonly<Record<string, TargetKind | 'page'>> = {
  cite: 'reference',
  Hfootnote: 'footnote',
  page: 'page',
  part: 'heading',
  chapter: 'heading',
  section: 'heading',
  subsection: 'heading',
  subsubsection: 'heading',
  paragraph: 'heading',
  subparagraph: 'heading',
  appendix: 'heading',
  figure: 'float',
  table: 'float',
  equation: 'display',
}
/** a name of the simple shape: `cite.` and its key (whatever the key holds), or a counter's name and its hyperref value (\\theH<counter>:
 *  digits, letters and dots, `figure.caption.3` hypcap's), nothing after it */
const SIMPLE_NAME = /^(?:(cite)\.(.+)|([A-Za-z]+)\.([A-Za-z0-9.]+))$/
function claimOf(dest: string): TargetKind | 'page' | null {
  let name: unknown
  try {
    name = JSON.parse(dest)
  } catch {
    return null
  }
  const m = typeof name === 'string' ? SIMPLE_NAME.exec(name) : null
  const scheme = m?.[1] ?? m?.[3]
  return scheme && Object.hasOwn(CLAIMS, scheme) ? CLAIMS[scheme]! : null
}

/** a thing a point may land on, on one page, at its beginning (hyperref sets an anchor where what it marks begins): a member's
 *  first line and its label, a display element's first ink, a boxed float's top; its baseline, its band, its ink across (`ix0`,
 *  `ix1`) and what it spans across for its column (`x0`, `x1`: a line's measure). A line that goes on with its member (its
 *  second, a paragraph's lines after a display) begins nothing, and is no such thing */
type Item = {
  /** it begins what it is of: a member's first line or its label, a display's first ink, a float */
  begins: boolean
  base: number
  top: number
  bottom: number
  ix0: number
  ix1: number
  x0: number
  x1: number
} & (
  | { what: 'line'; mem: Member; line: number }
  | { what: 'display'; mem: Member; box: Box4 }
  | { what: 'float'; float: FloatBox }
)
/** the order a point under several things at one height lands on them: a float holds its texts, a display stands in its
 *  paragraph's lines */
const RANK = { float: 0, display: 1, line: 2 } as const
/** a height on the format's grid (the parts' numbers are stated on it: a point and a baseline TeX set at one height compare
 *  equal there) */
const onGrid = (v: number) => Math.round(v * 100) / 100
/** one step of the format's grid, PDF units: two positions it states one step apart may be one TeX set (each rounded to it) */
const GRID = 0.01

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
  refused: [dest: string, kind: TargetKind, cause: Refusal][] = [],
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
        if (l[0] !== page) return
        const x0 = Math.min(l[2], l[7])
        const x1 = Math.max(l[3], l[8])
        items.push({
          what: 'line',
          mem,
          line: i,
          begins: i === 0,
          base: l[4],
          top: l[5],
          bottom: l[6],
          ix0: l[2],
          ix1: l[3],
          x0,
          x1,
        })
      })
      // (its label, on its first line: a reference's number, a heading's, where hyperref's anchor stands before)
      const lab = mem.labelAt?.ink
      if (lab && lab[0] === page && mem.lines[0]?.[0] === page) {
        const at = 0
        const l = mem.lines[0]!
        items.push({
          what: 'line',
          mem,
          line: at,
          begins: true,
          base: lab[5],
          top: lab[4],
          bottom: lab[2],
          ix0: lab[1],
          ix1: lab[3],
          x0: Math.min(lab[1], l[7]),
          x1: Math.max(lab[3], l[8]),
        })
      }
      for (const [, el] of mem.elements) {
        if (el.kind !== 'display') continue
        let box: Box4 | null = null
        for (const k of el.ink) if (k[0] === page) box = grow(box, [k[1], k[2], k[3], k[4]])
        if (!box) continue
        // (across, its paragraph's measure on the page for its column: a display is centred in it)
        // (its own column's: the lines whose measure holds its ink across, not those of a column the paragraph goes on in)
        const ls = mem.lines.filter((l) => l[0] === page && l[7] <= box![0] && box![2] <= l[8])
        const x0 = Math.min(box[0], ...ls.map((l) => l[7]))
        const x1 = Math.max(box[2], ...ls.map((l) => l[8]))
        const k = el.ink[0]!
        if (k[0] === page)
          items.push({
            what: 'display',
            mem,
            box,
            begins: true,
            base: k[5],
            top: k[4],
            bottom: k[2],
            ix0: k[1],
            ix1: k[3],
            x0,
            x1,
          })
      }
    }
    for (const f of boxed)
      if (f.page === page) {
        const [x0, y0, x1, y1] = f.box!
        items.push({ what: 'float', float: f, begins: true, base: y1, top: y1, bottom: y0, ix0: x0, ix1: x1, x0, x1 })
      }
    itemsByPage.set(page, items)
    return items
  }

  // (whether a member's line stands in a column's body as TeX's page builder broke it, read by its first glyph's partner on B
  // inside a `bs<n>`..`be<n>` bracket (gaps.ts bracketsOf): a running head or foot stands outside every body)
  let bodies: Uint8Array[] | null = null
  const inBody = (m: Member, i: number): boolean => {
    const a = m.lineGlyphs?.[i]?.[0]
    const b = a === undefined ? -1 : (w.ix.m.aToB[a] ?? -1)
    if (b < 0) return false
    bodies ??= bracketsOf(w.ix.B, new Set(w.ix.ins.tex.whole ?? [])).inBody
    const p = (w.ix.pageB[b] as number) - 1
    return bodies[p]?.[b - (w.ix.m.offB[p] as number)] === 1
  }

  const out: Landing[] = []
  for (const [dest, pt] of [...dests].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))) {
    if (!pt || pt.y === null) continue
    const item = itemAt(pt.page, pt.x, pt.y)
    const landing = item ? landingOf(dest, pt.page, item) : null
    if (!landing) continue
    const cause = contradicted(landing, pt)
    if (cause) refused.push([dest, landing.kind, cause])
    else out.push(landing)
  }
  return out

  /** why the engine's own evidence does not let a landing be stated, null where it does: the destination's name is a page's
   *  (hyperref's `page.<n>`: a page, no thing on it); the left edge at its point names another member (`edge`); its name, of a
   *  class that claims a kind, claims another (`name`); its name claims nothing and the edge does not confirm it (`unproven`) */
  function contradicted(l: Landing, pt: DestPoint): Refusal | null {
    const claim = claimOf(l.dest)
    if (claim === 'page') return 'page'
    const edge = pt.x === null ? null : edgeOf(pt.page, pt.x, pt.y!)
    if (edge !== null && edge !== l.ord) return 'edge'
    if (claim) return claim === l.kind ? null : 'name'
    return edge === l.ord ? null : 'unproven'
  }

  /** the edge reading: the member (a float's: its caption) whose line, label or display ink begins at the point's x on the
   *  format's grid (pdfTeX states a destination at the origin of what TeX set next, a beginning or not): one whose baseline is
   *  the point's own on the grid (an anchor TeX set there, not raised), else the one whose baseline is the first under the
   *  point within LAND_BELOW (raised over it); null where no ink begins there */
  function edgeOf(page: number, x: number, y: number): number | null {
    let best: { base: number; mem: Member } | null = null
    const gx = onGrid(x)
    const gy = onGrid(y)
    const take = (mem: Member, ix0: number, base: number) => {
      if (Math.abs(onGrid(ix0) - gx) > GRID || onGrid(base) > gy || y - base > LAND_BELOW) return
      if (!best || base > best.base) best = { base, mem }
    }
    for (const mem of members) {
      if (!mem.located) continue
      for (const l of mem.lines) if (l[0] === page) take(mem, l[2], l[4])
      const lab = mem.labelAt?.ink
      if (lab && lab[0] === page) take(mem, lab[1], lab[5])
      for (const [, el] of mem.elements)
        if (el.kind === 'display') for (const k of el.ink) if (k[0] === page) take(mem, k[1], k[5])
    }
    if (!best) return null
    const mem = (best as { mem: Member }).mem
    const f = floatOf.get(mem.ord)
    return f ? f.caption : mem.ord
  }

  /** the column a point's x stands in on a page: TeX's column frame that holds it; in the gutter between two, the right one;
   *  the nearest where it stands outside them all (a label hung in the margin); none where the page states no frame or the
   *  point no x */
  function columnOf(page: number, x: number | null): [number, number] | null {
    const frame = w.ix.framesA.get(page)
    if (x === null || !frame?.columns.length) return null
    const cols = [...frame.columns].sort((a, b) => a[0] - b[0])
    const at = cols.find((c) => c[0] <= x && x <= c[1])
    if (at) return at
    // (in the gutter between two columns: the one on its right. TeX sets an anchor at or left of where its text begins, a label
    // wider than its box carrying it out left of its column, and no text of the left column begins in the gutter)
    const right = cols.find((c) => x < c[0])
    if (right && cols.some((c) => c[1] < x)) return right
    const dist = (c: [number, number]) => (x < c[0] ? c[0] - x : x - c[1])
    return cols.sort((a, b) => dist(a) - dist(b))[0]!
  }

  /** the thing a point lands on, null for none. A boxed float that holds it. A beginning it stands on:
   *  one whose band holds its height and whose ink its x, its baseline at or over it (an anchor TeX set on that line, not raised
   *  over it). The line, label or display under it within LAND_BELOW whose ink begins at its x on the format's grid (pdfTeX
   *  states a destination at the origin of what TeX set next): the first such; nothing where that begins nothing (an item, a
   *  head inside a paragraph's unit). Else the first beginning under it in its column: the highest baseline under its height,
   *  within LAND_BELOW (hyperref raises an anchor over what it marks, past the last line of what stands above, which a line
   *  going on with its member is: it begins nothing, and is passed) */
  function itemAt(page: number, x: number | null, y: number): Item | null {
    const items = itemsOf(page)
    // (on the format's grid, where the parts state the ink: a point TeX set at an ink's edge is on it)
    const gx = x === null ? null : onGrid(x)
    const gy = onGrid(y)
    const holdsY = (it: Item) => onGrid(it.bottom) <= gy && gy <= onGrid(it.top)
    const holdsX = (it: Item) => gx !== null && onGrid(it.ix0) <= gx && gx <= onGrid(it.ix1)
    const floats = items.filter((it) => it.what === 'float' && holdsY(it) && (x === null || holdsX(it)))
    if (floats.length) return floats.sort((a, b) => a.top - a.bottom - (b.top - b.bottom))[0]!
    const on = items.filter((it) => it.begins && holdsY(it) && holdsX(it) && onGrid(it.base) >= gy)
    if (on.length) return on.sort((a, b) => RANK[a.what] - RANK[b.what] || a.top - a.bottom - (b.top - b.bottom))[0]!
    const under = (it: Item) => onGrid(it.base) < gy && y - it.base <= LAND_BELOW
    const higher = (it: Item, best: Item | null) =>
      !best ||
      it.base > best.base ||
      (it.base === best.base &&
        (Number(it.begins) > Number(best.begins) || (it.begins === best.begins && RANK[it.what] < RANK[best.what])))
    if (x !== null) {
      let edge: Item | null = null
      for (const it of items)
        if (it.what !== 'float' && under(it) && Math.abs(onGrid(it.ix0) - onGrid(x)) <= GRID && higher(it, edge))
          edge = it
      if (edge) return edge.begins ? edge : null
    }
    const col = columnOf(page, x)
    const inColumn = (it: Item) =>
      col ? it.x0 < col[1] && it.x1 > col[0] : x === null || it.what === 'float' || (it.x0 <= x && x <= it.x1)
    let best: Item | null = null
    for (const it of items) if (it.begins && inColumn(it) && under(it) && higher(it, best)) best = it
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
      (mem.kind === 'reference' && unit.entry) || mem.kind === 'inkreferences'
        ? 'reference'
        : mem.kind === 'footnote'
          ? 'footnote'
          : null
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
   *  the next column's text (the frame's next column on the page, else the next page's first): its first line in a column's body
   *  as TeX broke it, never a running head over it */
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
      m.lines.forEach((l, i) => {
        if (l[0] === np && l[7] < col[1] && l[8] > col[0] && inBody(m, i) && (!first || l[5] > first[5])) first = l
      })
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
