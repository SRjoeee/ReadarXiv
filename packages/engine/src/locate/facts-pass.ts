// The facts of every located member read on A after its lines (stage 1a-2; facts.ts holds each reading): its elements' kept
// state, fill, the original's mark after a display or on a held line, a forced break's line and room, a paragraph TeX opened
// at an element; its label's parts; the class's tail; its lines' PINNED and SHORTSKIP flags; the room beside its lines and a
// cell's band; its alignment where TeX did not state it. Each fact read rather than stated by TeX is named in `read`.
import { type El, LINE_FLAG, type Line, type Piece } from '@readarxiv/format'
import type { Mapping } from '../align/align.ts'
import type { Doc, DocGlyph } from '../doc.ts'
import { isImage, isPath } from '../doc.ts'
import { type Instrument, type InstrumentUnit, ROLE } from '../instrument.ts'
import {
  alignOf,
  bandOf,
  bracketsOf,
  breakEnd,
  CENTRE,
  cellCentred,
  centredByBlock,
  END,
  FORCED_BREAK,
  fillOfGlyphs,
  INSET,
  type InkBox,
  labelParts,
  pinnedOf,
  rightToLeft,
  shortSkipLines,
  sideOf,
  sourceEndMarks,
  staysOf,
  styleOf,
  TRAIL,
  tailOf,
} from './facts.ts'
import { type ColumnCell, columnBoxes, type FreeWord } from './columns.ts'
import { isInk, r2 } from './lines.ts'
import { WORD_GAP } from './trails.ts'
import { spellOf } from './today/today.types.ts'

/** a line that ends short of its column's right edge by this share of its size ends at a forced break (today's SHORT TEX:87),
 *  read only where the marked compile set no point for the break */
const SHORT = 0.5
/** the element classes that set ink of their own (today's VISIBLE, tex.mjs:18): a piece of another class sets none */
const VISIBLE = new Set(['cite', 'num', 'other', 'macro', 'umacro', 'display', 'symbol'])
/** the characters of a text an opening point is found by (today's stream.mjs WANT) */
const WANT = 8
/** the ink units of the page's head and foot (made on A, today's ink-units.mjs INK_KIND heads and notes): their lines TeX sets
 *  as boxes of the text's width (\@oddhead, \@oddfoot), and states no alignment of */
const HEAD_FOOT = new Set(['inkheads', 'inknotes'])

/** a unit's pieces in the source's order, a group as its open and its close */
type Flat = { t: 'text'; s: string } | { t: 'el' | 'unit'; id: string } | { t: 'open' | 'close'; id: string }
function flatOf(content: readonly Piece[], out: Flat[] = []): Flat[] {
  for (const p of content) {
    if (p.t === 'text') out.push({ t: 'text', s: p.s })
    else if (p.t === 'el') out.push({ t: 'el', id: p.id })
    else if (p.t === 'unit') out.push({ t: 'unit', id: p.id })
    else {
      out.push({ t: 'open', id: p.id })
      flatOf(p.content, out)
      out.push({ t: 'close', id: p.id })
    }
  }
  return out
}
import type { Owned } from './ownership.ts'
import type { Member } from './work.ts'

export interface FactsInput {
  ins: Instrument
  inkA: Doc
  m: Mapping
  members: Member[]
  /** the member that owns each glyph of A (ownership.ts) */
  owned: Pick<Owned, 'member'>
  pageA: Int32Array
  unitB: Int32Array
  roleB: Uint8Array
  pieceB: Int32Array
  /** the units the members are of: the instrument's, then those locate made on A (its ink units, kept blocks and figure texts) */
  units?: readonly InstrumentUnit[]
  /** the A pages whose lines' measures are TeX's frame (work.ts framesOnA): a measure there is the block's or its column's
   *  even where a line fills it */
  framed?: ReadonlySet<number>
}

const mostOf = <T>(xs: Iterable<T>): T | undefined => {
  const n = new Map<T, number>()
  let best: T | undefined
  let k = 0
  for (const x of xs) {
    const c = (n.get(x) ?? 0) + 1
    n.set(x, c)
    if (c > k) {
      k = c
      best = x
    }
  }
  return best
}

function elsOf(content: readonly Piece[], out = new Map<string, Extract<Piece, { t: 'el' }>>()) {
  for (const p of content) {
    if (p.t === 'el') out.set(p.id, p)
    else if (p.t === 'span') elsOf(p.content, out)
  }
  return out
}

/** the facts pass's index: its input (its defaults taken) and the pages' readings every member's readers share, built once by
 *  `open` */
interface FactsIndex {
  ins: Instrument
  inkA: Doc
  m: Mapping
  members: Member[]
  owned: Pick<Owned, 'member'>
  pageA: Int32Array
  unitB: Int32Array
  roleB: Uint8Array
  pieceB: Int32Array
  units: readonly InstrumentUnit[]
  framed: ReadonlySet<number>
  gA: (a: number) => DocGlyph
  /** a page's glyphs that are ink whose baseline is within [lo, hi], each with its global index */
  bandOn: (p: number, lo: number, hi: number) => { x0: number; x1: number; y: number; a: number }[]
  /** a page's painted boxes, the page-sized backgrounds aside */
  boxes: (p: number) => (InkBox & { j: number; rule: boolean })[]
  /** a page's ink no member owns */
  staysOn: (p: number) => InkBox[]
  /** each page's lines, every member's */
  linesOn: Map<number, Line[]>
  /** a line's block: TeX's frame where it shipped the page's, else the measure of the page's or column's lines */
  blockOf: (l: Line) => [number, number]
  /** B's paragraph ends, global, each glyph position once */
  ends: number[]
  /** each element's opening and end point on B, by unit and piece */
  placeAt: Map<string, number>
  placeEnd: Map<string, number>
  /** a table column's cells */
  column: Map<string, Member[]>
  /** the boxes a member owns, by page and index */
  ownedBox: Set<string>
}

/** what every reader of one member reads: the member, its unit, the line each of its glyphs was cut into, a line's size, and its
 *  own lines (a held one aside) with their indexes */
interface MemberReading {
  mem: Member
  unit: InstrumentUnit | undefined
  lineOf: Map<number, number>
  sizeOf: (j: number) => number
  own: (readonly [Line, number])[]
}

