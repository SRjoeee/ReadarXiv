// The facts of every located member read on A after its lines (stage 1a-2; facts.ts holds each reading): its elements' kept
// state, fill, the original's mark after a display or on a held line, a forced break's line and room, a paragraph TeX opened
// at an element; its label's parts; the class's tail; its lines' PINNED and SHORTSKIP flags; the room beside its lines and a
// cell's band; its alignment where TeX did not state it. Each fact read rather than stated by TeX is named in `read`.
import type { El, Line, Piece } from '@readarxiv/format'
import type { Mapping } from '../align/align.ts'
import type { Doc, DocGlyph } from '../doc.ts'
import { isImage, isPath } from '../doc.ts'
import { type Instrument, type InstrumentUnit, ROLE } from '../instrument.ts'
import {
  alignOf,
  bandOf,
  bracketsOf,
  breakEnd,
  cellCentred,
  FORCED_BREAK,
  fillOfGlyphs,
  type InkBox,
  labelParts,
  pinnedOf,
  shortSkipLines,
  sideOf,
  sourceEndMarks,
  styleOf,
  tailOf,
} from './facts.ts'
import { r2 } from './lines.ts'

/** a line that ends short of its column's right edge by this share of its size ends at a forced break (today's SHORT TEX:87),
 *  read only where the marked compile set no point for the break */
const SHORT = 0.5
import type { Member } from './locate.ts'

