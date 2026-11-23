// A unit whose text TeX set turned, in its frame (docs/PDF-READER.md §18.113): TeX sets a box LEVEL and then turns it
// (\rotatebox, `sideways`, `sidewaystable`, a landscape float), so the unit is stated as it stands in its box, unturned: its
// lines, its leading, its measure and its room read off its glyphs and the page's ink seen through the inverse of its turn,
// and the turn beside them (Located.frames, Part.frames). The typesetter lays it there as it lays any unit of its kind and
// the reader draws it through the turn; nothing of it is read in the page's own axes. Two steps of locate: right after the
// members are placed (phase 1b, holdTurned), a framed member is held out of every reading of the page (its lines, columns,
// measures, rooms, flows, ties and links are the level page's, and a turned box's in the page's axes would move them: a
// table's measure widened to a turned header's box, a caption's separation read against it); after the last (phase 16,
// frameTurned) it is read in its frame and put in its page's frame of its turn (Located.frames).
//
// A unit is framed where it is located, no figure text, its text all turned glyphs (own/own.ts TURNED: no level text glyph),
// on one page, in one turn. One whose glyphs stand in two turns or on two pages is not framed: it stays the original's
// (`turned: two turns`, `turned: two pages`).
//
// The frame: the page's coordinates turned back, the turn's direction (ux, uy) being the frame's x axis on the page, about the
// page's origin: a point (x, y) of the page is (ux x + uy y, -uy x + ux y) in its frame, which the reader turns back by
// (ux, uy). No origin is chosen: every unit of one turn on a page shares one frame, as the glyphs of a turned table share it.
import type { El, Ink, Line, Room } from '@readarxiv/format'
import type { Doc, DocGlyph, DocTurned } from '../doc.ts'
import { TURN_SAME } from '../own/own.ts'
import {
  alignOf,
  CENTRE,
  fakedCaps,
  INSET,
  labelParts,
  mostOf,
  sourceText,
  styleOf,
  textOf,
  turnedStyleGlyph,
  unitSize,
} from './facts.ts'
import { LABEL_KIND, ON_BASE, TEXT_CLASSES } from './geometry.ts'
import { cutLines, isInk, r2 } from './lines.ts'
import { field, INKED_CLASSES, type Located, type Member, piecesOf, standsOn, type Work } from './work.ts'

/** a point of the page in the frame of direction (ux, uy) */
export const toFrame = (ux: number, uy: number, x: number, y: number): [number, number] => [
  ux * x + uy * y,
  -uy * x + ux * y,
]
/** a box of the page ([x0, y0, x1, y1]) in the frame: the box of its four corners turned back */
const boxToFrame = (ux: number, uy: number, b: readonly number[]): [number, number, number, number] => {
  const c = [
    toFrame(ux, uy, b[0]!, b[1]!),
    toFrame(ux, uy, b[2]!, b[1]!),
    toFrame(ux, uy, b[0]!, b[3]!),
    toFrame(ux, uy, b[2]!, b[3]!),
  ]
  return [
    Math.min(...c.map((q) => q[0])),
    Math.min(...c.map((q) => q[1])),
    Math.max(...c.map((q) => q[0])),
    Math.max(...c.map((q) => q[1])),
  ]
}

/** every box of ink on page `p` of A in the frame of direction (ux, uy), but the member's own turned glyphs (`mine`) and boxes
 *  (`mineBoxes`): its level glyphs' boxes, its other turned glyphs' bands, its painted boxes (a rule, an image, a fill) */
function inkBoxesOf(
  inkA: Doc,
  p: number,
  ux: number,
  uy: number,
  mine: ReadonlySet<number>,
  mineBoxes: ReadonlySet<number>,
): [number, number, number, number][] {
  const pg = inkA.pages[p - 1]!
  const out: [number, number, number, number][] = []
  for (const g of pg.glyphs) if (!g.blank) out.push(boxToFrame(ux, uy, [g.x0, g.bottom, g.x1, g.top]))
  ;(pg.turned ?? []).forEach((t, j) => {
    if (mine.has(j) || !/\S/.test(t.u)) return
    const [ox, oy] = [t.ox - t.uy * t.descent * t.size, t.oy + t.ux * t.descent * t.size]
    const [tx, ty] = [t.ex - t.uy * t.ascent * t.size, t.ey + t.ux * t.ascent * t.size]
    out.push(boxToFrame(ux, uy, [Math.min(ox, tx), Math.min(oy, ty), Math.max(ox, tx), Math.max(oy, ty)]))
  })
  for (let b = 0; b < pg.kinds.length; b++) {
    // (a painted path's or an image's box: a glyph set turned is a box of kind -4, read above as its glyph)
    if ((pg.kinds[b] as number) === -4 || mineBoxes.has(b)) continue
    out.push(boxToFrame(ux, uy, pg.boxes.slice(4 * b, 4 * b + 4)))
  }
  return out
}