/** the facts pass's index of the pages (FactsIndex) */
function open({
  ins,
  inkA,
  m,
  members,
  owned,
  pageA,
  unitB,
  roleB,
  pieceB,
  units = ins.units,
  framed = new Set<number>(),
}: FactsInput): FactsIndex {
  const gA = (a: number): DocGlyph => {
    const p = (pageA[a] as number) - 1
    return inkA.pages[p]!.glyphs[a - (m.offA[p] as number)]!
  }
  // (a page's glyphs that are ink (isInk) by baseline, each with its global index; those whose baseline is within [lo, hi])
  const inkByPage = new Map<number, { x0: number; x1: number; y: number; a: number }[]>()
  const bandOn = (p: number, lo: number, hi: number) => {
    let l = inkByPage.get(p)
    if (!l) {
      const o = m.offA[p - 1] as number
      l = inkA.pages[p - 1]!.glyphs.flatMap((g, k) => (isInk(g) ? [{ x0: g.x0, x1: g.x1, y: g.y, a: o + k }] : []))
      l.sort((x, y) => x.y - y.y)
      inkByPage.set(p, l)
    }
    let a = 0
    let b = l.length
    while (a < b) {
      const mid = (a + b) >> 1
      if ((l[mid] as { y: number }).y < lo) a = mid + 1
      else b = mid
    }
    const out: typeof l = []
    for (let i = a; i < l.length && (l[i] as { y: number }).y <= hi; i++) out.push(l[i]!)
    return out
  }
  // (a page's painted boxes: rules and images, the page-sized backgrounds aside)
  const boxesOn = (p: number) => {
    const pg = inkA.pages[p - 1]!
    const W = pg.view[2] - pg.view[0]
    const H = pg.view[3] - pg.view[1]
    const out: (InkBox & { j: number; rule: boolean })[] = []
    for (let b = 0; b < pg.kinds.length; b++) {
      const k = pg.kinds[b] as number
      if (!(isPath(k) || isImage(k))) continue
      const [x0, y0, x1, y1] = [pg.boxes[4 * b]!, pg.boxes[4 * b + 1]!, pg.boxes[4 * b + 2]!, pg.boxes[4 * b + 3]!]
      if (x1 - x0 >= 0.9 * W && y1 - y0 >= 0.75 * H) continue
      out.push({ x0, y0, x1, y1, j: b, rule: isPath(k) && y1 - y0 <= 2 && x1 - x0 > 2 })
    }
    return out
  }
  const boxCache = new Map<number, ReturnType<typeof boxesOn>>()
  const boxes = (p: number) => boxCache.get(p) ?? boxCache.set(p, boxesOn(p)).get(p)!
  // (a page's ink no member owns: a glyph no unit claims (free, or held as A's ink of a unit that stays), shown; a painted box
  // no member's text or element holds: what stays whatever a translation lays, Room.stays)
  const staysCache = new Map<number, InkBox[]>()
  const staysOn = (p: number): InkBox[] => {
    const got = staysCache.get(p)
    if (got) return got
    const o = m.offA[p - 1] as number
    const out: InkBox[] = []
    inkA.pages[p - 1]!.glyphs.forEach((g, j) => {
      if (isInk(g) && !g.unseen && owned.member(o + j) < 0)
        out.push({ x0: g.x0, x1: g.x1, y0: g.bottom, y1: g.top, y: g.y })
    })
    for (const b of boxes(p)) if (!ownedBox.has(`${p}|${b.j}`)) out.push(b)
    staysCache.set(p, out)
    return out
  }
  // (each page's lines, every member's: a single line's stack, centredByBlock)
  const linesOn = new Map<number, Line[]>()
  for (const mem of members) for (const l of mem.lines) (linesOn.get(l[0]) ?? linesOn.set(l[0], []).get(l[0])!).push(l)
  // (each page's and column's block: TeX's frame where it shipped the page's (framed); else its justified lines' measure where
  // it has one, else all its lines' hull)
  const hull = new Map<string, [number, number]>()
  for (const mem of members)
    for (const l of mem.lines) {
      if (l[9] & 1) continue
      for (const k of [`${l[0]}|${l[1]}`, `${l[0]}|*`]) {
        const h = hull.get(k)
        hull.set(k, h ? [Math.min(h[0], l[2]), Math.max(h[1], l[3])] : [l[2], l[3]])
      }
    }
  const blockOf = (l: Line): [number, number] => {
    if (framed.has(l[0]) || l[7] < l[2] - 0.01 || l[8] > l[3] + 0.01) return [l[7], l[8]]
    return hull.get(l[1] === 2 ? `${l[0]}|*` : `${l[0]}|${l[1]}`) ?? [l[2], l[3]]
  }
  // (B's paragraph ends, globally, each glyph position once: two paragraphs TeX ended with nothing set between them, a box's last
  // and the one around it, end at one position, one end there)
  const ends = [
    ...new Set((ins.tex.paragraphEnds ?? []).flatMap((l, p) => l.map((g) => (m.offB[p] as number) + g))),
  ].sort((x, y) => x - y)
  // (each element's opening point on B, by unit and piece: the glyph before which it begins, global; and its end point, the
  // glyph before which what follows it begins)
  const placeAt = new Map<string, number>()
  const placeEnd = new Map<string, number>()
  for (const pl of ins.places ?? [])
    (pl.end ? placeEnd : placeAt).set(`${pl.unit}|${pl.piece}`, (m.offB[pl.page - 1] as number) + pl.glyph)
  // (a table column's cells, for a single-line cell's centring)
  const column = new Map<string, Member[]>()
  for (const mem of members) {
    const c = mem.unit >= 0 ? units[mem.unit]?.cell : undefined
    if (!c || !mem.located) continue
    // (today's column of a cell: the cells of its table, column and span, RUN:1508 columnKey)
    const k = `${c.table}|${c.col}|${c.span ?? 1}`
    ;(column.get(k) ?? column.set(k, []).get(k)!).push(mem)
  }
  // (the boxes a member owns, its text's and its elements': a unit's ink, never a table's rule)
  const ownedBox = new Set<string>()
  for (const mem of members) {
    for (const [p, j] of mem.textBoxes) ownedBox.add(`${p}|${j}`)
    for (const l of mem.elBoxes.values()) for (const [p, j] of l) ownedBox.add(`${p}|${j}`)
  }
  return {
    ins,
    inkA,
    m,
    members,
    owned,
    pageA,
    unitB,
    roleB,
    pieceB,
    units,
    framed,
    gA,
    bandOn,
    boxes,
    staysOn,
    linesOn,
    blockOf,
    ends,
    placeAt,
    placeEnd,
    column,
    ownedBox,
  }
}

export function factsOf(input: FactsInput): void {
  const fx = open(input)
  for (const mem of fx.members) {
    if (!mem.located || !mem.lines.length) continue
    memberFacts(fx, mem)
  }
  readColumns(fx)
}

