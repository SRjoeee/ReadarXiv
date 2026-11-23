// A unit whose text TeX set turned, in its frame (docs/PDF-READER.md §18.108): TeX sets a box LEVEL and then turns it
// (\rotatebox, `sideways`, `sidewaystable`, a landscape float), so the unit is stated as it stands in its box, unturned: its
// lines, its leading, its measure and its room read off its glyphs and the page's ink seen through the inverse of its turn,
// and the turn beside them (Located.frames, Part.frames). The typesetter lays it there as it lays any unit of its kind and
// the reader draws it through the turn; nothing of it is read in the page's own axes. Locate's last phase (16): the members
// are placed, their flows and ties made, their links read; a framed member leaves the page's flows and ties for its frame's.
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

/**
 * Phase 16: each framed member's facts read in its frame and its turn stated (Member.frame); its ord taken off the page's
 * flows and ties into its page's frame of that turn (Located.frames: its own flow, a tie whose members are all of the frame
 * with it). A turned unit that is not framed stays the original's with its reason
 */
export function frameTurned(w: Work): Located['frames'] {
  const { inkA } = w.ix
  const flows = field(w, 'flows'),
    ties = field(w, 'ties')
  const frames: Located['frames'] = []
  const frameOf = new Map<number, Located['frames'][number]>()
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
    Object.assign(mem, frameFacts(inkA, mem, p, ux, uy))
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
    frameOf.set(mem.ord, f)
  }
  // (a turned unit not framed is in no flow either: the page's flows hold what its part lays)
  const out = new Set(w.members.filter((m) => m.turned.length && !m.figure && !m.located).map((m) => m.ord))
  for (const o of frameOf.keys()) out.add(o)
  if (!out.size) return frames
  for (let i = flows.length - 1; i >= 0; i--) {
    flows[i] = flows[i]!.filter((o) => !out.has(o))
    if (!flows[i]!.length) flows.splice(i, 1)
  }
  for (let i = ties.length - 1; i >= 0; i--) {
    const t = ties[i]!
    const ords = t.rule === 'cells' ? t.cells.flat() : t.ords
    const fs = new Set(ords.map((o) => frameOf.get(o)))
    // (a tie whose members are all of one frame: that frame's; else its framed members leave it)
    if (fs.size === 1 && !fs.has(undefined)) {
      ;[...fs][0]!.ties.push(t)
      ties.splice(i, 1)
      continue
    }
    if (t.rule === 'cells') {
      t.cells = t.cells.map((row) => row.filter((o) => !out.has(o))).filter((row) => row.length)
      if (!t.cells.length) ties.splice(i, 1)
    } else {
      t.ords = t.ords.filter((o) => !out.has(o))
      if (t.ords.length < 2) ties.splice(i, 1)
    }
  }
  return frames
}