/** whether a turned glyph paints: by its own ink where pageInk read it (its outline's band, none for an outline of nothing
 *  drawn), whatever its Unicode, as a level glyph is ink (lines.ts isInk: CMEX's delimiters PDF.js maps to white space are
 *  ink); inside a form XObject, an included figure's, by its Unicode, as there; by its Unicode on a page read without its band */
export const paints = (t: DocTurned): boolean =>
  t.form || t.up === undefined || t.down === undefined ? /\S/.test(t.u) : t.up > t.down

/** a turned glyph of A as a level glyph of the frame of direction (ux, uy): along its line from its origin to its advance's
 *  end, its font's band about its baseline, its own ink across that band where it paints (`paints`), none where it does not */
function frameGlyph(t: DocTurned, ux: number, uy: number): DocGlyph {
  const [a, y] = toFrame(ux, uy, t.ox, t.oy)
  const [b] = toFrame(ux, uy, t.ex, t.ey)
  const blank = !/\S/.test(t.u)
  const ink = paints(t)
  return {
    u: t.u,
    code: t.code,
    font: t.base,
    base: t.base,
    x0: Math.min(a, b),
    x1: Math.max(a, b),
    y,
    top: ink ? y + t.ascent * t.size : y,
    bottom: ink ? y + t.descent * t.size : y,
    size: t.size,
    ix0: Math.min(a, b),
    ix1: ink ? Math.max(a, b) : Math.min(a, b),
    n: t.n,
    k: t.k,
    form: false,
    blank,
    fill: t.fill ?? 0,
  }
}

/** a framed member's lines in its frame (its text's and its elements' glyphs, seen in the frame as level glyphs, cut into lines
 *  by locate's own reading, lines.ts cutLines, an element's told apart from its text as a level unit's formula is), its lead,
 *  its measure and its room: what the typesetter reads of any member, read here in the frame; and the line each of its turned
 *  glyphs was cut into, by its index among the page's turned */
function frameFacts(
  inkA: Doc,
  mem: Member,
  p: number,
  ux: number,
  uy: number,
): Pick<Member, 'lines' | 'lead' | 'room'> & { lineOf: Map<number, number> } {
  const T = inkA.pages[p - 1]!.turned!
  // (its text's and its elements' turned glyphs in stream order)
  const el = new Set([...mem.turnedEls.values()].flatMap((l) => l.map(([, j]) => j)))
  const own = [...mem.turned, ...[...mem.turnedEls.values()].flat()].map(([, j]) => j).sort((a, b) => a - b)
  const gs = own.map((j) => frameGlyph(T[j]!, ux, uy))
  const lines = cutLines(
    gs.map((_, i) => i),
    (i) => ({ page: p, g: gs[i]! }),
    (i) => el.has(own[i]!),
  )
  const lineOf = new Map<number, number>()
  lines.forEach((l, q) => {
    for (const i of l.gs) lineOf.set(own[i]!, q)
  })
  // (its measure: its lines' extent, read on A as for a unit TeX states none of; its lead: its lines' step, else its own)
  const m0 = Math.min(...lines.map((l) => l.x0)),
    m1 = Math.max(...lines.map((l) => l.x1))
  const steps = lines.slice(1).map((l, k) => lines[k]!.base - l.base)
  const lead = steps.length ? r2([...steps].sort((a, b) => a - b)[steps.length >> 1]!) : mem.lead
  // (its room in the frame: along its lines to the nearest ink on their band before and after them; under its last line to the
  // nearest ink across its measure)
  const others = inkBoxesOf(
    inkA,
    p,
    ux,
    uy,
    new Set([...mem.turned, ...[...mem.turnedEls.values()].flat(), ...mem.turnedLabel].map(([, j]) => j)),
    new Set([...mem.elBoxes.values()].flat().map(([, b]) => b)),
  )
  const band0 = Math.min(...lines.map((l) => l.bottom)),
    band1 = Math.max(...lines.map((l) => l.top))
  let left = Number.NEGATIVE_INFINITY,
    right = Number.POSITIVE_INFINITY
  for (const [a0, b0, a1, b1] of others) {
    if (b1 <= band0 || b0 >= band1) continue
    if (a0 >= m1) right = Math.min(right, a0)
    else if (a1 <= m0) left = Math.max(left, a1)
  }
  const last = lines.at(-1)!
  let below = Number.POSITIVE_INFINITY
  for (const [a0, , a1, b1] of others)
    if (a1 > m0 && a0 < m1 && b1 <= last.bottom) below = Math.min(below, last.bottom - b1)
  const room: Room = {
    below: r2(Number.isFinite(below) ? below : last.size),
    side: [r2(Number.isFinite(left) ? left : m0), r2(Number.isFinite(right) ? right : m1)],
  }
  return {
    lines: lines.map(
      (l): Line => [p, 0, r2(l.x0), r2(l.x1), r2(l.base), r2(l.top), r2(l.bottom), r2(m0), r2(m1), 0, r2(l.size)],
    ),
    lead,
    room,
    lineOf,
  }
}