/**
 * Each table cell's room in its column (Room.column; the owner's decision, docs/PDF-READER.md §18.13), once every member's facts
 * are read (its band and its side): locate/columns.ts over each table's located cells, each its first column and span, its
 * class (InstrumentUnit.cell.boxed), what TeX set of it on its page (its lines' advances and its elements' ink on their
 * baselines, as the typesetter's own room of a cell reads it) and its Room.side, and what stands on the table's band on each
 * page (the cells' bands, Room.band, else their lines' bodies, within their lines' measure), read in one pass over its ink: the
 * words of ink no member owns (one baseline each, as TeX sets one box's glyphs, cut where a glyph a member owns stands or a
 * word's gap, WORD_GAP, the ink units' word rule, opens), the glyphs of members that are no cell of the table, the painted boxes
 * no member owns that are no horizontal rule (a vertical rule, a fill), and where the horizontal rules across its cells end
 */
function readColumns(fx: FactsIndex): void {
  const { members, units, owned, gA, bandOn } = fx
  const tables = new Map<number, Member[]>()
  // (every member of each table, located or not: a glyph of none of them is ink that stands beside the table's columns)
  const ofTable = new Map<number, Set<number>>()
  for (const mem of members) {
    const c = mem.unit >= 0 ? units[mem.unit]?.cell : undefined
    if (!c) continue
    ;(ofTable.get(c.table) ?? ofTable.set(c.table, new Set()).get(c.table)!).add(mem.ord)
    if (!mem.located || !mem.lines.length) continue
    const l = tables.get(c.table)
    if (l) l.push(mem)
    else tables.set(c.table, [mem])
  }
  for (const [table, mems] of tables) {
    const mine = ofTable.get(table)!
    const cells: ColumnCell[] = []
    // (the table's band and measure on each page: [lo, hi, m0, m1])
    const band = new Map<number, [number, number, number, number]>()
    for (const mem of mems) {
      const c = units[mem.unit]!.cell!
      const page = mem.lines[0]![0]
      let x0 = Number.POSITIVE_INFINITY,
        x1 = Number.NEGATIVE_INFINITY
      for (const l of mem.lines) {
        if (l[0] !== page) continue
        x0 = Math.min(x0, l[2])
        x1 = Math.max(x1, l[3])
        const size = l[10] ?? mem.style.size
        for (const [, e] of mem.elements)
          for (const k of e.ink)
            if (k[0] === l[0] && Math.abs(k[5] - l[4]) < 0.4 * size && k[1] < l[3] && k[3] > l[2]) {
              x0 = Math.min(x0, k[1])
              x1 = Math.max(x1, k[3])
            }
        const b = band.get(page) ?? [Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, l[7], l[8]]
        band.set(page, [
          Math.min(b[0], mem.room.band?.[0] ?? l[6]),
          Math.max(b[1], mem.room.band?.[1] ?? l[5]),
          Math.min(b[2], l[7]),
          Math.max(b[3], l[8]),
        ])
      }
      cells.push({ ord: mem.ord, page, col: c.col, span: c.span ?? 1, cls: c.boxed, x0, x1, side: mem.room.side })
    }
    const words: FreeWord[] = []
    const bands: { page: number; ink: [number, number][]; walls: [number, number][]; edge?: [number, number] }[] = []
    for (const [page, [lo, hi, m0, m1]] of band) {
      // (the page's ink on the band, by baseline to the hundredth and then across; a word of free ink at a time, and each glyph
      // of a member that is no cell of the table)
      const ink = bandOn(page, lo, hi)
        .filter((g) => g.x1 > m0 && g.x0 < m1 && !gA(g.a).unseen)
        .sort((a, b) => r2(a.y) - r2(b.y) || a.x0 - b.x0)
      const foreign: [number, number][] = []
      let cur: (FreeWord & { y: number; size: number }) | null = null
      for (const g of ink) {
        const size = gA(g.a).size
        const who = owned.member(g.a)
        const free = who < 0
        if (!free && !mine.has(who)) foreign.push([g.x0, g.x1])
        if (
          cur &&
          free &&
          r2(g.y) === cur.y &&
          g.x0 - cur.x1 <= WORD_GAP * Math.max(size, cur.size) &&
          g.x0 >= cur.x0
        ) {
          cur.x1 = Math.max(cur.x1, g.x1)
          cur.size = size
          continue
        }
        if (cur) words.push({ page, x0: cur.x0, x1: cur.x1, y: cur.y })
        cur = free ? { page, x0: g.x0, x1: g.x1, y: r2(g.y), size } : null
      }
      if (cur) words.push({ page, x0: cur.x0, x1: cur.x1, y: cur.y })
      // (the page's painted boxes on the band no member owns: a horizontal rule across the table's cells tells the table's edge,
      // any other a painted edge beside a column, a vertical rule or a cell's fill)
      let h0 = Number.POSITIVE_INFINITY,
        h1 = Number.NEGATIVE_INFINITY
      for (const c of cells)
        if (c.page === page) {
          h0 = Math.min(h0, c.x0)
          h1 = Math.max(h1, c.x1)
        }
      const walls: [number, number][] = []
      let e0 = Number.POSITIVE_INFINITY,
        e1 = Number.NEGATIVE_INFINITY
      for (const b of fx.boxes(page)) {
        if (fx.ownedBox.has(`${page}|${b.j}`) || r2(b.y1) < lo || r2(b.y0) > hi) continue
        if (!b.rule) walls.push([b.x0, b.x1])
        else if (Math.min(b.x1, h1) > Math.max(b.x0, h0)) {
          e0 = Math.min(e0, b.x0)
          e1 = Math.max(e1, b.x1)
        }
      }
      bands.push({ page, ink: foreign, walls, ...(e0 < e1 ? { edge: [e0, e1] as [number, number] } : {}) })
    }
    const rooms = columnBoxes(cells, words, bands)
    for (const mem of mems) {
      const b = rooms.get(mem.ord)
      if (b) mem.room.column = [r2(b[0]), r2(b[1])]
    }
  }
}

