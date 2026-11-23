// A unit whose text TeX set turned, in its frame (docs/PDF-READER.md §18.108): TeX sets a box LEVEL and then turns it
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
import type { Line, Room } from '@readarxiv/format'
import type { Doc } from '../doc.ts'
import { fakedCaps, mostOf, sourceText, styleOf, turnedStyleGlyph, unitSize } from './facts.ts'
import { field, type Located, type Member, type Work } from './work.ts'

/** two turned glyphs are set in one turn where their directions' components agree within this (own/own.ts TURN_SAME's) */
const TURN_SAME = 1e-3
/** two glyphs stand on one line of a frame where their baselines are within this share of their size (lines.ts's) */
const ON_LINE = 0.5
const r2 = (v: number) => Math.round(v * 100) / 100

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

/** a framed member's glyph in its frame: along its line from its origin to its advance's end, its baseline, its band, its size */
type FrameGlyph = { x0: number; x1: number; y: number; top: number; bottom: number; size: number; blank: boolean }

/** every box of ink on page `p` of A in the frame of direction (ux, uy), but the member's own turned glyphs (`mine`): its level
 *  glyphs' boxes, its other turned glyphs' bands, its painted boxes (a rule, an image, a fill) */
function inkBoxesOf(
  inkA: Doc,
  p: number,
  ux: number,
  uy: number,
  mine: ReadonlySet<number>,
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
    if ((pg.kinds[b] as number) === -4) continue
    out.push(boxToFrame(ux, uy, pg.boxes.slice(4 * b, 4 * b + 4)))
  }
  return out
}

/** a framed member's lines in its frame (its glyphs in stream order, cut where the baseline moves), its lead, its measure and
 *  its room: what the typesetter reads of any member, read here in the frame */
function frameFacts(
  inkA: Doc,
  mem: Member,
  p: number,
  ux: number,
  uy: number,
): Pick<Member, 'lines' | 'lead' | 'room'> {
  const T = inkA.pages[p - 1]!.turned!
  const gs: FrameGlyph[] = [...mem.turned]
    .sort((a, b) => a[1] - b[1])
    .map(([, j]) => {
      const t = T[j]!
      const [x0, y] = toFrame(ux, uy, t.ox, t.oy)
      const [x1] = toFrame(ux, uy, t.ex, t.ey)
      return {
        x0: Math.min(x0, x1),
        x1: Math.max(x0, x1),
        y,
        top: y + t.ascent * t.size,
        bottom: y + t.descent * t.size,
        size: t.size,
        blank: !/\S/.test(t.u),
      }
    })
  const runs: FrameGlyph[][] = []
  for (const g of gs) {
    const last = runs.at(-1),
      ref = last?.find((x) => !x.blank) ?? last?.[0]
    if (ref && Math.abs(ref.y - g.y) < ON_LINE * Math.max(ref.size, g.size)) last!.push(g)
    else runs.push([g])
  }
  const lines = runs
    .map((l) => l.filter((g) => !g.blank))
    .filter((l) => l.length)
    .map((l) => ({
      x0: Math.min(...l.map((g) => g.x0)),
      x1: Math.max(...l.map((g) => g.x1)),
      base: l[0]!.y,
      top: Math.max(...l.map((g) => g.top)),
      bottom: Math.min(...l.map((g) => g.bottom)),
      size: Math.max(...l.map((g) => g.size)),
    }))
  // (its measure: its lines' extent, read on A as for a unit TeX states none of; its lead: its lines' step, else its own)
  const m0 = Math.min(...lines.map((l) => l.x0)),
    m1 = Math.max(...lines.map((l) => l.x1))
  const steps = lines.slice(1).map((l, k) => lines[k]!.base - l.base)
  const lead = steps.length ? r2([...steps].sort((a, b) => a - b)[steps.length >> 1]!) : mem.lead
  // (its room in the frame: along its lines to the nearest ink on their band before and after them; under its last line to the
  // nearest ink across its measure)
  const others = inkBoxesOf(inkA, p, ux, uy, new Set(mem.turned.map(([, j]) => j)))
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
    Object.assign(mem, frameFacts(inkA, mem, p, ux, uy))
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