/**
 * A framed member's elements as a level member's are stated (geometry.ts lineGeometry), read in its frame: each piece's ink one
 * box per line of the unit's its glyphs were cut into (`lineOf`), across their advances, on that line's baseline, its rules and
 * images joined to the line their band meets (a box of their own where they meet none): what the typesetter crops, through the
 * turn, from the original's turned ink. One of no ink of a class drawn from its ink (INKED_CLASSES) states which of three it is
 * by the instrument's facts alone: TeX set nothing for it (Instrument `empty`, its points or its probe: a turned glyph is a
 * painted box between them), it stands outside the unit's text (`outside`), or neither (its ink not found: the typesetter
 * leaves the unit the original's). B's level stream between its points is no statement here: a turned unit sets none there
 */
function frameElements(w: Work, mem: Member, p: number, ux: number, uy: number, lineOf: ReadonlyMap<number, number>) {
  const { inkA, emptyPiece, outsidePiece } = w.ix
  const unit = mem.unit >= 0 ? w.units[mem.unit] : undefined
  if (!unit) return
  const T = inkA.pages[p - 1]!.turned!
  const classOf = new Map(unit.classes ?? [])
  for (const [id, p0] of piecesOf(unit.content)) {
    if (p0.t !== 'el' && p0.t !== 'unit') continue
    const kind = p0.t === 'unit' ? 'note-mark' : p0.kind
    const byLine = new Map<number, Ink>()
    // (its glyphs that are ink, by their paint (isInk over frameGlyph's reading), each across its advance and up and down to its
    // font's band and its own ink's, whichever reaches further: a big delimiter's outline past its font's band)
    const shown = [...(mem.turnedEls.get(id) ?? [])]
      .sort((x, y) => x[1] - y[1])
      .map(([, j]) => ({ j, t: T[j]!, g: frameGlyph(T[j]!, ux, uy) }))
      .filter(({ g }) => isInk(g))
    for (const { j, t, g } of shown) {
      const q = lineOf.get(j)
      if (q === undefined) continue
      const lo = Math.min(g.bottom, g.y + (t.down ?? t.descent) * t.size),
        hi = Math.max(g.top, g.y + (t.up ?? t.ascent) * t.size)
      const was = byLine.get(q)
      byLine.set(q, [
        p,
        r2(Math.min(was?.[1] ?? g.x0, g.x0)),
        r2(Math.min(was?.[2] ?? lo, lo)),
        r2(Math.max(was?.[3] ?? g.x1, g.x1)),
        r2(Math.max(was?.[4] ?? hi, hi)),
        mem.lines[q]![4],
      ])
    }
    const ink: Ink[] = [...byLine.entries()].sort((a, b) => a[0] - b[0]).map(([, k]) => k)
    for (const [ap, ai] of mem.elBoxes.get(id) ?? []) {
      const pg = inkA.pages[ap - 1]!
      if ((pg.kinds[ai] as number) === -4) continue
      const [x0, y0, x1, y1] = boxToFrame(ux, uy, pg.boxes.slice(4 * ai, 4 * ai + 4))
      const j = standsOn(mem.lines, ap, y0, y1, y0)
      const hit = j >= 0 ? byLine.get(j) : undefined
      if (hit) {
        hit[1] = r2(Math.min(hit[1], x0))
        hit[2] = r2(Math.min(hit[2], y0))
        hit[3] = r2(Math.max(hit[3], x1))
        hit[4] = r2(Math.max(hit[4], y1))
      } else ink.push([ap, r2(x0), r2(y0), r2(x1), r2(y1), j >= 0 ? mem.lines[j]![4] : r2(y0)])
    }
    const el: El = { kind, ink }
    if (classOf.get(id)?.end) el.end = 1
    // (a class the typesetter draws as the page's text where its glyphs are its reading (a citation, a reference, a paper's
    // macro: geometry.ts's TEXT_CLASSES), drawn here as its crop: its copy text its glyphs' as a level element's text is read
    // (facts.ts textOf), what selecting and copying the crop gives, never the source's reading of the command ("?", "[·]"))
    const cls = classOf.get(id)?.cls
    if (shown.length && cls !== undefined && TEXT_CLASSES.has(cls)) el.copy = textOf(shown.map(({ g }) => g))
    // (a symbol, drawn as its reading's character, only where its turned ink is that symbol so drawn: no letter or digit among
    // its glyphs, each on its line's baseline, or over it where its reading raises it; else drawn as its ink, a formula's, as
    // geometry.ts reads a level element: Member.asInk)
    const sym = classOf.get(id)?.sym
    if (
      cls === 'symbol' &&
      shown.length &&
      (shown.some(({ g }) => /[A-Za-z0-9]/.test(g.u)) ||
        !shown.every(({ j, g }) => {
          const q = lineOf.get(j)
          if (q === undefined || g.blank) return true
          const base = mem.lines[q]![4]
          return sym?.[1] ? g.y > base + ON_BASE : Math.abs(g.y - base) <= ON_BASE
        }))
    ) {
      mem.asInk ??= new Set()
      mem.asInk.add(id)
    }
    const key = `${mem.unit}|${id}`
    const stated = classOf.get(id)?.cls ?? kind
    if (!ink.length && INKED_CLASSES.has(stated)) {
      if (emptyPiece.has(key)) el.text = ''
      else if (outsidePiece.has(key)) el.keep = 1
    } else if (!ink.length && (stated === 'symbol' || stated === 'space') && outsidePiece.has(key)) el.keep = 1
    mem.elements.push([id, el])
  }
}