/** one member's facts: its readers in the order the pass reads them */
function memberFacts(fx: FactsIndex, mem: Member): void {
  const { units, framed, gA } = fx
  const unit = mem.unit >= 0 ? units[mem.unit] : undefined
  const lineOf = new Map<number, number>()
  mem.lineGlyphs.forEach((gs, j) => {
    for (const a of gs) lineOf.set(a, j)
  })
  const sizeOf = (j: number) => mostOf((mem.lineGlyphs[j] ?? []).map((a) => r2(gA(a).size))) ?? mem.style.size
  const own = mem.lines.map((l, j) => [l, j] as const).filter(([l]) => !(l[9] & 1))
  // (its measure read off A, where TeX did not ship its pages' frame: a hull of the page's lines)
  if (!mem.lines.every((l) => framed.has(l[0]))) mem.read.push('measure')
  const r: MemberReading = { mem, unit, lineOf, sizeOf, own }
  readElements(fx, r)
  readOpens(fx, r)
  readLabel(fx, r)
  readTail(fx, r)
  readLineFlags(fx, r)
  readRoom(fx, r)
  readDirection(fx, r)
  readAlign(fx, r)
  readLabelLine(fx, r)
}

/** its elements' facts: style, brackets, the mark after a display or on a held line, a forced break's line and room */
function readElements(fx: FactsIndex, r: MemberReading): void {
  const { ins, m, unitB, gA, pageA, placeAt, placeEnd, ends } = fx
  const { mem, unit, lineOf, sizeOf, own } = r
  // (the line TeX ended at a point of B's stream: that of the unit's last glyph before it, carried to A)
  const lineBefore = (point: number) => {
    let b = point - 1
    while (b >= 0 && b >= mem.bFirst && ((unitB[b] as number) !== mem.unit || (m.bToA[b] as number) < 0)) b--
    return b >= mem.bFirst && b >= 0 ? lineOf.get(m.bToA[b] as number) : undefined
  }
  // -- its elements
  const pieces = unit ? elsOf(unit.content) : new Map()
  const breaks: [El, number][] = []
  const unplaced: [string, El][] = []
  for (const [id, el] of mem.elements) {
    const gs = (mem.els.get(id) ?? []).map(gA)
    const fill = fillOfGlyphs(gs)
    // (its style where it is filled otherwise than black, or where the typesetter may draw it as text: its text stated; where
    // that text is in TeX's case for its faked small capitals (locate's mem.smallCaps, facts.ts elementCase), their share, and no
    // case change)
    if (fill !== undefined || el.text !== undefined) {
      const sc = mem.smallCaps?.get(id)
      const { upper, ...read } = styleOf(gs)
      el.style = {
        ...read,
        ...(sc !== undefined ? { sc } : upper ? { upper } : {}),
        ...(fill !== undefined ? { fill } : {}),
      }
    }
    // (its own brackets: its first and last glyphs where they are a pair of them, "[" "]" around a citation's numbers:
    // the stated half of T12, which a translation that brackets it takes)
    const pair = bracketsOf(gs)
    if (pair) {
      const [b0, b1] = pair
      const p0 = pageA[(mem.els.get(id) ?? [])[0] as number] as number
      const box = (x: DocGlyph) => [p0, r2(x.x0), r2(x.bottom), r2(x.x1), r2(x.top), r2(x.y)] as El['ink'][number]
      el.brackets = [box(b0), box(b1)]
    }
    if (el.kind === 'display') {
      // (the original's first mark after it: the member's own next glyph in the stream, a display's aside (D10))
      const last = Math.max(...(mem.els.get(id) ?? [-1]))
      if (last >= 0)
        for (const a of [...mem.text].sort((x, y) => x - y))
          if (a > last && /\S/.test(gA(a).u)) {
            el.after = gA(a).u
            break
          }
      continue
    }
    if (el.ink.length && !el.keep) {
      // (its ink on a held line (KEPT, D11): kept with it, and the line's own next mark after it; one outside the unit's
      // lines is kept by locate (B11 OUTSIDE). Its line the one its ink stands on, across and along: a line of the other
      // column at its height is none of its, 2610.20595v1 p9 ord 55's formulas beside a display row KEPT in the left column)
      const on = el.ink.map((k) =>
        mem.lines.findIndex(
          (l) =>
            l[0] === k[0] && Math.min(k[4], l[5]) > Math.max(k[2], l[6]) && Math.min(k[3], l[3]) > Math.max(k[1], l[2]),
        ),
      )
      {
        const j = on.find((x) => x >= 0) ?? -1
        if (j >= 0 && (mem.lines[j] as Line)[9] & 1) {
          el.keep = 1
          const x1 = Math.max(...el.ink.map((k) => k[3]))
          const next = (mem.lineGlyphs[j] ?? [])
            .map(gA)
            .filter((g) => g.x0 >= x1 - 0.01 && /\S/.test(g.u))
            .sort((a, b) => a.x0 - b.x0)[0]
          if (next) el.after = next.u
        }
      }
    }
    const p = pieces.get(id)
    if (p && FORCED_BREAK.test(p.src.trim())) {
      // (the line TeX ended at it: the last glyph of the unit's before its point on B, carried to A)
      const j = lineBefore(placeAt.get(`${mem.unit}|${id}`) ?? 0)
      if (j !== undefined) breaks.push([el, j])
      else unplaced.push([id, el])
    }
  }
  // (a break the marked compile set no point for: the marking gives an invisible piece none, which would move a line. Breaks
  // the source sets one after the other, nothing that sets ink between them, end one line: TeX ends it at the first, each next
  // one sets an empty line. TeX's points around such a group in the unit's source, the nearest before it (an element's end,
  // the unit's start) and after it (an element's opening, the unit's end), bound where it stands in B's stream:
  // - where nothing that sets ink stands between the group and one of them, that point is the group's (no glyph of B between
  //   them), and its line the one TeX ended there, as a placed break's: at the unit's end its last line, which has no line
  //   after it to state;
  // - else it lies in the window of B's stream between the two, with each group of the window. Every forced break ends a line
  //   and a group one of its own, so where the window's lines end there as often as it holds groups, TeX ended each at one of
  //   them, in order (a paragraph's end TeX states there among them: in a centred or ragged block LaTeX's `\\` is
  //   \@centercr, which ends a paragraph, 2610.30034v1's title, 2608.25210v2 t8); else, in a unit TeX states it set centred
  //   or ragged (InstrumentUnit.align), where its paragraph ends there are as many as its groups, each is one's point, past
  //   the lines TeX wrapped itself (2610.21504v1's title); else where as many of its line ends end short of their column's
  //   right edge by SHORT of a size (today's reading, forcedBreaks TEX:120: the break's \hfil), none over a held line, they
  //   are the groups', in order, the lines read; else no break of the window is stated. A window's count is its own:
  //   another's, or a break at the unit's end, leaves it as it is)
  if (unplaced.length && unit && mem.bFirst >= 0) {
    const seq = flatOf(unit.content)
    const classes = new Map(unit.classes ?? [])
    const unplacedEl = new Map(unplaced)
    const isBreak = (x: Flat) => x.t === 'el' && FORCED_BREAK.test(pieces.get(x.id)?.src.trim() ?? '')
    // (a piece that sets ink: a text's characters, a visible element, a nested unit; a forced break none)
    const sets = (x: Flat) =>
      x.t === 'text'
        ? /\S/.test(x.s)
        : x.t === 'unit' || (x.t === 'el' && !isBreak(x) && VISIBLE.has(classes.get(x.id)?.cls ?? 'other'))
    // (TeX's points at the boundaries of the unit's pieces, in the source's order: before piece q, the glyph of B's stream
    // TeX was at, where it states it)
    const at: (number | undefined)[] = new Array(seq.length + 1).fill(undefined)
    at[0] = mem.bFirst
    at[seq.length] = mem.bLast + 1
    seq.forEach((x, q) => {
      if (x.t !== 'el') return
      at[q] ??= placeAt.get(`${mem.unit}|${x.id}`)
      at[q + 1] ??= placeEnd.get(`${mem.unit}|${x.id}`)
    })
    const groups: { from: number; to: number; els: El[] }[] = []
    seq.forEach((x, q) => {
      const el = x.t === 'el' ? unplacedEl.get(x.id) : undefined
      if (!el) return
      const g = groups.at(-1)
      if (g && !seq.slice(g.to + 1, q).some(sets)) {
        g.to = q
        g.els.push(el)
      } else groups.push({ from: q, to: q, els: [el] })
    })
    const windows = new Map<string, { lo: number; hi: number; groups: El[][] }>()
    for (const g of groups) {
      let l = g.from
      let inkBefore = false
      while (at[l] === undefined) {
        if (sets(seq[l - 1]!)) inkBefore = true
        l--
      }
      let r = g.to + 1
      let inkAfter = false
      while (at[r] === undefined) {
        if (sets(seq[r]!)) inkAfter = true
        r++
      }
      const lo = at[l] as number
      const hi = at[r] as number
      if (!inkBefore || !inkAfter) {
        const j = lineBefore(!inkBefore ? lo : hi)
        if (j !== undefined && !((mem.lines[j] as Line)[9] & 1)) for (const el of g.els) breaks.push([el, j])
        continue
      }
      const w = windows.get(`${lo}|${hi}`) ?? windows.set(`${lo}|${hi}`, { lo, hi, groups: [] }).get(`${lo}|${hi}`)!
      w.groups.push(g.els)
    }
    const right = new Map<string, number>()
    for (const [l] of own) right.set(`${l[0]}|${l[1]}`, Math.max(right.get(`${l[0]}|${l[1]}`) ?? -1e9, l[3]))
    let read = false
    for (const w of windows.values()) {
      // (the lines its glyphs stand on, in B's order: each but the last ends inside it)
      const seen: number[] = []
      for (let b = w.lo; b < w.hi; b++) {
        if ((unitB[b] as number) !== mem.unit || (m.bToA[b] as number) < 0) continue
        const j = lineOf.get(m.bToA[b] as number)
        if (j !== undefined && j !== seen.at(-1)) seen.push(j)
      }
      if (seen.some((j, q) => q > 0 && j < (seen[q - 1] as number))) continue
      const lineEnds = seen.slice(0, -1)
      // (a line of its own text, the next one too: no held line's)
      const textual = (j: number) => !((mem.lines[j] as Line)[9] & 1) && !((mem.lines[j + 1] as Line)[9] & 1)
      // (the lines TeX's paragraph ends inside it close)
      const closed: number[] = []
      for (const e of ends) {
        if (e >= w.hi) break
        if (e > w.lo && (unitB[e - 1] as number) === mem.unit) {
          const j = lineBefore(e)
          if (j !== undefined && j !== closed.at(-1)) closed.push(j)
        }
      }
      let lines: number[] | null = null
      if (lineEnds.length === w.groups.length && lineEnds.every(textual)) lines = lineEnds
      else if (
        unit.align !== undefined &&
        unit.align !== 'j' &&
        closed.length === w.groups.length &&
        closed.every((j) => lineEnds.includes(j) && textual(j))
      )
        lines = closed
      else {
        const short = lineEnds.filter((j) => {
          const l = mem.lines[j] as Line
          return textual(j) && l[3] < (right.get(`${l[0]}|${l[1]}`) as number) - SHORT * sizeOf(j)
        })
        if (short.length === w.groups.length) {
          lines = short
          read = true
        }
      }
      if (lines)
        w.groups.forEach((els, q) => {
          for (const el of els) breaks.push([el, lines[q] as number])
        })
    }
    if (read) mem.read.push('breaks')
  }
  const breakLines = new Set(breaks.map(([, j]) => j))
  for (const [el, j] of breaks) {
    const e = breakEnd(mem.lines, j, breakLines, ins.tex.lineskip, mem.read.includes('lead') ? undefined : mem.lead)
    if (e) el.ends = e
  }
}