export interface FactsInput {
  ins: Instrument
  inkA: Doc
  m: Mapping
  members: Member[]
  claimedA: Int32Array
  pageA: Int32Array
  unitB: Int32Array
  roleB: Uint8Array
  pieceB: Int32Array
  /** the units the members are of: the instrument's, then those locate made on A (its ink units, kept blocks and figure texts) */
  units?: readonly InstrumentUnit[]
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

export function factsOf({
  ins,
  inkA,
  m,
  members,
  claimedA,
  pageA,
  unitB,
  roleB,
  pieceB,
  units = ins.units,
}: FactsInput): void {
  const gA = (a: number): DocGlyph => {
    const p = (pageA[a] as number) - 1
    return inkA.pages[p]!.glyphs[a - (m.offA[p] as number)]!
  }
  // (a page's glyphs by baseline, the blank aside, each with its global index; those whose baseline is within [lo, hi])
  const inkByPage = new Map<number, { x0: number; x1: number; y: number; a: number }[]>()
  const bandOn = (p: number, lo: number, hi: number) => {
    let l = inkByPage.get(p)
    if (!l) {
      const o = m.offA[p - 1] as number
      l = inkA.pages[p - 1]!.glyphs.flatMap((g, k) =>
        /\S/.test(g.u) ? [{ x0: g.x0, x1: g.x1, y: g.y, a: o + k }] : [],
      )
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
  // (each page's and column's block: its justified lines' measure where it has one, else all its lines' hull)
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
    if (l[7] < l[2] - 0.01 || l[8] > l[3] + 0.01) return [l[7], l[8]]
    return hull.get(l[1] === 2 ? `${l[0]}|*` : `${l[0]}|${l[1]}`) ?? [l[2], l[3]]
  }
  // (B's paragraph ends, globally)
  const ends: number[] = []
  ;(ins.tex.paragraphEnds ?? []).forEach((l, p) => {
    for (const g of l) ends.push((m.offB[p] as number) + g)
  })
  ends.sort((x, y) => x - y)
  // (each element's opening point on B, by unit and piece: the glyph before which it begins, global)
  const placeAt = new Map<string, number>()
  for (const pl of ins.places ?? [])
    if (!pl.end) placeAt.set(`${pl.unit}|${pl.piece}`, (m.offB[pl.page - 1] as number) + pl.glyph)
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

  for (const mem of members) {
    if (!mem.located || !mem.lines.length) continue
    const unit = mem.unit >= 0 ? units[mem.unit] : undefined
    const lineOf = new Map<number, number>()
    mem.lineGlyphs.forEach((gs, j) => {
      for (const a of gs) lineOf.set(a, j)
    })
    const sizeOf = (j: number) => mostOf((mem.lineGlyphs[j] ?? []).map((a) => r2(gA(a).size))) ?? mem.style.size
    const own = mem.lines.map((l, j) => [l, j] as const).filter(([l]) => !(l[9] & 1))
    mem.read.push('measure')

    // -- its elements
    const pieces = unit ? elsOf(unit.content) : new Map()
    const breaks: [El, number][] = []
    const unplaced: [string, El][] = []
    for (const [id, el] of mem.elements) {
      const gs = (mem.els.get(id) ?? []).map(gA)
      const fill = fillOfGlyphs(gs)
      // (its style where it is filled otherwise than black, or where the typesetter may draw it as text: its text stated)
      if (fill !== undefined || el.text !== undefined)
        el.style = { ...styleOf(gs), ...(fill !== undefined ? { fill } : {}) }
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
              l[0] === k[0] &&
              Math.min(k[4], l[5]) > Math.max(k[2], l[6]) &&
              Math.min(k[3], l[3]) > Math.max(k[1], l[2]),
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
        let b = (placeAt.get(`${mem.unit}|${id}`) ?? 0) - 1
        while (b >= 0 && b >= mem.bFirst && ((unitB[b] as number) !== mem.unit || (m.bToA[b] as number) < 0)) b--
        const j = b >= mem.bFirst && b >= 0 ? lineOf.get(m.bToA[b] as number) : undefined
        if (j !== undefined) breaks.push([el, j])
        else unplaced.push([id, el])
      }
    }
    // (a break the marked compile set no point for, an invisible piece's: today's reading of the line it ended (forcedBreaks
    // TEX:120), its own lines that end short of their column's right edge by SHORT of a size, not its last and none over a
    // display, taken in order where they are as many as such breaks; the line read, not stated. Breaks the source sets one after
    // the other, nothing but white space between them, end one line: TeX ends it at the first, each next one sets an empty line)
    if (unplaced.length) {
      const order = new Map<string, number>()
      const blankAfter: boolean[] = []
      const walk = (ps: readonly Piece[]) => {
        for (const p of ps) {
          if (p.t === 'span') walk(p.content)
          else if (p.t === 'el') {
            order.set(p.id, blankAfter.length)
            blankAfter.push(true)
          } else if (p.t === 'text' && /\S/.test(p.s) && blankAfter.length) blankAfter[blankAfter.length - 1] = false
          else if (p.t === 'unit' && blankAfter.length) blankAfter[blankAfter.length - 1] = false
        }
      }
      walk(unit?.content ?? [])
      const groups: El[][] = []
      let prev = -2
      for (const [id, el] of unplaced) {
        const k = order.get(id) ?? -2
        // (consecutive: the piece right after the one before, with nothing but white space between them)
        if (groups.length && k === prev + 1 && blankAfter[prev]) groups.at(-1)!.push(el)
        else groups.push([el])
        prev = k
      }
      const right = new Map<string, number>()
      for (const [l] of own) right.set(`${l[0]}|${l[1]}`, Math.max(right.get(`${l[0]}|${l[1]}`) ?? -1e9, l[3]))
      const short: number[] = []
      own.forEach(([l, j], q) => {
        const next = mem.lines[j + 1]
        if (q === own.length - 1 || !next || next[9] & 1) return
        if (l[3] < (right.get(`${l[0]}|${l[1]}`) as number) - SHORT * sizeOf(j)) short.push(j)
      })
      if (short.length === groups.length) {
        groups.forEach((g, q) => {
          for (const el of g) breaks.push([el, short[q] as number])
        })
        mem.read.push('breaks')
      }
    }
    const breakLines = new Set(breaks.map(([, j]) => j))
    for (const [el, j] of breaks) {
      const e = breakEnd(mem.lines, j, breakLines, ins.tex.lineskip)
      if (e) el.ends = e
    }
    // (a paragraph TeX opened inside the unit at an element (C13, C15): a paragraph end of B's between its glyphs whose next
    // glyph of the unit's is an element's; its line on A)
    if (mem.bFirst >= 0)
      for (const e of ends) {
        // (the paragraph that ended is its own: its glyph before the end is the unit's, not a float's or a footnote's that TeX's
        // output routine put between two of its lines)
        if (e <= mem.bFirst || e > mem.bLast || (unitB[e - 1] as number) !== mem.unit) continue
        let b = e
        while (b <= mem.bLast && ((unitB[b] as number) !== mem.unit || (m.bToA[b] as number) < 0)) b++
        if (b > mem.bLast || roleB[b] !== ROLE.element) continue
        const j = lineOf.get(m.bToA[b] as number)
        const el = mem.elements.find(([id]) => id === String(pieceB[b]))?.[1]
        if (el && j !== undefined && j > 0 && el.opens === undefined) el.opens = j
      }

    // -- its label's parts and style
    if (mem.labelAt && mem.label.length) {
      const lg = mem.label.map(gA)
      Object.assign(mem.labelAt, labelParts(lg, mem.labelAt.ink[0]), { style: styleOf(lg, mem.labelAt.style.size) })
    }

    // -- the class's tail: its own text after its last letter, digit or element glyph, all on its last line
    if (unit) {
      // (a display's glyphs among them: a unit that ends with a display has no tail after its text before it)
      const seq = [...mem.text, ...[...mem.els.values()].flat()].sort((x, y) => x - y)
      const isEl = new Set([...mem.els.values()].flat())
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
        const c = claimedA[o + j] as number
        if (/\S/.test(g.u) && !g.unseen && c !== mem.ord && c !== mem.leader)
          f!.push({ x0: g.x0, x1: g.x1, y0: g.bottom, y1: g.top, y: g.y })
      })
      for (const b of boxes(p)) if (!mine.has(`${p}|${b.j}`)) f.push(b)
      foreignCache.set(p, f)
      return f
    }
    const side = sideOf(mem.lines, foreign, blockOf)
    if (side) mem.room.side = side
    // (a figure text's room as today's figure reading tells it (layout/figure-text.mjs roomOf, its set's cut): the free line along
    // its run from its room before its box to its room after, a point P at P·dir (along a level run its x); and the stroke under
    // its text, which a translation reaching it is crowded by. A turned one's run is stated too, its first glyph's origin and its
    // box's length along it (Placed.run): its line is its box on the page, which tells neither)
    const fig = unit?.figure
    if (
      fig &&
      fig.x !== undefined &&
      fig.length !== undefined &&
      fig.before !== undefined &&
      fig.after !== undefined &&
      (!fig.dir || fig.y !== undefined)
    ) {
      const at = fig.dir ? fig.x * fig.dir[0] + fig.y! * fig.dir[1] : fig.x
      mem.room.side = [r2(at - fig.before), r2(at + fig.length + fig.after)]
      if (fig.dir) mem.run = [r2(fig.x), r2(fig.y!), r2(fig.length)]
    }
    if (fig?.under !== undefined) mem.room.under = r2(fig.under)
    if (unit?.cell) {
      // (the table's rules over and under it: no unit's ink. An underscore TeX draws as a rule on a baseline is its unit's, a
      // fraction's bar its element's: 1512.03385v1 p5's "conv2_x" read its own as the rule over it, 2610.21924v1 p21's cells
      // the row's above and below)
      const band = bandOf(mem.lines, (p) => boxes(p).filter((b) => b.rule && !ownedBox.has(`${p}|${b.j}`)))
      if (band) mem.room.band = band
    }

    // -- its alignment, where TeX did not state it: the maker's reading (MAKE:2121-2135); a single-line cell by its column
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
      if (unit.align === undefined || a !== unit.align) mem.read.push('align')
      mem.align = a
    }
  }
}