/** a framed member's label read in its frame as a level member's is (geometry.ts, facts-pass.ts readLabel): its glyphs' line,
 *  its kind, its style, the line of its own it stands on, its name, number and punctuation (facts.ts labelParts), what the
 *  structural-names rule draws it anew by in the target's words (PDF-READER §19.11) */
function frameLabel(w: Work, mem: Member, p: number, ux: number, uy: number) {
  if (!mem.turnedLabel.length) return
  const T = w.ix.inkA.pages[p - 1]!.turned!
  const order = [...mem.turnedLabel].sort((a, b) => a[1] - b[1])
  const lg = order.map(([, j]) => frameGlyph(T[j]!, ux, uy))
  const L = cutLines(
    lg.map((_, i) => i),
    (i) => ({ page: p, g: lg[i]! }),
  )[0]
  if (!L) return
  const on = standsOn(mem.lines, p, L.bottom, L.top, L.base)
  mem.labelAt = {
    kind: LABEL_KIND[mem.kind] ?? 'number',
    ink: [p, r2(L.x0), r2(L.bottom), r2(L.x1), r2(L.top), L.base],
    style: styleOf(
      order.map(([, j]) => turnedStyleGlyph(T[j]!)),
      L.most,
    ),
    ...(on >= 0 ? { line: on } : {}),
    ...labelParts(lg, p),
  }
  // (a label TeX set on a line of its own (IEEEtran's "TABLE I" over its caption): that line's alignment against the member's
  // measure in the frame, read as facts-pass.ts readLabelLine reads a level one's (centred by alignOf; flush right where it
  // ends at the measure's end and starts within it; else flush left): the typesetter lays its relabel as a row of its own)
  const first = mem.lines[0]
  if (on < 0 && first) {
    const lb = mem.labelAt
    const [m0, m1] = [first[7], first[8]]
    const l = [p, 0, lb.ink[1], lb.ink[3], lb.ink[5], lb.ink[4], lb.ink[2], m0, m1, 0] as Line
    const size = lb.style.size > 0 ? lb.style.size : 10
    lb.align =
      alignOf(
        [l],
        () => size,
        () => [m0, m1],
      ) === 'c'
        ? 'c'
        : Math.abs(l[3] - m1) <= CENTRE && l[2] - m0 > INSET * size
          ? 'r'
          : 'l'
  }
}

/** a member held out of the page's readings to be read in its frame: its page and its turn */
export type Held = { mem: Member; page: number; dir: [number, number] }

/**
 * Phase 1b, right after the members are placed: each member to be framed held out of the page's readings (its `located`
 * false until phase 16, so that no reading of the level page's lines, columns, measures, rooms, flows, ties or links meets
 * it). A turned unit that cannot be framed stays the original's with its reason (`turned: two pages`, `turned: two turns`)
 */