/** the paragraphs TeX opened inside it: where each one's point is stated, or why none is */
function readOpens(fx: FactsIndex, r: MemberReading): void {
  const { ins, m, unitB, roleB, pieceB, ends } = fx
  const { mem, unit, lineOf } = r
  // (a paragraph TeX opened inside the unit (C13, C15): a paragraph end of B's between its glyphs, its first line on A the line
  // of the unit's next glyph. The source side and B's side of the end are read by the same facts. What bounds a window is a
  // piece TeX set ink for in this compile: its glyphs on B, the unit's, an element's (an element's own, or a nested unit's mark,
  // which the instrument owns as its piece's: pipeline/instrument.mjs), whatever its class; a piece TeX set none for here
  // (`\medbreak`, `\noindent`, a footnote whose mark it set elsewhere) bounds nothing, as B's run holds no glyph of it. Each side
  // of the end is met by what stands there (sideB, sideOf: one rule, both directions): where the unit's glyph next to the end
  // is a piece's and no letter or digit stands between, by that piece itself (a footnote's mark ending the paragraph before, an
  // element opening the next); else by its text, spelled, WANT characters (today's stream.mjs WANT): the source's text before a
  // group's open ends B's before the end, and the text the group's content begins with (inside it, as today's paragraphBreaks
  // asks: the group closed after it) begins B's after it. TeX opened the paragraph at the group so met on both sides, one group
  // alone (SpanAt.opens: the outermost of those opened together), else at the element B's next glyph opens, where its side
  // before is met too (El.opens). An end inside a piece's own glyphs opened none at it; one at no group's open and no element,
  // none either: counted (`opensUnstated`), apart as an open or an element stands where the next paragraph begins in the source
  // (the class of 2111.09276v1 p5's run-in titles, which must be none) or plain text does (no anchor exists for it))
  if (mem.bFirst >= 0 && unit) {
    const seq = flatOf(unit.content)
    // (each piece's first and last glyph on B, the unit's, of an element's role)
    const firstOf = new Map<number, number>()
    const lastOf = new Map<number, number>()
    for (let b = mem.bFirst; b <= mem.bLast; b++) {
      if ((unitB[b] as number) !== mem.unit || roleB[b] !== ROLE.element || (pieceB[b] as number) < 0) continue
      if (!firstOf.has(pieceB[b] as number)) firstOf.set(pieceB[b] as number, b)
      lastOf.set(pieceB[b] as number, b)
    }
    // (a piece TeX set ink for in this compile; a text's characters are read by their spelling)
    const inked = (x: Flat) => (x.t === 'el' || x.t === 'unit') && firstOf.has(Number(x.id))
    const groupBefore = (q: number): string | null => {
      let g: string | null = null
      for (let r = q - 1; r >= 0; r--) {
        const x = seq[r]!
        if (x.t === 'open') g = x.id
        else if (x.t === 'text' ? /\S/.test(x.s) : x.t === 'close' || inked(x)) break
      }
      return g
    }
    type Side = { piece: string } | { text: string } | null
    /** the source at a point of `seq`, on one side: from piece q back (step -1) or on (step 1, up to the close of the group
     *  `close` where given): the nearest piece TeX set ink for, where no letter or digit stands before it; else the text up to
     *  that piece, spelled, the WANT characters next to the point */
    const sideOf = (q: number, step: 1 | -1, close?: string): Side => {
      let s = ''
      for (let r = q; r >= 0 && r < seq.length; r += step) {
        const x = seq[r]!
        if (close !== undefined && x.t === 'close' && x.id === close) break
        if (inked(x)) {
          if (!spellOf(s)) return { piece: (x as { id: string }).id }
          break
        }
        if (x.t === 'text') s = step > 0 ? s + x.s : x.s + s
      }
      const t = step > 0 ? spellOf(s).slice(0, WANT) : spellOf(s).slice(-WANT)
      return t ? { text: t } : null
    }
    // (B's glyphs of the unit at a glyph, on one side, read as sideOf reads the source: an element's glyph where no letter or
    // digit of its text stands before it, its piece; else its text's glyphs, spelled, up to a glyph of the unit that is no
    // text's, WANT characters)
    const pB = (b: number) => {
      let p = 0
      while (p + 1 < m.offB.length && (m.offB[p + 1] as number) <= b) p++
      return p
    }
    const charB = (b: number) => {
      const p = pB(b)
      return spellOf(ins.ink.pages[p]?.glyphs[b - (m.offB[p] as number)]?.u ?? '')
    }
    const sideB = (from: number, step: 1 | -1): Side => {
      let s = ''
      for (let b = from; b >= mem.bFirst && b <= mem.bLast && s.length < WANT; b += step) {
        if ((unitB[b] as number) !== mem.unit) continue
        if (roleB[b] !== ROLE.text) {
          if (!s && roleB[b] === ROLE.element && (pieceB[b] as number) >= 0) return { piece: String(pieceB[b]) }
          break
        }
        s = step > 0 ? s + charB(b) : charB(b) + s
      }
      const t = step > 0 ? s.slice(0, WANT) : s.slice(-WANT)
      return t ? { text: t } : null
    }
    const meets = (src: Side, at: Side, step: 1 | -1) =>
      !!src &&
      !!at &&
      ('piece' in src
        ? 'piece' in at && src.piece === at.piece
        : 'text' in at && (step < 0 ? at.text.endsWith(src.text) : at.text.startsWith(src.text)))
    // (the text before a projection offset, up to the piece before it that sets ink, and from it, spelled: as sideOf reads a
    // group's open)
    const textAt = (o: number, step: 1 | -1) => {
      const at: { s: string; inked: boolean }[] = []
      for (const x of seq)
        if (x.t === 'text') for (let c = 0; c < x.s.length; c++) at.push({ s: x.s[c]!, inked: false })
        else if (x.t === 'el' || x.t === 'unit') at.push({ s: '', inked: inked(x) })
      let s = ''
      for (let k = step > 0 ? o : o - 1; k >= 0 && k < at.length && !at[k]!.inked; k += step)
        s = step > 0 ? s + at[k]!.s : at[k]!.s + s
      return step > 0 ? spellOf(s).slice(0, WANT) : spellOf(s).slice(-WANT)
    }
    for (const e of ends) {
      // (the paragraph that ended is its own: its glyph before the end is the unit's, not a float's or a footnote's that TeX's
      // output routine put between two of its lines)
      if (e <= mem.bFirst || e > mem.bLast || (unitB[e - 1] as number) !== mem.unit) continue
      let b = e
      while (b <= mem.bLast && ((unitB[b] as number) !== mem.unit || (m.bToA[b] as number) < 0)) b++
      if (b > mem.bLast) continue
      const j = lineOf.get(m.bToA[b] as number)
      if (j === undefined || j <= 0) continue
      const before = sideB(e - 1, -1)
      const after = sideB(b, 1)
      // (an end inside a piece's own glyphs: the piece began before it, or goes on after it)
      if (after && 'piece' in after && (firstOf.get(Number(after.piece)) as number) < e) continue
      if (before && 'piece' in before && (lastOf.get(Number(before.piece)) as number) >= e) continue
      let at: { el: string } | { group: string } | null = null
      const met = seq.flatMap((x, q) =>
        x.t === 'open' && meets(sideOf(q - 1, -1), before, -1) && meets(sideOf(q + 1, 1, x.id), after, 1)
          ? [groupBefore(q + 1)!]
          : [],
      )
      if (new Set(met).size === 1) at = { group: met[0]! }
      else if (!met.length && after && 'piece' in after) {
        const q = seq.findIndex((x) => (x.t === 'el' || x.t === 'unit') && x.id === after.piece)
        if (q >= 0 && groupBefore(q) === null && meets(sideOf(q - 1, -1), before, -1)) at = { el: after.piece }
      }
      if (!at) {
        // (where no group's open meets the end, a group the instrument wrote as its content that stood there, read as a
        // group's open is: a paragraph TeX opened at it, which nothing states now, counted (a gate))
        if (
          !met.length &&
          before &&
          after &&
          'text' in before &&
          'text' in after &&
          unit.passed?.some((o) => {
            const tb = textAt(o, -1),
              ta = textAt(o, 1)
            return tb && ta && before.text.endsWith(tb) && after.text.startsWith(ta)
          })
        ) {
          mem.opensLost = (mem.opensLost ?? 0) + 1
          continue
        }
        // (no point stated: an open or an element stands where the next paragraph begins in the source (its side after met by
        // a group's open, or B's next glyph an element's), or plain text does)
        const anchored =
          (!!after && 'piece' in after) || seq.some((x, q) => x.t === 'open' && meets(sideOf(q + 1, 1, x.id), after, 1))
        mem.opensUnstated ??= [0, 0]
        mem.opensUnstated[anchored ? 0 : 1]++
        continue
      }
      if ('el' in at) {
        const el = mem.elements.find(([id]) => id === at.el)?.[1]
        if (el && el.opens === undefined) el.opens = j
      } else {
        mem.spanOpens ??= new Map()
        if (!mem.spanOpens.has(at.group)) mem.spanOpens.set(at.group, j)
      }
    }
  }
}

