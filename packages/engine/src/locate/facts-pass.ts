// The facts of every located member read on A after its lines (stage 1a-2; facts.ts holds each reading): its elements' kept
// state, fill, the original's mark after a display or on a held line, a forced break's line and room, a paragraph TeX opened
// at an element; its label's parts; the class's tail; its lines' PINNED and SHORTSKIP flags; the room beside its lines and a
// cell's band; its alignment where TeX did not state it. Each fact read rather than stated by TeX is named in `read`.
import type { El, Line, Piece } from '@readarxiv/format'
import type { Mapping } from '../align/align.ts'
import type { Doc, DocGlyph } from '../doc.ts'
import { isImage, isPath } from '../doc.ts'
import { type Instrument, ROLE } from '../instrument.ts'
import {
  alignOf,
  bandOf,
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

export function factsOf({ ins, inkA, m, members, claimedA, pageA, unitB, roleB, pieceB }: FactsInput): void {
  const gA = (a: number): DocGlyph => {
    const p = (pageA[a] as number) - 1
    return inkA.pages[p]!.glyphs[a - (m.offA[p] as number)]!
  }
  const isDisplayGlyph = new Uint8Array(m.offA[inkA.pages.length] as number)
  for (const mem of members)
    for (const [id, el] of mem.elements)
      if (el.kind === 'display') for (const a of mem.els.get(id) ?? []) isDisplayGlyph[a] = 1
  // (ink that stays whatever the translation: owned by no located member, a kept block's, a display's)
  const stays = (a: number) => {
    const o = claimedA[a] as number
    return o < 0 || !!members[o]?.fixed || !!isDisplayGlyph[a]
  }
  const staysByPage = new Map<number, { x0: number; x1: number; y: number }[]>()
  const staysOn = (p: number) => {
    let l = staysByPage.get(p)
    if (l) return l
    l = []
    const o = m.offA[p - 1] as number
    inkA.pages[p - 1]!.glyphs.forEach((g, j) => {
      if (/\S/.test(g.u) && stays(o + j)) l!.push({ x0: g.x0, x1: g.x1, y: g.y })
    })
    staysByPage.set(p, l)
    return l
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
    const c = mem.unit >= 0 ? ins.units[mem.unit]?.cell : undefined
    if (!c || !mem.located) continue
    // (today's column of a cell: the cells of its table, column and span, RUN:1508 columnKey)
    const k = `${c.table}|${c.col}|${c.span ?? 1}`
    ;(column.get(k) ?? column.set(k, []).get(k)!).push(mem)
  }

  for (const mem of members) {
    if (!mem.located || !mem.lines.length) continue
    const unit = mem.unit >= 0 ? ins.units[mem.unit] : undefined
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
    for (const [id, el] of mem.elements) {
      const gs = (mem.els.get(id) ?? []).map(gA)
      const fill = fillOfGlyphs(gs)
      if (fill !== undefined) el.style = { ...styleOf(gs), fill }
      // (its own brackets: its first and last glyphs where they are a pair of them, "[" "]" around a citation's numbers:
      // the stated half of T12, which a translation that brackets it takes)
      const tg = gs.filter((x) => /\S/.test(x.u))
      const b0 = tg[0]
      const b1 = tg.at(-1)
      const PAIRS: Record<string, string> = { '[': ']', '(': ')', '{': '}', '\u27e8': '\u27e9' }
      if (tg.length > 2 && b0 && b1 && PAIRS[b0.u] === b1.u) {
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
        // lines is kept by locate (B11 OUTSIDE))
        const on = el.ink.map((k) =>
          mem.lines.findIndex((l) => l[0] === k[0] && Math.min(k[4], l[5]) > Math.max(k[2], l[6])),
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
      const seq = [
        ...mem.text,
        ...[...mem.els].flatMap(([id, l]) => (pieces.get(id)?.kind === 'display' ? [] : l)),
      ].sort((x, y) => x - y)
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
    for (const [l, j] of own) if (pinnedOf(l, sizeOf(j), staysOn(l[0]), blockOf(l))) l[9] |= 2
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
      inkA.pages[p - 1]!.glyphs.forEach((g, j) => {
        if (/\S/.test(g.u) && (claimedA[o + j] as number) !== mem.ord)
          f!.push({ x0: g.x0, x1: g.x1, y0: g.bottom, y1: g.top })
      })
      for (const b of boxes(p)) if (!mine.has(`${p}|${b.j}`)) f.push(b)
      foreignCache.set(p, f)
      return f
    }
    const side = sideOf(mem.lines, foreign, blockOf)
    if (side) mem.room.side = side
    if (unit?.cell) {
      const band = bandOf(mem.lines, (p) => boxes(p).filter((b) => b.rule))
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