export function holdTurned(w: Work): Held[] {
  const { inkA } = w.ix
  const held: Held[] = []
  for (const mem of w.members) {
    if (!mem.located || mem.figure || mem.fixed || !mem.turned.length || mem.text.length || mem.name !== undefined)
      continue
    const pages = new Set(mem.turned.map(([p]) => p))
    if (pages.size !== 1) {
      mem.located = false
      mem.cause = 'turned: two pages'
      continue
    }
    const p = [...pages][0]!
    const T = inkA.pages[p - 1]!.turned!
    const set = mem.turned.map(([, j]) => T[j]!).filter((t) => /\S/.test(t.u))
    const [ux, uy] = [set[0]!.ux, set[0]!.uy]
    if (set.some((t) => Math.abs(t.ux - ux) > TURN_SAME || Math.abs(t.uy - uy) > TURN_SAME)) {
      mem.located = false
      mem.cause = 'turned: two turns'
      continue
    }
    mem.located = false
    held.push({ mem, page: p, dir: [ux, uy] })
  }
  return held
}

/**
 * Phase 16, after every reading of the page: each held member located again, read in its frame — its style off its turned
 * glyphs (geometry.ts's reading of a turned run's), its lines, lead, measure and room there — and its turn stated
 * (Member.frame); put in its page's frame of that turn (Located.frames: its own flow, the cells of one table of that frame
 * tied as the page's are, by TeX's grid)
 */
export function frameTurned(w: Work, held: readonly Held[]): Located['frames'] {
  const { inkA } = w.ix
  const frames: Located['frames'] = []
  const tables = new Map<Located['frames'][number], Map<number, Map<number, number[]>>>()
  for (const { mem, page: p, dir } of held) {
    const [ux, uy] = dir
    mem.located = true
    const unit = mem.unit >= 0 ? w.units[mem.unit] : undefined
    const own = mem.turned.map(([ap, aj]) => turnedStyleGlyph(inkA.pages[ap - 1]!.turned![aj]!))
    const txt = own.filter((g) => /\S/.test(g.u))
    const source = unit && unit.name === undefined ? sourceText(unit.content) : null
    const caps = fakedCaps(txt, source, mem.kind.startsWith('ink'))
    const read = unitSize(caps.small.size ? txt.filter((g) => !caps.small.has(g)) : txt)
    const size = read ?? mostOf(txt.map((g) => r2(g.size))) ?? 10
    const { upper: _upper, ...read0 } = styleOf(own, size, source)
    void _upper
    mem.style = {
      ...read0,
      size,
      ...(caps.upper ? { upper: 1 as const } : {}),
      ...(caps.ratio !== undefined ? { sc: caps.ratio } : {}),
      ...(caps.caps ? { caps: 1 as const } : {}),
    }
    const { lineOf, ...facts } = frameFacts(inkA, mem, p, ux, uy)
    Object.assign(mem, facts)
    frameElements(w, mem, p, ux, uy, lineOf)
    frameLabel(w, mem, p, ux, uy)
    if (mem.lines.length === 1 && mem.lead === 12) mem.lead = r2(1.2 * size)
    mem.read.push('measure')
    mem.frame = [ux, uy]
    mem.pages = [p]
    let f = frames.find(
      (x) => x.page === p && Math.abs(x.dir[0] - ux) <= TURN_SAME && Math.abs(x.dir[1] - uy) <= TURN_SAME,
    )
    if (!f) {
      f = { page: p, dir: [ux, uy], flows: [], ties: [] }
      frames.push(f)
    }
    f.flows.push([mem.ord])
    if (unit?.cell) {
      const ts = tables.get(f) ?? tables.set(f, new Map()).get(f)!
      const t = ts.get(unit.cell.table) ?? ts.set(unit.cell.table, new Map()).get(unit.cell.table)!
      const key = unit.cell.row * 4096 + unit.cell.col
      ;(t.get(key) ?? t.set(key, []).get(key)!).push(mem.ord)
    }
  }
  for (const [f, ts] of tables)
    for (const cells of ts.values())
      f.ties.push({ rule: 'cells', cells: [...cells].sort((x, y) => x[0] - y[0]).map(([, o]) => o) })
  // (each was the one member of a flow of its own (phase 13 gives a member not located none it shares) and of no tie: its flow
  // goes, the page's flows hold what its part lays)
  const out = new Set(held.map((h) => h.mem.ord))
  if (out.size) {
    const flows = field(w, 'flows')
    for (let i = flows.length - 1; i >= 0; i--) {
      flows[i] = flows[i]!.filter((o) => !out.has(o))
      if (!flows[i]!.length) flows.splice(i, 1)
    }
  }
  return frames
}