/** its label's parts and style */
function readLabel(fx: FactsIndex, r: MemberReading): void {
  const { gA } = fx
  const { mem } = r
  // -- its label's parts and style
  if (mem.labelAt && mem.label.length) {
    const lg = mem.label.map(gA)
    Object.assign(mem.labelAt, labelParts(lg, mem.labelAt.ink[0]), {
      style: styleOf(lg, mem.labelAt.style.size),
    })
  }
}

/** the class's tail after its text */
function readTail(fx: FactsIndex, r: MemberReading): void {
  const { gA } = fx
  const { mem, unit, lineOf } = r
  // -- the class's tail: its own text after its last letter, digit or element glyph, all on its last line
  if (unit) {
    // (a display's glyphs among them: a unit that ends with a display has no tail after its text before it)
    // (its end mark aside, END: ink TeX pushed past the text, no part of it, as before it was claimed; and its trail, TRAIL: ink
    // TeX set after its text, no part of it, the comma before 2608.16117v1's "19104," its class's tail, §18.59)
    const elGlyphs = [...mem.els].flatMap(([id, l]) => (id === END || id === TRAIL ? [] : l))
    const seq = [...mem.text, ...elGlyphs].sort((x, y) => x - y)
    const isEl = new Set(elGlyphs)
    let last = -1
    seq.forEach((a, q) => {
      if (isEl.has(a) || /[\p{L}\p{N}]/u.test(gA(a).u)) last = q
    })
    const after = seq.slice(last + 1).filter((a) => /\S/.test(gA(a).u))
    if (last >= 0 && after.length && after.every((a) => lineOf.get(a) === lineOf.get(seq[last] as number))) {
      const t = tailOf(after.map(gA), sourceEndMarks(unit.content))
      if (t) mem.tail = t
    }
  }
}

/** its lines' PINNED and SHORTSKIP flags */
function readLineFlags(fx: FactsIndex, r: MemberReading): void {
  const { members, bandOn } = fx
  const { mem, own, sizeOf } = r
  // -- its lines' flags: PINNED (shares its baseline with ink that stays), SHORTSKIP (a display under it with TeX's short skip)
  // (PINNED as today's edgesOf reads a line alone, RUN:1638-1650: any glyph of the page on its baseline's band within its
  // block's span and off its own extent, its own label's aside (whether a label kept stands before it is U.params' to say);
  // its block, its run of lines on one page and column, each under the one before; the band by the line's size)
  const label = new Set(mem.label)
  // (and the glyphs of the name that leads it: its lead's, drawn with it (Placed.bound), as today's line starts at the name)
  const leader = mem.leader !== undefined ? members[mem.leader] : undefined
  for (const a of leader?.text ?? []) label.add(a)
  // (its block: the run of its lines on one page and column, each under the one before, which the line before and the line
  // after share with it pairwise: the runs cut once, each run's span read once, one pass over the lines)
  const spans: [number, number][] = []
  {
    const same = (x: Line, y: Line) => x[0] === y[0] && x[1] === y[1] && x[4] > y[4]
    let a = 0
    for (let q = 1; q <= own.length; q++) {
      if (q < own.length && same(own[q - 1]![0], own[q]![0])) continue
      let x0 = Number.POSITIVE_INFINITY
      let x1 = Number.NEGATIVE_INFINITY
      for (let k = a; k < q; k++) {
        x0 = Math.min(x0, own[k]![0][2])
        x1 = Math.max(x1, own[k]![0][3])
      }
      for (let k = a; k < q; k++) spans.push([x0, x1])
      a = q
    }
  }
  const spanOf = (q: number): [number, number] => spans[q]!
  own.forEach(([l, j], q) => {
    const size = l[10] ?? sizeOf(j)
    const ink = bandOn(l[0], l[4] - 0.4 * size, l[4] + 0.4 * size).filter((g) => !label.has(g.a))
    if (pinnedOf(l, size, ink, spanOf(q))) l[9] |= 2
  })
  const displays = mem.elements.filter(([, el]) => el.kind === 'display').flatMap(([, el]) => el.ink)
  const short = shortSkipLines(mem.lines, displays, sizeOf)
  for (const j of short) (mem.lines[j] as Line)[9] |= 4
  if (short.size) mem.read.push('shortskip')
}

/** the room beside its lines, a cell's band and walls, a figure text's room */
function readRoom(fx: FactsIndex, r: MemberReading): void {
  const { inkA, m, owned, boxes, ownedBox, staysOn, blockOf } = fx
  const { mem, unit } = r
  // -- room beside its lines, a cell's band
  const mine = new Set(mem.textBoxes.map(([p, j]) => `${p}|${j}`))
  for (const l of mem.elBoxes.values()) for (const [p, j] of l) mine.add(`${p}|${j}`)
  const foreignCache = new Map<number, InkBox[]>()
  const foreign = (p: number) => {
    let f = foreignCache.get(p)
    if (f) return f
    f = []
    const o = m.offA[p - 1] as number
    // (a glyph nothing of which is shown, wholly outside its clip or at an alpha of 0, is no ink beside it: 1706.03762v7 p13's
    // heading, whose side stopped at a figure's title clipped out of its form, the checkpoint's measure-9)
    inkA.pages[p - 1]!.glyphs.forEach((g, j) => {
      const c = owned.member(o + j)
      if (isInk(g) && !g.unseen && c !== mem.ord && c !== mem.leader)
        f!.push({ x0: g.x0, x1: g.x1, y0: g.bottom, y1: g.top, y: g.y })
    })
    for (const b of boxes(p)) if (!mine.has(`${p}|${b.j}`)) f.push(b)
    foreignCache.set(p, f)
    return f
  }
  const side = sideOf(
    mem.lines,
    foreign,
    blockOf,
    unit?.cell ? (p) => boxes(p).filter((b) => !mine.has(`${p}|${b.j}`)) : undefined,
  )
  if (side) {
    mem.room.side = side.side
    // (a cell's sides that stop at its walls: X.further widens it a quarter of its size off a rule, half way to a glyph)
    if (unit?.cell && side.wall) mem.room.wall = side.wall
  }
  // (the ink that stays beside its text lines, no member's, facts.ts staysOf: a cell's room is its walls', a figure text's
  // its figure reading's)
  if (!unit?.cell && !unit?.figure) {
    const stays = staysOf(mem.lines, staysOn, blockOf)
    if (stays) mem.room.stays = stays
  }
  // (a figure text's room as today's figure reading tells it (layout/figure-text.mjs roomOf, its set's cut): along a level run,
  // the free line from its room before its box to its room after; and the stroke under its text, which a translation reaching
  // it is crowded by. A turned one's is stated with its run (Placed.run: its first glyph's origin, its box's length along its
  // direction, its room before and after along it; its line is its box on the page, which tells none of them), its side the
  // side of its box as before: a new name for the new fact, so that a typesetter of before reads the fields it knows alike)
  const fig = unit?.figure
  if (fig && fig.x !== undefined && fig.length !== undefined && fig.before !== undefined && fig.after !== undefined) {
    if (!fig.dir) mem.room.side = [r2(fig.x - fig.before), r2(fig.x + fig.length + fig.after)]
    else if (fig.y !== undefined) mem.run = [r2(fig.x), r2(fig.y), r2(fig.length), r2(fig.before), r2(fig.after)]
  }
  if (fig?.under !== undefined) mem.room.under = r2(fig.under)
  if (fig?.over !== undefined) mem.room.over = r2(fig.over)
  if (unit?.cell) {
    // (the table's rules over and under it: no unit's ink. An underscore TeX draws as a rule on a baseline is its unit's, a
    // fraction's bar its element's: 1512.03385v1 p5's "conv2_x" read its own as the rule over it, 2610.21924v1 p21's cells
    // the row's above and below)
    const band = bandOf(mem.lines, (p) => boxes(p).filter((b) => b.rule && !ownedBox.has(`${p}|${b.j}`)))
    if (band) mem.room.band = band.band
    if (band?.open) mem.room.bandOpen = band.open
  }
}

/** its writing direction */
function readDirection(_fx: FactsIndex, r: MemberReading): void {
  const { mem, unit } = r
  // -- its writing direction: its lines' characters set right to left where its text's paragraph direction is (UAX #9 P2-P3:
  // Line.flags' RTL), which the order of its links along a line follows
  if (unit && rightToLeft(unit.content)) for (const l of mem.lines) l[9] |= LINE_FLAG.RTL
}

/** its alignment, where TeX did not state it */
function readAlign(fx: FactsIndex, r: MemberReading): void {
  const { blockOf, column, linesOn } = fx
  const { mem, unit, own, sizeOf } = r
  // -- its alignment, where TeX did not state it (a cell's: its column's class or its own paragraph's, marks/channels.ts
  // readAlign): the maker's reading (MAKE:2121-2135); a single-line cell by its column
  if (unit && unit.align !== 'c' && unit.align !== 'l' && unit.align !== 'r') {
    const labelX0 = mem.labelAt && mem.labelAt.ink[0] === mem.lines[0]?.[0] ? mem.labelAt.ink[1] : undefined
    // (a cell is read by its column's cells alone, never by the page's column: today's centredFlag RUN:2102)
    let a = unit.cell ? (unit.align ?? 'j') : alignOf(mem.lines, sizeOf, blockOf, unit.align, labelX0)
    if (unit.cell && own.length === 1) {
      const l0 = own[0]![0]
      const c = unit.cell
      const spans = (column.get(`${c.table}|${c.col}|${c.span ?? 1}`) ?? []).flatMap((x) =>
        x.lines.filter((l) => l[0] === l0[0] && !(l[9] & 1)).map((l) => [l[2], l[3]] as [number, number]),
      )
      if (cellCentred(spans) === true) a = 'c'
    }
    // (a line of the page's head or foot, alone: flush right where it ends at its measure's end and starts within it, TeX's
    // \hfil before it in the text width's box (2609.36054v2's "page 13 of 14", read justified, its translation laid from the
    // original's start and shrunk); left and centred as read above. A paragraph's single line, full and indented, is no box
    // of the text width: its alignment is its paragraph's)
    if (a === 'j' && unit.align === undefined && HEAD_FOOT.has(mem.kind) && own.length === 1) {
      const [l, j] = own[0]!
      const e = blockOf(l)
      if (Math.abs(l[3] - e[1]) <= CENTRE && l[2] - e[0] > INSET * sizeOf(j)) a = 'r'
    }
    // (nothing tells it and its column does not centre it: centred by its own block's lines, a single line's stack)
    if (a === 'j' && unit.align === undefined && !unit.cell)
      if (
        centredByBlock(
          own.map(([l]) => l),
          linesOn.get(mem.lines[0]?.[0] ?? 0) ?? [],
          mem.lead,
        )
      ) {
        a = 'c'
        // (a single line's: read again over the TeX line it shares, once the flows are known, flows.ts rowAligns)
        if (own.length === 1) mem.byBlock = true
      }
    if (unit.align === undefined || a !== unit.align) mem.read.push('align')
    mem.align = a
  }
}

/** its label's own line's alignment, where the label stands on none of its lines */
function readLabelLine(_fx: FactsIndex, r: MemberReading): void {
  const { mem } = r
  // -- its label's own line, where the label stands on none of its lines (IEEEtran's "TABLE I" above its caption): that line's
  // alignment against its measure, read as a line's above (centred by alignOf; flush right where it ends at its measure's end
  // and starts within it; else flush left), never the unit's (a class may set the label flush left over a centred text)
  if (mem.labelAt && mem.labelAt.line === undefined && mem.labelMeasure) {
    const lb = mem.labelAt
    const [m0, m1] = mem.labelMeasure
    const l = [lb.ink[0], 0, lb.ink[1], lb.ink[3], lb.ink[5], lb.ink[4], lb.ink[2], m0, m1, 0] as Line
    const size = lb.style.size > 0 ? lb.style.size : 10
    const e: [number, number] = [m0, m1]
    lb.align =
      alignOf(
        [l],
        () => size,
        () => e,
      ) === 'c'
        ? 'c'
        : Math.abs(l[3] - m1) <= CENTRE && l[2] - m0 > INSET * size
          ? 'r'
          : 'l'
  }
}
